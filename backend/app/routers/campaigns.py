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
    brief: str | None = (
        "Outbound clinic GTM for medical practices: reach Practice Admins and "
        "Office Managers by email, phone, and SMS about referral partnerships, "
        "patient-scheduling capacity, and practice growth."
    )
    goal: str | None = (
        "Book 15-minute intro calls with Practice Admins / Office Managers at "
        "independent clinics and specialty practices"
    )
    target_persona: str | None = (
        "Practice Administrator, Office Manager, or Clinic Manager at a "
        "medical / specialty clinic"
    )
    channels: list[str] = Field(default_factory=lambda: ["email", "phone", "sms"])
    auto_generate_documents: bool = True


class LaunchBody(BaseModel):
    dry_run: bool = True
    confirm: bool = False


class UpdateStepBody(BaseModel):
    subject: str | None = None
    body: str | None = None
    name: str | None = None


# Clinic-first multi-channel copy
DEFAULT_EMAILS = [
    {
        "subject": "{{company}} — practice ops intro?",
        "body": (
            "Hi {{first_name}},\n\n"
            "I support specialty clinics and independent practices that want a "
            "cleaner way to fill the calendar — without adding front-desk load.\n\n"
            "We help Practice Admins and Office Managers reach the right referral "
            "and partnership contacts for {{company}}.\n\n"
            "Would a short 15-minute intro next week be useful?\n\n"
            "Best regards,\n"
            "ClinicReach\n"
            "Medical practice outreach desk"
        ),
    },
    {
        "subject": "referral + scheduling idea for {{company}}",
        "body": (
            "Hi {{first_name}},\n\n"
            "Quick follow-up for the {{company}} team.\n\n"
            "Many clinics we work with are juggling referral leakage and no-shows. "
            "A focused outreach list of Practice Admins / peer clinics often opens "
            "a few warm intros without a big marketing hire.\n\n"
            "Happy to walk through a clinic-specific example if helpful.\n\n"
            "Best regards,\n"
            "ClinicReach"
        ),
    },
    {
        "subject": "15 min for {{company}} practice growth?",
        "body": (
            "Hi {{first_name}},\n\n"
            "I'll keep this brief — if growing patient volume or strengthening "
            "referral relationships is on your radar this quarter, I can show how "
            "ClinicReach runs clinic-focused outreach for Practice Admins "
            "and Office Managers.\n\n"
            "Any 15 minutes this week work on your side?\n\n"
            "Best regards,\n"
            "ClinicReach\n"
            "Built for medical practices"
        ),
    },
]

DEFAULT_PHONE = {
    "subject": "Clinic intro call",
    "body": (
        "Hi {{first_name}}, this is ClinicReach calling for {{company}}. "
        "We help Practice Admins reduce referral leakage and fill open slots "
        "with a simple outreach desk. Do you have two minutes, or should I "
        "send a short email instead?"
    ),
}

DEFAULT_SMS = {
    "subject": "ClinicReach SMS",
    "body": (
        "Hi {{first_name}} — ClinicReach here for {{company}}. "
        "Quick idea on referral + scheduling outreach for your practice. "
        "OK if I email details, or prefer a 10-min call?"
    ),
}

EXTRA_CHANNEL_STEPS = [
    {
        "name": "Phone — Practice Admin intro",
        "channel": "phone",
        "mode": "call",
        "day": 3,
        "template": DEFAULT_PHONE,
    },
    {
        "name": "SMS — clinic follow-up",
        "channel": "sms",
        "mode": "sms",
        "day": 7,
        "template": DEFAULT_SMS,
    },
]


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


def _step_view(step: dict) -> dict:
    constraints = step.get("constraints") if isinstance(step.get("constraints"), dict) else {}
    subject = constraints.get("subject") or step.get("subject") or ""
    body = constraints.get("body") or step.get("body") or ""
    return {
        "step_id": str(step.get("step_id") or step.get("id") or ""),
        "name": step.get("name"),
        "channel": step.get("channel"),
        "mode": step.get("mode"),
        "day": step.get("day"),
        "subject": subject,
        "body": body,
    }


