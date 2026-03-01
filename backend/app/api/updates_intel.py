"""Update intelligence endpoints that surface OpenClaw update status and create approval-gated review tasks."""

from __future__ import annotations

import json
import subprocess
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_board_for_actor_read, get_board_for_user_write, require_admin_auth
from app.core.time import utcnow
from app.db.session import get_session
from app.models.approvals import Approval
from app.models.boards import Board
from app.models.tasks import Task
from app.services.approval_task_links import replace_approval_task_links

router = APIRouter(prefix="/boards/{board_id}/updates", tags=["tasks"])


class UpdateSnapshot(BaseModel):
    checked_at: datetime
    installed_version: str
    latest_version: str
    channel: str
    action_needed: bool
    summary: str
    rollback_checklist: list[str] = Field(default_factory=list)


def _run_openclaw_status_json() -> dict[str, Any]:
    try:
        result = subprocess.run(
            ["openclaw", "status", "--json"],
            capture_output=True,
            text=True,
            timeout=12,
            check=False,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return {}
        parsed = json.loads(result.stdout)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _snapshot_from_status(status_payload: dict[str, Any]) -> UpdateSnapshot:
    update = status_payload.get("update", {}) if isinstance(status_payload, dict) else {}
    gateway = status_payload.get("gateway", {}) if isinstance(status_payload, dict) else {}
    self_info = gateway.get("self", {}) if isinstance(gateway, dict) else {}
    registry = update.get("registry", {}) if isinstance(update, dict) else {}

    installed = str(self_info.get("version") or "unknown")
    latest = str(registry.get("latestVersion") or "unknown")
    channel = str(status_payload.get("updateChannel") or "stable")
    action_needed = installed != "unknown" and latest != "unknown" and installed != latest

    return UpdateSnapshot(
        checked_at=utcnow(),
        installed_version=installed,
        latest_version=latest,
        channel=channel,
        action_needed=action_needed,
        summary="Update available" if action_needed else "Up to date",
        rollback_checklist=[
            "Backup environment/config",
            "Capture pre-update health snapshot",
            "Apply update in maintenance window",
            "Run post-update smoke checks",
            "Rollback if health check fails",
        ],
    )


@router.get("/status", response_model=UpdateSnapshot)
async def get_update_status(
    _board: Board = Depends(get_board_for_actor_read),
) -> UpdateSnapshot:
    payload = _run_openclaw_status_json()
    return _snapshot_from_status(payload)


@router.post("/check-and-create")
async def check_and_create_update_review_task(
    board: Board = Depends(get_board_for_user_write),
    session=Depends(get_session),
    _auth=Depends(require_admin_auth),
) -> dict[str, Any]:
    snapshot = _snapshot_from_status(_run_openclaw_status_json())

    if not snapshot.action_needed:
        return {
            "snapshot": snapshot.model_dump(mode="json"),
            "created": False,
            "reason": "No update action needed",
        }

    task = Task(
        board_id=board.id,
        title=f"OpenClaw update review: {snapshot.installed_version} -> {snapshot.latest_version}",
        description="Review changelog, risks, and rollback checklist before applying update.",
        status="inbox",
        priority="high",
        auto_created=True,
        auto_reason="update_check",
    )
    session.add(task)
    await session.flush()

    approval = Approval(
        board_id=board.id,
        task_id=task.id,
        action_type="task.dispatch",
        payload={
            "reason": "Update detected. Requires operator approval before rollout.",
            "rollback_checklist": snapshot.rollback_checklist,
        },
        confidence=85.0,
        status="pending",
    )
    session.add(approval)
    await session.flush()
    await replace_approval_task_links(session, approval_id=approval.id, task_ids=[task.id])
    await session.commit()

    return {
        "snapshot": snapshot.model_dump(mode="json"),
        "created": True,
        "taskId": str(task.id),
        "approvalId": str(approval.id),
    }
