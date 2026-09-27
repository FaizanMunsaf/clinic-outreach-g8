from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.deps import CurrentUser, DbSession, log_activity
from app.graph8_client import call_tool
from app.models import CampaignAction
import json

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


class CreateCampaignBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    audience_list_id: str | None = None
    brief: str | None = "Clinic outreach campaign from ClinicReach"
    goal: str | None = "Book intro meetings with practice decision-makers"
    target_persona: str | None = "Practice Admin / Office Manager"
    auto_generate_documents: bool = True


class LaunchBody(BaseModel):
    dry_run: bool = True
    confirm: bool = False


@router.get("")
async def list_campaigns(
    user: CurrentUser,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
):
    try:
        return await call_tool(
            "g8_gtm_list_campaigns",
            {"page": page, "limit": limit},
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("")
async def create_campaign(body: CreateCampaignBody, user: CurrentUser, db: DbSession):
    args: dict = {
        "name": body.name,
        "category": "Outbound",
        "brief": body.brief,
        "goal": body.goal,
        "target_persona": body.target_persona,
        "target_channels": ["email"],
        "auto_generate_documents": body.auto_generate_documents,
    }
    if body.audience_list_id:
        args["audience_list_id"] = body.audience_list_id
    try:
        result = await call_tool("g8_gtm_create_campaign", args)
        campaign_id = None
        if isinstance(result, dict):
            inner = result.get("result") if isinstance(result.get("result"), dict) else result
            if isinstance(inner, dict):
                campaign_id = inner.get("id") or inner.get("campaign_id")
        db.add(
            CampaignAction(
                user_id=user.id,
                graph8_campaign_id=str(campaign_id or body.name),
                action="create",
                payload_json=json.dumps({"name": body.name, "audience_list_id": body.audience_list_id}),
            )
        )
        db.commit()
        log_activity(db, user.id, "campaign.create", {"name": body.name, "id": campaign_id})
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/{campaign_id}/audience")
async def attach_audience(
    campaign_id: str,
    user: CurrentUser,
    list_id: str = Query(...),
):
    try:
        return await call_tool(
            "g8_gtm_attach_audience",
            {"campaign_id": campaign_id, "list_id": list_id},
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/{campaign_id}/launch")
async def launch_campaign(
    campaign_id: str,
    body: LaunchBody,
    user: CurrentUser,
    db: DbSession,
):
    """Dry-run by default. Real launch requires confirm=true and dry_run=false."""
    if not body.dry_run and not body.confirm:
        raise HTTPException(
            status_code=400,
            detail="Real launch requires confirm=true (and dry_run=false)",
        )
    try:
        result = await call_tool(
            "g8_gtm_launch_campaign",
            {"campaign_id": campaign_id, "dry_run": body.dry_run},
        )
        action = "launch_dry" if body.dry_run else "launch"
        db.add(
            CampaignAction(
                user_id=user.id,
                graph8_campaign_id=campaign_id,
                action=action,
                payload_json=json.dumps({"dry_run": body.dry_run}, default=str),
            )
        )
        db.commit()
        log_activity(db, user.id, f"campaign.{action}", {"campaign_id": campaign_id})
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