async def _list_steps(campaign_id: str) -> list[dict]:
    seq = await call_tool("g8_gtm_get_campaign_sequence", {"campaign_id": campaign_id})
    steps = _inner(seq).get("steps") or []
    return [_step_view(s) for s in steps if isinstance(s, dict)]


async def _ensure_channel_steps(campaign_id: str, channels: set[str]) -> list[str]:
    """Create missing phone/sms steps for multi-channel clinic outreach."""
    created: list[str] = []
    existing = await _list_steps(campaign_id)
    have = {(s.get("channel") or "").lower() for s in existing}
    for spec in EXTRA_CHANNEL_STEPS:
        ch = spec["channel"]
        if ch not in channels or ch in have:
            continue
        tmpl = spec["template"]
        try:
            await call_tool(
                "g8_gtm_create_campaign_step",
                {
                    "campaign_id": campaign_id,
                    "name": spec["name"],
                    "channel": ch,
                    "mode": spec["mode"],
                    "day": spec["day"],
                    "constraints": {
                        "subject": tmpl["subject"],
                        "body": tmpl["body"],
                    },
                },
            )
            created.append(ch)
        except Exception:
            # Don't fail whole prepare if phone/SMS step can't be added
            continue
    return created


async def _prepare_campaign_copy(campaign_id: str, *, force: bool = False) -> dict:
    """Fill clinic copy for email / phone / SMS steps and return editable steps."""
    warnings: list[str] = []
    channels_wanted = {"email", "phone", "sms"}
    try:
        channel_steps_created = await _ensure_channel_steps(campaign_id, channels_wanted)
    except Exception as exc:
        channel_steps_created = []
        warnings.append(f"channel_steps: {exc}")

    try:
        seq = await call_tool("g8_gtm_get_campaign_sequence", {"campaign_id": campaign_id})
        steps_raw = _inner(seq).get("steps") or []
    except Exception as exc:
        raise RuntimeError(f"Could not load campaign sequence: {exc}") from exc

    updated: list[str] = []
    email_idx = 0

    for step in steps_raw:
        if not isinstance(step, dict):
            continue
        channel = (step.get("channel") or "").lower()
        sid = str(step.get("step_id") or step.get("id") or "")
        if not sid:
            continue
        constraints = step.get("constraints") if isinstance(step.get("constraints"), dict) else {}
        has_copy = bool((constraints.get("body") or step.get("body") or "").strip())
        if has_copy and not force:
            continue

        if channel == "email":
            template = DEFAULT_EMAILS[min(email_idx, len(DEFAULT_EMAILS) - 1)]
            email_idx += 1
        elif channel == "phone":
            template = DEFAULT_PHONE
        elif channel == "sms":
            template = DEFAULT_SMS
        else:
            continue

        try:
            await call_tool(
                "g8_gtm_update_campaign_step",
                {
                    "campaign_id": campaign_id,
                    "step_id": sid,
                    "constraints": {
                        "subject": template["subject"],
                        "body": template["body"],
                    },
                },
            )
            updated.append(sid)
        except Exception as exc:
            warnings.append(f"step {sid}: {exc}")

    # Emails document for launch checklist (best-effort)
    doc_created = False
    try:
        full = await call_tool("g8_gtm_get_campaign", {"campaign_id": campaign_id, "full": True})
        docs = _inner(full).get("documents") or []
        email_docs = [
            d
            for d in docs
            if isinstance(d, dict)
            and str(d.get("file_type") or "").lower() in {"emails", "email_copy"}
            and str(d.get("status") or "").lower() == "completed"
            and (d.get("content") or "").strip()
            and "Medical practice" in (d.get("content") or "")
        ]
        if not email_docs or force:
            content_parts = [
                "# ClinicReach — Medical Practice Multi-channel Copy\n",
                "Email + phone + SMS for Practice Admins / Office Managers.\n",
            ]
            for i, tmpl in enumerate(DEFAULT_EMAILS, 1):
                content_parts.append(
                    f"\n## Email {i}\n**Subject:** {tmpl['subject']}\n\n{tmpl['body']}\n"
                )
            content_parts.append(
                f"\n## Phone script\n{DEFAULT_PHONE['body']}\n\n## SMS\n{DEFAULT_SMS['body']}\n"
            )
            content = "\n".join(content_parts)
            for file_type, display_name in (
                ("emails", "Clinic Emails"),
                ("email_copy", "Clinic Campaign Emails"),
            ):
                try:
                    await call_tool(
                        "g8_gtm_create_campaign_document",
                        {
                            "campaign_id": campaign_id,
                            "file_type": file_type,
                            "display_name": display_name,
                            "status": "completed",
                            "content": content,
                        },
                    )
                    doc_created = True
                    break
                except Exception as exc:
                    warnings.append(f"doc {file_type}: {exc}")
    except Exception as exc:
        warnings.append(f"documents: {exc}")

    steps = await _list_steps(campaign_id)
    return {
        "campaign_id": campaign_id,
        "steps_updated": updated,
        "channel_steps_created": channel_steps_created,
        "email_document_created": doc_created,
        "steps": steps,
        "ready": True,
        "tone": "clinical",
        "channels": sorted({(s.get("channel") or "") for s in steps if s.get("channel")}),
        "warnings": warnings,
        "message": "Clinic multi-channel copy ready — review/edit steps before launch.",
    }


