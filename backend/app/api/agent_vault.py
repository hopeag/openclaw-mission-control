"""Per-agent knowledge vault API for document storage and retrieval."""

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

router = APIRouter(prefix="/agents/{agent_id}/vault", tags=["agents"])


class VaultDocUpsert(BaseModel):
    name: str = Field(min_length=1)
    content: str = Field(min_length=1)


def _workspace_root() -> Path:
    override = getattr(settings, "agent_workspace_root", None)
    root = Path(override) if override else (Path.home() / ".openclaw" / "workspace")
    return root


def _vault_root(agent_id: str) -> Path:
    root = _workspace_root() / "vault" / agent_id / "docs"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_doc_name(name: str) -> str:
    clean = name.strip()
    if not clean or ".." in clean or "/" in clean or "\\" in clean:
        raise HTTPException(status_code=400, detail="Invalid doc name")
    return clean


async def _ensure_agent_exists(session, agent_id: str) -> Agent:
    stmt = select(Agent).where(col(Agent.id) == agent_id)
    agent = (await session.exec(stmt)).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.get("/docs")
async def list_docs(
    agent_id: str,
    _ctx: OrganizationContext = Depends(require_org_admin),
    session=Depends(get_session),
) -> dict[str, Any]:
    await _ensure_agent_exists(session, agent_id)
    root = _vault_root(agent_id)
    docs = []
    for p in sorted(root.glob("*")):
        if not p.is_file():
            continue
        docs.append(
            {
                "name": p.name,
                "size": p.stat().st_size,
                "updatedAt": datetime.fromtimestamp(p.stat().st_mtime, tz=UTC).isoformat(),
            },
        )
    return {"agentId": agent_id, "docs": docs}


@router.post("/docs")
async def upsert_doc(
    agent_id: str,
    payload: VaultDocUpsert,
    _ctx: OrganizationContext = Depends(require_org_admin),
    session=Depends(get_session),
) -> dict[str, Any]:
    await _ensure_agent_exists(session, agent_id)
    name = _safe_doc_name(payload.name)
    root = _vault_root(agent_id)
    target = root / name
    target.write_text(payload.content, encoding="utf-8")
    return {"ok": True, "agentId": agent_id, "name": name}


@router.get("/search")
async def search_docs(
    agent_id: str,
    q: str = Query(..., min_length=1),
    _ctx: OrganizationContext = Depends(require_org_admin),
    session=Depends(get_session),
) -> dict[str, Any]:
    await _ensure_agent_exists(session, agent_id)
    root = _vault_root(agent_id)
    needle = q.lower()
    results = []
    for p in sorted(root.glob("*")):
        if not p.is_file():
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        idx = text.lower().find(needle)
        if idx < 0:
            continue
        start = max(0, idx - 100)
        end = min(len(text), idx + 160)
        snippet = text[start:end].replace("\n", " ")
        results.append({"name": p.name, "snippet": snippet, "score": 0.9})
        if len(results) >= 20:
            break
    return {"agentId": agent_id, "query": q, "results": results}


@router.delete("/docs/{name}")
async def delete_doc(
    agent_id: str,
    name: str,
    _ctx: OrganizationContext = Depends(require_org_admin),
    session=Depends(get_session),
) -> dict[str, Any]:
    await _ensure_agent_exists(session, agent_id)
    safe = _safe_doc_name(name)
    p = _vault_root(agent_id) / safe
    if not p.exists():
        raise HTTPException(status_code=404, detail="Doc not found")
    p.unlink()
    return {"ok": True, "deleted": safe}
