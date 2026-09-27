from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.deps import CurrentUser, DbSession, log_activity
from app.graph8_client import call_tool

router = APIRouter(prefix="/clinics", tags=["clinics"])


@router.get("/search")
async def search_clinics(
    user: CurrentUser,
    db: DbSession,
    q: str = Query("", description="Clinic / practice name keyword"),
    city: str | None = Query(None),
    industry: str | None = Query(None, description="e.g. Hospital & Health Care, Medical Practice"),
    state: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    source: str = Query("prospect", pattern="^(prospect|crm)$"),
):
    """Prospect medical practices via Graph8 company search with filters."""
    try:
        if source == "crm":
            args: dict = {"limit": limit}
            if q:
                args["name"] = q
            if industry:
                args["industry"] = industry
            result = await call_tool("g8_search_companies", args)
        else:
            filters = []
            if q:
                filters.append({"field": "name", "operator": "contains", "value": [q]})
            if city:
                filters.append({"field": "city", "operator": "contains", "value": [city]})
            if state:
                filters.append({"field": "state", "operator": "contains", "value": [state]})
            if industry:
                filters.append(
                    {"field": "industry", "operator": "contains", "value": [industry]}
                )
            if not filters:
                raise HTTPException(
                    status_code=400,
                    detail="Provide at least one of q, city, state, or industry",
                )
            result = await call_tool(
                "g8_find_companies",
                {"filters": filters, "limit": limit},
            )
        log_activity(
            db,
            user.id,
            "clinics.search",
            {"q": q, "city": city, "industry": industry, "state": state},
        )
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
