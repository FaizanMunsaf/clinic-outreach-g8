from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.deps import CurrentUser, DbSession, log_activity
from app.graph8_client import call_tool

router = APIRouter(prefix="/inbox", tags=["inbox"])


class SendReplyBody(BaseModel):
    body: str = Field(..., min_length=1)
    channel: str = Field(default="email")
    subject: str | None = None
    to: str | None = None
    from_address: str | None = None
    confirm: bool = False


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
    try:
        result = await call_tool("g8_list_inbox", args)
        log_activity(db, user.id, "inbox.list", {})
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/{reply_id}/draft")
async def draft_reply(
    reply_id: str,
    user: CurrentUser,
    db: DbSession,
    channel: str = Query("email"),
):
    """Generate an AI draft (charges credits). Does not send."""
    try:
        result = await call_tool(
            "g8_get_reply_draft",
            {"reply_id": reply_id, "channel": channel},
        )
        log_activity(db, user.id, "inbox.draft", {"reply_id": reply_id})
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/{reply_id}/send")
async def send_reply(
    reply_id: str,
    body: SendReplyBody,
    user: CurrentUser,
    db: DbSession,
):
    """Send a real reply — requires confirm=true."""
    if not body.confirm:
        raise HTTPException(
            status_code=400,
            detail="Sending a real reply requires confirm=true",
        )
    args: dict = {
        "reply_id": reply_id,
        "body": body.body,
        "channel": body.channel,
    }
    if body.subject:
        args["subject"] = body.subject
    if body.to:
        args["to"] = body.to
    if body.from_address:
        args["from_address"] = body.from_address
    try:
        result = await call_tool("g8_send_reply", args)
        log_activity(db, user.id, "inbox.send", {"reply_id": reply_id})
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