@router.get("")
async def list_campaigns(
    user: CurrentUser,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
):
    last_exc: Exception | None = None
    for _ in range(2):
        try:
            return await call_tool(
                "g8_gtm_list_campaigns",
                {"page": page, "limit": limit},
            )
        except Exception as exc:
            last_exc = exc
    raise HTTPException(status_code=502, detail=str(last_exc)) from last_exc


@router.post("")
async def create_campaign(body: CreateCampaignBody, user: CurrentUser, db: DbSession):
    channels = [c.lower() for c in (body.channels or ["email"]) if c]
    if "email" not in channels:
        channels.insert(0, "email")
    # Graph8 create accepts email/linkedin primarily; phone/sms added as steps in prepare
    create_channels = [c for c in channels if c in {"email", "linkedin"}] or ["email"]
    args: dict = {
        "name": body.name.strip(),
        "category": "Outbound",
        "brief": body.brief,
        "goal": body.goal,
        "target_persona": body.target_persona,
        "target_channels": create_channels,
        "auto_generate_documents": body.auto_generate_documents,
    }
    if body.audience_list_id and str(body.audience_list_id).strip():
        args["audience_list_id"] = str(body.audience_list_id).strip()
    try:
        result = await call_tool("g8_gtm_create_campaign", args)
        campaign_id = None
        if isinstance(result, dict):
            inner = result.get("result") if isinstance(result.get("result"), dict) else result
            if isinstance(inner, dict):
                campaign_id = inner.get("id") or inner.get("campaign_id")
        if campaign_id:
            # Seed phone/SMS steps immediately when requested
            wanted = {c for c in channels if c in {"phone", "sms"}}
            if wanted:
                try:
                    await _ensure_channel_steps(str(campaign_id), wanted)
                except Exception:
                    pass
        db.add(
            CampaignAction(
                user_id=user.id,
                graph8_campaign_id=str(campaign_id or body.name),
                action="create",
                payload_json=json.dumps(
                    {
                        "name": body.name,
                        "audience_list_id": body.audience_list_id,
                        "channels": channels,
                    }
                ),
            )
        )
        db.commit()
        log_activity(db, user.id, "campaign.create", {"name": body.name, "id": campaign_id})
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, user: CurrentUser, full: bool = Query(True)):
    try:
        return await call_tool(
            "g8_gtm_get_campaign",
            {"campaign_id": campaign_id, "full": full},
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/{campaign_id}/sequence")
async def get_sequence(campaign_id: str, user: CurrentUser):
    try:
        steps = await _list_steps(campaign_id)
        return {"result": {"campaign_id": campaign_id, "steps": steps}}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.patch("/{campaign_id}/steps/{step_id}")
async def update_step(
    campaign_id: str,
    step_id: str,
    body: UpdateStepBody,
    user: CurrentUser,
    db: DbSession,
):
    """Save edited subject/body (email) or script (phone/SMS) before launch."""
    constraints: dict = {}
    if body.subject is not None:
        constraints["subject"] = body.subject
    if body.body is not None:
        constraints["body"] = body.body
    args: dict = {"campaign_id": campaign_id, "step_id": step_id}
    if constraints:
        args["constraints"] = constraints
    if body.name:
        args["name"] = body.name
    try:
        result = await call_tool("g8_gtm_update_campaign_step", args)
        log_activity(
            db,
            user.id,
            "campaign.step_update",
            {"campaign_id": campaign_id, "step_id": step_id},
        )
        steps = await _list_steps(campaign_id)
        return {"result": {"updated": True, "steps": steps, "raw": result}}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/{campaign_id}/prepare")
async def prepare_campaign(campaign_id: str, user: CurrentUser, db: DbSession):
    """Write clinic email + phone + SMS copy and return editable steps."""
    try:
        result = await _prepare_campaign_copy(campaign_id, force=True)
        log_activity(db, user.id, "campaign.prepare", {"campaign_id": campaign_id})
        return {"result": result}
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
    if not body.dry_run and not body.confirm:
        raise HTTPException(
            status_code=400,
            detail="Real launch requires confirm=true (and dry_run=false)",
        )
    prepare: dict | None = None
    prepare_error: str | None = None
    try:
        # Soft prepare — never block dry-run solely because prepare hiccuped
        try:
            prepare = await _prepare_campaign_copy(campaign_id, force=False)
        except Exception as exc:
            prepare_error = str(exc)
            try:
                prepare = {
                    "campaign_id": campaign_id,
                    "steps": await _list_steps(campaign_id),
                    "prepare_error": prepare_error,
                }
            except Exception:
                prepare = {"campaign_id": campaign_id, "prepare_error": prepare_error}

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
                payload_json=json.dumps(
                    {"dry_run": body.dry_run, "prepare": prepare},
                    default=str,
                ),
            )
        )
        db.commit()
        log_activity(db, user.id, f"campaign.{action}", {"campaign_id": campaign_id})

        # Normalize blocked previews into a clear UI payload
        inner = result.get("result") if isinstance(result, dict) else None
        blocked = False
        block_reasons: list[str] = []
        if isinstance(inner, dict):
            label = str(inner.get("action_label") or "")
            warning = str(inner.get("warning") or "")
            blocked = "blocked" in label.lower() or "blocked" in warning.lower()
            for d in inner.get("details") or []:
                if isinstance(d, dict) and d.get("label") and d.get("value") is not None:
                    if str(d["label"]).lower() in {"active mailboxes", "audience"}:
                        block_reasons.append(f"{d['label']}: {d['value']}")

        payload = result if isinstance(result, dict) else {"result": result}
        payload = {
            **payload,
            "clinicreach_prepare": prepare,
            "clinicreach_blocked": blocked,
            "clinicreach_block_reasons": block_reasons,
            "clinicreach_hint": (
                "Launch is blocked until Graph8 has an active mailbox "
                "(and usually a non-empty audience list). Copy can still be edited above."
                if blocked
                else None
            ),
        }
        return payload
    except Exception as exc:
        detail = str(exc)
        if detail.strip() in {"Server returned an error response", "Server error"}:
            detail = (
                "Graph8 rejected the launch request (generic server error). "
                "Common causes: no active mailbox, empty audience, or campaign still generating. "
                "Use a campaign with a contact list, click Prepare copy first, "
                "and connect a mailbox in Graph8 Studio."
            )
        if "missing generated email content" in detail.lower() or "not ready to push" in detail.lower():
            detail = (
                f"{detail} — Open Prepare copy, edit the email/phone/SMS steps, "
                "and ensure an active mailbox exists in Graph8."
            )
        if prepare_error:
            detail = f"{detail} (prepare warning: {prepare_error})"
        raise HTTPException(status_code=502, detail=detail) from exc
