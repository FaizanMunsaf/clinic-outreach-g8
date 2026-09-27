from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.auth_utils import create_access_token, hash_password, verify_password
from app.deps import CurrentUser, DbSession, log_activity
from app.models import ActivityLog, User

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=72)
    full_name: str = Field(default="", max_length=255)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str

    class Config:
        from_attributes = True


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


@router.post("/register", response_model=TokenOut)
def register(body: RegisterBody, db: DbSession):
    email = body.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=email,
        full_name=body.full_name.strip() or email.split("@")[0],
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_activity(db, user.id, "auth.register", {"email": email})
    token = create_access_token(user.email)
    return TokenOut(
        access_token=token,
        user=UserOut(id=user.id, email=user.email, full_name=user.full_name),
    )


@router.post("/login", response_model=TokenOut)
def login(body: LoginBody, db: DbSession):
    email = body.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    log_activity(db, user.id, "auth.login", {"email": email})
    token = create_access_token(user.email)
    return TokenOut(
        access_token=token,
        user=UserOut(id=user.id, email=user.email, full_name=user.full_name),
    )


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return UserOut(id=user.id, email=user.email, full_name=user.full_name)


@router.get("/activity")
def my_activity(user: CurrentUser, db: DbSession, limit: int = 50):
    rows = (
        db.query(ActivityLog)
        .filter(ActivityLog.user_id == user.id)
        .order_by(ActivityLog.id.desc())
        .limit(min(limit, 100))
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "action": r.action,
                "detail_json": r.detail_json,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }
