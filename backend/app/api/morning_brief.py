"""Morning Brief endpoints for ingesting research signals and creating approval-gated tasks."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import col, select

from app.api.deps import get_board_for_actor_read, get_board_for_user_write, require_admin_auth
from app.core.time import utcnow
from app.db.session import get_session
from app.models.approvals import Approval
from app.models.board_memory import BoardMemory
from app.models.boards import Board
from app.models.tasks import Task
from app.schemas.tasks import TaskRead
from app.services.approval_task_links import replace_approval_task_links

router = APIRouter(prefix="/boards/{board_id}/morning-brief", tags=["tasks"])


class MorningBriefItem(BaseModel):
    source: str = Field(default="web")
    title: str
    url: str | None = None
    takeaway: str | None = None
    implementation: str | None = None
    impact_score: int = Field(default=7, ge=1, le=10)


class MorningBriefAction(BaseModel):
    title: str
    description: str | None = None
    source_url: str | None = None
    impact_score: int = Field(default=8, ge=1, le=10)
    priority: str = "medium"


class MorningBriefRunRequest(BaseModel):
    source_summary: str = "2 X + 2 web"
    items: list[MorningBriefItem] = Field(default_factory=list)
    top_actions: list[MorningBriefAction] = Field(default_factory=list)
    max_tasks: int = Field(default=3, ge=1, le=10)


class MorningBriefLatestResponse(BaseModel):
    generated_at: datetime | None = None
    source_summary: str | None = None
    items: list[dict[str, Any]] = Field(default_factory=list)
    top_actions: list[dict[str, Any]] = Field(default_factory=list)


@router.get("/latest", response_model=MorningBriefLatestResponse)
async def get_latest_morning_brief(
    board: Board = Depends(get_board_for_actor_read),
    session=Depends(get_session),
) -> MorningBriefLatestResponse:
    stmt = (
        select(BoardMemory)
        .where(col(BoardMemory.board_id) == board.id)
        .where(col(BoardMemory.source) == "morning_brief_v1")
        .order_by(col(BoardMemory.created_at).desc())
        .limit(1)
    )
    row = (await session.exec(stmt)).first()
    if row is None:
        return MorningBriefLatestResponse()

    try:
        payload = json.loads(row.content)
        if not isinstance(payload, dict):
            payload = {}
    except Exception:
        payload = {}

    generated_at = payload.get("generatedAt")
    parsed: datetime | None = None
    if isinstance(generated_at, str):
        try:
            parsed = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
            if parsed.tzinfo is not None:
                parsed = parsed.astimezone(UTC)
        except ValueError:
            parsed = None

    return MorningBriefLatestResponse(
        generated_at=parsed,
        source_summary=payload.get("sourceSummary") if isinstance(payload.get("sourceSummary"), str) else None,
        items=payload.get("items") if isinstance(payload.get("items"), list) else [],
        top_actions=payload.get("topActions") if isinstance(payload.get("topActions"), list) else [],
    )


@router.post("/run")
async def run_morning_brief(
    payload: MorningBriefRunRequest,
    board: Board = Depends(get_board_for_user_write),
    session=Depends(get_session),
    _auth=Depends(require_admin_auth),
) -> dict[str, Any]:
    now = utcnow()

    brief_payload = {
        "generatedAt": now.isoformat(),
        "sourceSummary": payload.source_summary,
        "items": [item.model_dump(mode="json") for item in payload.items],
        "topActions": [action.model_dump(mode="json") for action in payload.top_actions],
    }

    session.add(
        BoardMemory(
            board_id=board.id,
            content=json.dumps(brief_payload),
            tags=["morning-brief", "automation"],
            source="morning_brief_v1",
            is_chat=False,
        ),
    )

    created_tasks: list[Task] = []
    created_approval_ids: list[str] = []

    for action in payload.top_actions[: payload.max_tasks]:
        description_parts = [part for part in [action.description, action.source_url] if part]
        task = Task(
            board_id=board.id,
            title=f"Morning Brief: {action.title}",
            description="\n\n".join(description_parts) if description_parts else None,
            status="inbox",
            priority=action.priority,
            auto_created=True,
            auto_reason="morning_brief",
        )
        session.add(task)
        await session.flush()

        approval = Approval(
            board_id=board.id,
            task_id=task.id,
            action_type="task.dispatch",
            payload={
                "reason": "Auto-generated from morning brief. Requires operator approval before execution.",
                "source": "morning_brief",
                "source_summary": payload.source_summary,
            },
            confidence=float(min(max(action.impact_score * 10, 0), 100)),
            status="pending",
        )
        session.add(approval)
        await session.flush()
        await replace_approval_task_links(session, approval_id=approval.id, task_ids=[task.id])

        created_tasks.append(task)
        created_approval_ids.append(str(approval.id))

    await session.commit()

    task_reads = [TaskRead.model_validate(task, from_attributes=True).model_dump(mode="json") for task in created_tasks]
    return {
        "generatedAt": now.isoformat(),
        "createdTaskCount": len(task_reads),
        "createdApprovalCount": len(created_approval_ids),
        "createdTasks": task_reads,
        "createdApprovalIds": created_approval_ids,
    }
