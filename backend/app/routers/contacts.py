from fastapi import APIRouter, HTTPException, Query

from app.deps import CurrentUser, DbSession, log_activity
from app.graph8_client import call_tool

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("/search")
async def search_contacts(
    user: CurrentUser,
    db: DbSession,
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    field: str = Query(
        "job_title",
        pattern="^(job_title|company_name|company_industry|city|state)$",
    ),
):
    try:
        result = await call_tool(
            "g8_find_contacts",
            {
                "filters": [
                    {"field": field, "operator": "contains", "value": [q]},
                ],
                "limit": limit,
            },
        )
        log_activity(db, user.id, "contacts.search", {"q": q, "field": field})
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
