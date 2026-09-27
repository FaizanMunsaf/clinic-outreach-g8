from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
import json

from app.deps import CurrentUser, DbSession, log_activity
from app.graph8_client import call_tool
from app.models import OutreachList, Prospect

router = APIRouter(prefix="/lists", tags=["lists"])


class CreateListBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: str = Field(default="contacts", pattern="^(contacts|companies)$")


class ContactRow(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    work_email: str | None = None
    job_title: str | None = None
    company_domain: str | None = None
    company_name: str | None = None
    linkedin_url: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    job_department: str | None = None
    direct_phone: str | None = None
    mobile_phone: str | None = None


class AddToListBody(BaseModel):
    rows: list[ContactRow] = Field(..., min_length=1)
    dry_run: bool = False


@router.get("")
async def get_lists(user: CurrentUser, db: DbSession):
    try:
        result = await call_tool("g8_get_lists", {})
        log_activity(db, user.id, "lists.list", {})
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("")
async def create_list(body: CreateListBody, user: CurrentUser, db: DbSession):
    try:
        result = await call_tool(
            "g8_create_list",
            {"title": body.name, "type": body.type},
        )
        g8_id = None
        if isinstance(result, dict):
            inner = result.get("result") if isinstance(result.get("result"), dict) else result
            if isinstance(inner, dict):
                g8_id = inner.get("id")
        local = (
            db.query(OutreachList)
            .filter(OutreachList.user_id == user.id, OutreachList.name == body.name)
            .first()
        )
        if not local:
            local = OutreachList(
                user_id=user.id,
                name=body.name,
                graph8_list_id=str(g8_id) if g8_id is not None else None,
            )
            db.add(local)
        else:
            if g8_id is not None:
                local.graph8_list_id = str(g8_id)
        db.commit()
        log_activity(db, user.id, "lists.create", {"name": body.name, "graph8_list_id": g8_id})
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/{list_id}/contacts")
async def get_list_contacts(
    list_id: int,
    user: CurrentUser,
    limit: int = Query(50, ge=1, le=200),
):
    try:
        return await call_tool(
            "g8_search_contacts",
            {"list_id": str(list_id), "limit": limit},
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/{list_id}/members")
async def add_to_list(
    list_id: int,
    body: AddToListBody,
    user: CurrentUser,
    db: DbSession,
):
    rows = []
    for row in body.rows:
        payload = row.model_dump(exclude_none=True)
        payload.pop("company_name", None)
        if payload:
            rows.append(payload)
            # Persist local prospect snapshot for this user
            key = payload.get("linkedin_url") or payload.get("work_email") or (
                f"{payload.get('first_name','')}-{payload.get('last_name','')}"
            )
            name = (
                f"{payload.get('first_name', '')} {payload.get('last_name', '')}".strip()
                or "Prospect"
            )
            existing = (
                db.query(Prospect)
                .filter(
                    Prospect.user_id == user.id,
                    Prospect.entity_type == "contact",
                    Prospect.graph8_id == key[:128],
                )
                .first()
            )
            if not existing:
                db.add(
                    Prospect(
                        user_id=user.id,
                        entity_type="contact",
                        graph8_id=key[:128],
                        name=name,
                        title=payload.get("job_title"),
                        email=payload.get("work_email"),
                        company_name=None,
                        location=", ".join(
                            p
                            for p in [payload.get("city"), payload.get("state")]
                            if p
                        )
                        or None,
                        raw_json=json.dumps(payload),
                    )
                )
    if not rows:
        raise HTTPException(status_code=400, detail="No valid contact rows to add")
    try:
        result = await call_tool(
            "g8_add_to_list",
            {"list_id": list_id, "rows": rows, "dry_run": body.dry_run},
        )
        # ensure local list ref
        local = (
            db.query(OutreachList)
            .filter(
                OutreachList.user_id == user.id,
                OutreachList.graph8_list_id == str(list_id),
            )
            .first()
        )
        if not local:
            db.add(
                OutreachList(
                    user_id=user.id,
                    name=f"Graph8 list {list_id}",
                    graph8_list_id=str(list_id),
                )
            )
        db.commit()
        log_activity(
            db,
            user.id,
            "lists.add_members",
            {"list_id": list_id, "count": len(rows), "dry_run": body.dry_run},
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
