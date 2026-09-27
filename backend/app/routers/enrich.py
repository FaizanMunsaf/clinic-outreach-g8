import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.deps import CurrentUser, DbSession, log_activity
from app.graph8_client import call_tool
from app.models import EnrichmentJob

router = APIRouter(prefix="/enrich", tags=["enrich"])


class EnrichBody(BaseModel):
    list_id: int
    contact_ids: list[int] = Field(..., min_length=1)
    dry_run: bool = True
    mode: str = Field(default="waterfall", pattern="^(auto|waterfall|ai-research)$")
    target_field: str | None = "email"


@router.post("")
async def enrich_contacts(body: EnrichBody, user: CurrentUser, db: DbSession):
    args: dict = {
        "list_id": body.list_id,
        "contact_ids": body.contact_ids,
        "dry_run": body.dry_run,
        "mode": body.mode,
    }
    if body.target_field:
        args["target_field"] = body.target_field
    try:
        result = await call_tool("g8_enrich_contacts", args)
        job_id = "dry-run"
        status = "preview"
        if isinstance(result, dict):
            inner = result.get("result") if isinstance(result.get("result"), dict) else result
            if isinstance(inner, dict):
                job_id = str(inner.get("job_id") or inner.get("id") or job_id)
                status = str(inner.get("status") or status)
        db.add(
            EnrichmentJob(
                user_id=user.id,
                graph8_job_id=f"{job_id}-{user.id}-{body.list_id}",
                graph8_list_id=str(body.list_id),
                status=status,
                mode=body.mode,
                dry_run=body.dry_run,
                result_json=json.dumps(result, default=str)[:8000],
            )
        )
        db.commit()
        log_activity(
            db,
            user.id,
            "enrich.run",
            {
                "list_id": body.list_id,
                "dry_run": body.dry_run,
                "count": len(body.contact_ids),
            },
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/jobs/{job_id}")
async def get_enrichment_job(job_id: str, user: CurrentUser):
    try:
        return await call_tool(
            "g8_get_enrichment_job",
            {"job_id": job_id, "include_provider_errors": True},
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
