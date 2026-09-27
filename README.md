# ClinicReach

Multi-user medical practice / clinic outreach desk on **Graph8 MCP**.

```
graph8/
├── backend/          # FastAPI + JWT + SQLite → Graph8 MCP
│   ├── app/
│   │   ├── main.py
│   │   ├── auth_utils.py
│   │   ├── deps.py
│   │   ├── models.py
│   │   ├── graph8_client.py
│   │   └── routers/
│   └── requirements.txt
└── frontend/         # Next.js ClinicReach UI (login-gated)
    └── src/app/
```

## Demo login

| Email | Password |
|-------|----------|
| `demo@clinicreach.app` | `demo1234` |

Register any new user at `/register`. Graph8 is a shared GTM backend; activity is per-user in SQLite.

## Setup

### Docker (recommended)

```bash
copy backend\.env.example backend\.env
# set G8_API_KEY (and JWT_SECRET_KEY)
docker compose up --build
```

| Service  | URL |
|----------|-----|
| App      | http://localhost:3000 |
| API      | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| DB admin | http://localhost:8000/admin |

SQLAdmin: `admin` / `admin` (change via `ADMIN_USERNAME` / `ADMIN_PASSWORD`).

### Local (without Docker)

#### Backend

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # set G8_API_KEY + JWT_SECRET_KEY
uvicorn app.main:app --reload --port 8000
```

On startup the API creates SQLite tables and seeds the demo user.

#### Frontend

```bash
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:3000 → sign in with the demo account.

### Env (backend)

| Variable | Purpose |
|----------|---------|
| `G8_API_KEY` | Graph8 MCP key |
| `G8_MCP_URL` | MCP endpoint |
| `G8_SAFE_ORG_URL` | Active Graph8 org slug |
| `DATABASE_URL` | SQLite path |
| `JWT_SECRET_KEY` | Signs access tokens |
| `CORS_ORIGINS` | Frontend origin(s) |
| `ADMIN_*` | SQLAdmin login |

### Database

Local SQLite: `backend/data/clinicreach.db`

Tables include `users`, `activity_logs`, `campaign_actions`, `prospects`, `outreach_lists`, `list_members`, `notes`, `enrichment_jobs`.

Graph8 remains the GTM system of record; SQLite stores users, auth, and per-user activity.

## Product flow

**Prospect → Lists → Enrich → Campaigns → Inbox**

- **Prospect**: clinic filters (city / state / industry) + decision-maker search; save to list
- **Campaigns**: create → dry-run launch → confirm real launch
- **Inbox**: AI draft → edit → confirm send

### Auth endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` | Create account + JWT |
| POST | `/api/auth/login` | Login + JWT |
| GET | `/api/auth/me` | Current user |
| GET | `/api/auth/activity` | Per-user activity log |

All other `/api/*` routes require `Authorization: Bearer <token>`.

### Working Graph8 endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |
| GET | `/api/clinics/search` | Find practices (`q`, `city`, `state`, `industry`) |
| GET | `/api/contacts/search` | Find decision-makers |
| GET/POST | `/api/lists` | Outreach lists |
| GET | `/api/lists/{id}/contacts` | CRM contacts on a list |
| POST | `/api/lists/{id}/members` | Add prospect rows to a list |
| POST | `/api/enrich` | Enrich contacts (`dry_run` first) |
| GET | `/api/enrich/jobs/{id}` | Poll enrichment job |
| GET/POST | `/api/campaigns` | List / create campaigns |
| POST | `/api/campaigns/{id}/launch` | Dry-run or real (`confirm=true`) |
| GET | `/api/inbox` | Inbox threads |
| POST | `/api/inbox/{id}/draft` | AI reply draft |
| POST | `/api/inbox/{id}/send` | Send reply (`confirm=true`) |
