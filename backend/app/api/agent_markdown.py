"""Agent markdown studio API: list/read/write markdown files with safe path guards."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import col, select

from app.api.deps import require_org_admin
from app.core.config import settings
from app.db.session import get_session
from app.models.agents import Agent
from app.services.organizations import OrganizationContext

router = APIRouter(prefix="/agents/{agent_id}/markdown", tags=["agents"])


class MarkdownUpdateRequest(BaseModel):
    path: str = Field(min_length=1)
    content: str = ""


def _workspace_root() -> Path:
    override = getattr(settings, "agent_workspace_root", None)
    root = Path(override) if override else (Path.home() / ".openclaw" / "workspace")
    return root


def _agent_base(agent_id: str) -> Path:
    base = _workspace_root()
    specific = base / "agents" / agent_id
    return specific if specific.exists() else base


def _safe_markdown_path(base: Path, rel: str) -> Path:
    cleaned = rel.replace("\\", "/").strip().lstrip("/")
    if ".." in cleaned:
        raise HTTPException(status_code=400, detail="Invalid path")
    path = (base / cleaned).resolve()
    if not str(path).startswith(str(base.resolve())):
        raise HTTPException(status_code=400, detail="Path escapes workspace")
    if path.suffix.lower() != ".md":
        raise HTTPException(status_code=400, detail="Only markdown files are supported")
    return path


async def _ensure_agent_exists(session, agent_id: str) -> Agent:
    stmt = select(Agent).where(col(Agent.id) == agent_id)
    agent = (await session.exec(stmt)).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.get("")
async def list_markdown_files(
    agent_id: str,
    _ctx: OrganizationContext = Depends(require_org_admin),
    session=Depends(get_session),
) -> dict[str, Any]:
    await _ensure_agent_exists(session, agent_id)
    base = _agent_base(agent_id)
    files: list[str] = []
    for p in sorted(base.rglob("*.md")):
        rel = p.relative_to(base).as_posix()
        if rel.startswith(".openclaw/"):
            continue
        files.append(rel)
        if len(files) >= 200:
            break
    return {"agentId": agent_id, "files": files}


@router.get("/content")
async def get_markdown_content(
    agent_id: str,
    path: str = Query(..., min_length=1),
    _ctx: OrganizationContext = Depends(require_org_admin),
    session=Depends(get_session),
) -> dict[str, Any]:
    await _ensure_agent_exists(session, agent_id)
    base = _agent_base(agent_id)
    target = _safe_markdown_path(base, path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    content = target.read_text(encoding="utf-8", errors="replace")
    updated_at = datetime.fromtimestamp(target.stat().st_mtime, tz=UTC).isoformat()
    return {"agentId": agent_id, "path": path, "content": content, "updatedAt": updated_at}


@router.put("/content")
async def put_markdown_content(
    agent_id: str,
    payload: MarkdownUpdateRequest,
    _ctx: OrganizationContext = Depends(require_org_admin),
    session=Depends(get_session),
) -> dict[str, Any]:
    await _ensure_agent_exists(session, agent_id)
    base = _agent_base(agent_id)
    target = _safe_markdown_path(base, payload.path)

    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        hist = base / ".openclaw" / "markdown-history"
        hist.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
        backup = hist / f"{target.name}.{ts}.bak.md"
        backup.write_text(target.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")

    target.write_text(payload.content, encoding="utf-8")
    return {"ok": True, "agentId": agent_id, "path": payload.path}
