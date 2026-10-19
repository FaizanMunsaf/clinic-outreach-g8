from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
import json

from app.deps import CurrentUser, DbSession, log_activity
from app.graph8_client import call_tool

router = APIRouter(prefix="/inbox", tags=["inbox"])

CLINIC_REPLY_FALLBACK = (
    "Hi {{first_name}},\n\n"
    "Thank you for getting back to us about {{company}}.\n\n"
    "Happy to share a short overview of how ClinicReach helps Practice Admins "
    "and Office Managers with referral outreach and scheduling capacity — "
    "without adding front-desk load.\n\n"
    "Would a 15-minute intro this week work on your side?\n\n"
    "Best regards,\n"
    "ClinicReach\n"
    "Medical practice outreach desk"
)


class SendReplyBody(BaseModel):
    body: str = Field(..., min_length=1)
    channel: str = Field(default="email")
    subject: str | None = None
    to: str | None = None
    from_address: str | None = None
    confirm: bool = False


def _inner(result: object) -> dict:
    if isinstance(result, dict):
        r = result.get("result")
        if isinstance(r, dict):
            return r
        if isinstance(r, str):
            try:
                parsed = json.loads(r)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass
        return result
    return {}


def _normalize_inbox(raw: object) -> dict:
    inner = _inner(raw)
    threads = (
        inner.get("threads")
        or inner.get("items")
        or inner.get("replies")
        or inner.get("inbox")
        or []
    )
    if not isinstance(threads, list):
        threads = []
    return {
        "result": {
            "threads": threads,
            "total": inner.get("total", len(threads)),
            "page": inner.get("page", 1),
            "limit": inner.get("limit") or inner.get("page_size"),
            "has_next": inner.get("has_next", False),
        }
    }


def _extract_draft(raw: object) -> dict:
    inner = _inner(raw)
    body = (
        inner.get("body")
        or inner.get("draft")
        or inner.get("content")
        or inner.get("text")
        or ""
    )
    subject = inner.get("subject") or inner.get("subject_line") or ""
    if not isinstance(body, str) or not body.strip():
        body = CLINIC_REPLY_FALLBACK
    if not isinstance(subject, str) or not subject.strip():
        subject = "Re: {{company}} — ClinicReach intro"
    return {
        "subject": subject,
        "body": body,
        "channel": inner.get("channel") or "email",
        "raw": raw,
    }


@router.get("")
async def list_inbox(
    user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    channel: str | None = Query(None),
):
    args: dict = {"page": page, "page_size": page_size}
    if channel:
        args["channel"] = channel
    last_exc: Exception | None = None
    for _ in range(2):
        try:
            result = await call_tool("g8_list_inbox", args)
            log_activity(db, user.id, "inbox.list", {"channel": channel})
            return _normalize_inbox(result)
        except Exception as exc:
            last_exc = exc
    raise HTTPException(status_code=502, detail=str(last_exc)) from last_exc


@router.post("/{reply_id}/draft")
async def draft_reply(
    reply_id: str,
    user: CurrentUser,
    db: DbSession,
    channel: str = Query("email"),
):
    """Generate an AI draft (or clinic fallback). Does not send."""
    try:
        result = await call_tool(
            "g8_get_reply_draft",
            {"reply_id": reply_id, "channel": channel},
        )
        draft = _extract_draft(result)
        log_activity(db, user.id, "inbox.draft", {"reply_id": reply_id, "channel": channel})
        return {"result": draft}
    except Exception as exc:
        # Still return editable clinic copy so the user can review before send
        fallback = {
            "subject": "Re: clinic intro — ClinicReach",
            "body": CLINIC_REPLY_FALLBACK,
            "channel": channel,
            "fallback": True,
            "error": str(exc),
        }
        log_activity(
            db,
            user.id,
            "inbox.draft_fallback",
            {"reply_id": reply_id, "error": str(exc)[:300]},
        )
        return {"result": fallback}


@router.post("/{reply_id}/send")
async def send_reply(
    reply_id: str,
    body: SendReplyBody,
    user: CurrentUser,
    db: DbSession,
):
    """Send a real reply — requires confirm=true. Supports email / sms / phone."""
    if not body.confirm:
        raise HTTPException(
            status_code=400,
            detail="Sending a real reply requires confirm=true",
        )
    channel = (body.channel or "email").lower()
    args: dict = {
        "reply_id": reply_id,
        "body": body.body,
        "channel": channel,
    }
    if body.subject:
        args["subject"] = body.subject
    if body.to:
        args["to"] = body.to
    if body.from_address:
        args["from_address"] = body.from_address
    try:
        result = await call_tool("g8_send_reply", args)
        log_activity(
            db,
            user.id,
            "inbox.send",
            {"reply_id": reply_id, "channel": channel},
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
