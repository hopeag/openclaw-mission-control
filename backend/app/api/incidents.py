"""Incident learning endpoints: log mistakes and prevention rules per board."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import col, select

from app.api.deps import get_board_for_actor_read, get_board_for_user_write, require_admin_auth
from app.core.time import utcnow
from app.db.session import get_session
from app.models.board_memory import BoardMemory
from app.models.boards import Board

router = APIRouter(prefix="/boards/{board_id}/incidents", tags=["activity"])

INCIDENT_SOURCE = "incident_v1"


class IncidentCreate(BaseModel):
    what_happened: str = Field(min_length=3)
    root_cause: str = Field(min_length=3)
    fix_applied: str = Field(min_length=3)
    prevention_rule: str = Field(min_length=3)
    owner: str = Field(default="operator")
    status: str = Field(default="open")


@router.get("")
async def list_incidents(
    board: Board = Depends(get_board_for_actor_read),
    session=Depends(get_session),
) -> dict[str, Any]:
    stmt = (
        select(BoardMemory)
        .where(col(BoardMemory.board_id) == board.id)
        .where(col(BoardMemory.source) == INCIDENT_SOURCE)
        .order_by(col(BoardMemory.created_at).desc())
    )
    rows = list(await session.exec(stmt))
    incidents: list[dict[str, Any]] = []
    for row in rows:
        try:
            payload = json.loads(row.content)
            if not isinstance(payload, dict):
                continue
        except Exception:
            continue
        incidents.append(
            {
                "incident_id": str(row.id),
                "date": row.created_at.astimezone(UTC).isoformat() if row.created_at else None,
                "what_happened": payload.get("what_happened"),
                "root_cause": payload.get("root_cause"),
                "fix_applied": payload.get("fix_applied"),
                "prevention_rule": payload.get("prevention_rule"),
                "owner": payload.get("owner"),
                "status": payload.get("status"),
            },
        )
    return {"items": incidents}


@router.post("")
async def create_incident(
    payload: IncidentCreate,
    board: Board = Depends(get_board_for_user_write),
    session=Depends(get_session),
    _auth=Depends(require_admin_auth),
) -> dict[str, Any]:
    now = utcnow()
    content = json.dumps(payload.model_dump(mode="json"))
    row = BoardMemory(
        board_id=board.id,
        content=content,
        tags=["incident", "learning"],
        source=INCIDENT_SOURCE,
        is_chat=False,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return {
        "incident_id": str(row.id),
        "date": now.isoformat(),
        **payload.model_dump(mode="json"),
    }


@router.delete("/{incident_id}")
async def delete_incident(
    incident_id: UUID,
    board: Board = Depends(get_board_for_user_write),
    session=Depends(get_session),
    _auth=Depends(require_admin_auth),
) -> dict[str, Any]:
    stmt = (
        select(BoardMemory)
        .where(col(BoardMemory.id) == incident_id)
        .where(col(BoardMemory.board_id) == board.id)
        .where(col(BoardMemory.source) == INCIDENT_SOURCE)
    )
    row = (await session.exec(stmt)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    await session.delete(row)
    await session.commit()
    return {"ok": True, "deleted": str(incident_id)}
