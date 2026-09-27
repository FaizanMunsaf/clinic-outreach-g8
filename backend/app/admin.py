"""SQLAdmin dashboard for the local SQLite database."""

from __future__ import annotations

import os

from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request

from app.db import engine
from app.models import (
    ActivityLog,
    CampaignAction,
    EnrichmentJob,
    ListMember,
    Note,
    OutreachList,
    Prospect,
    User,
)


class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        username = str(form.get("username", ""))
        password = str(form.get("password", ""))
        expected_user = os.getenv("ADMIN_USERNAME", "admin")
        expected_pass = os.getenv("ADMIN_PASSWORD", "admin")
        if username == expected_user and password == expected_pass:
            request.session.update({"admin": True})
            return True
        return False

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        return bool(request.session.get("admin"))


class UserAdmin(ModelView, model=User):
    column_list = [User.id, User.email, User.full_name, User.is_active, User.created_at]
    column_searchable_list = [User.email, User.full_name]
    name_plural = "Users"


class ProspectAdmin(ModelView, model=Prospect):
    column_list = [
        Prospect.id,
        Prospect.user_id,
        Prospect.entity_type,
        Prospect.name,
        Prospect.email,
        Prospect.created_at,
    ]
    name_plural = "Prospects"


class OutreachListAdmin(ModelView, model=OutreachList):
    column_list = [
        OutreachList.id,
        OutreachList.user_id,
        OutreachList.name,
        OutreachList.graph8_list_id,
        OutreachList.created_at,
    ]
    name_plural = "Outreach Lists"


class ListMemberAdmin(ModelView, model=ListMember):
    column_list = [ListMember.id, ListMember.list_id, ListMember.prospect_id]
    name_plural = "List Members"


class NoteAdmin(ModelView, model=Note):
    column_list = [Note.id, Note.user_id, Note.prospect_id, Note.body, Note.created_at]
    name_plural = "Notes"


class EnrichmentJobAdmin(ModelView, model=EnrichmentJob):
    column_list = [
        EnrichmentJob.id,
        EnrichmentJob.user_id,
        EnrichmentJob.graph8_job_id,
        EnrichmentJob.status,
        EnrichmentJob.dry_run,
        EnrichmentJob.created_at,
    ]
    name_plural = "Enrichment Jobs"


class CampaignActionAdmin(ModelView, model=CampaignAction):
    column_list = [
        CampaignAction.id,
        CampaignAction.user_id,
        CampaignAction.graph8_campaign_id,
        CampaignAction.action,
        CampaignAction.created_at,
    ]
    name_plural = "Campaign Actions"


class ActivityLogAdmin(ModelView, model=ActivityLog):
    column_list = [
        ActivityLog.id,
        ActivityLog.user_id,
        ActivityLog.action,
        ActivityLog.created_at,
    ]
    name_plural = "Activity Logs"


def setup_admin(app) -> Admin:
    secret = os.getenv("ADMIN_SECRET_KEY", "clinicreach-dev-secret-change-me")
    authentication_backend = AdminAuth(secret_key=secret)
    admin = Admin(
        app,
        engine,
        authentication_backend=authentication_backend,
        title="ClinicReach DB Admin",
        base_url="/admin",
    )
    admin.add_view(UserAdmin)
    admin.add_view(ProspectAdmin)
    admin.add_view(OutreachListAdmin)
    admin.add_view(ListMemberAdmin)
    admin.add_view(NoteAdmin)
    admin.add_view(EnrichmentJobAdmin)
    admin.add_view(CampaignActionAdmin)
    admin.add_view(ActivityLogAdmin)
    return admin
