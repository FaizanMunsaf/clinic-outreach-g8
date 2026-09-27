"""Clinic Outreach API — FastAPI over Graph8 MCP + multi-user SQLite."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.admin import setup_admin
from app.auth_utils import hash_password
from app.db import DATABASE_URL, Base, SessionLocal, engine
from app.models import User
from app.routers import auth, campaigns, clinics, contacts, enrich, health, inbox, lists

load_dotenv()

DEMO_EMAIL = "demo@clinicreach.app"
DEMO_PASSWORD = "demo1234"


def seed_demo_user() -> None:
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == DEMO_EMAIL).first()
        if existing:
            return
        db.add(
            User(
                email=DEMO_EMAIL,
                full_name="Demo User",
                hashed_password=hash_password(DEMO_PASSWORD),
            )
        )
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if DATABASE_URL.startswith("sqlite:///"):
        db_path = Path(DATABASE_URL.replace("sqlite:///", "", 1))
        db_path.parent.mkdir(parents=True, exist_ok=True)
    # Ensure schema exists (MVP fast path alongside Alembic)
    Base.metadata.create_all(bind=engine)
    seed_demo_user()
    yield
    engine.dispose()


app = FastAPI(
    title="Clinic Outreach API",
    description="Medical practice / clinic outreach powered by Graph8 MCP",
    version="0.2.0",
    lifespan=lifespan,
)

secret = os.getenv("ADMIN_SECRET_KEY", "clinicreach-dev-secret-change-me")
app.add_middleware(SessionMiddleware, secret_key=secret)

origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router, prefix="/api")
app.include_router(clinics.router, prefix="/api")
app.include_router(contacts.router, prefix="/api")
app.include_router(lists.router, prefix="/api")
app.include_router(enrich.router, prefix="/api")
app.include_router(campaigns.router, prefix="/api")
app.include_router(inbox.router, prefix="/api")

setup_admin(app)


@app.get("/")
async def root():
    return {
        "name": "Clinic Outreach API",
        "docs": "/docs",
        "health": "/health",
        "admin": "/admin",
        "auth": "/api/auth/register",
        "database": "sqlite",
    }
