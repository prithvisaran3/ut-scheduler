# UT Scheduler

Production-style take-home: radiopharmaceutical pathway scheduling with a FastAPI backend and React SPA frontend.

## Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Postgres (psycopg), JWT auth, NumPy scheduling engine
- **Frontend:** React 19, TypeScript, Vite, Tailwind v4, TanStack Query, Zustand, Framer Motion

## Prerequisites

- Python 3.12+
- Node 20+
- A **hosted Supabase Postgres** database. Copy the connection string from the
  Supabase dashboard (Project Settings → Database) into `backend/.env` as
  `DATABASE_URL`. External connections require SSL; the app adds
  `sslmode=require` automatically for non-localhost hosts.

Example URI shapes (placeholders only):

```text
postgresql+psycopg://postgres:[PASSWORD]@[HOST]:5432/postgres
postgresql+psycopg://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
postgresql+psycopg://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

## Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — set DATABASE_URL to your Supabase URI and SECRET_KEY

alembic upgrade head
python -m scripts.seed

uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs  
Health: http://localhost:8000/health

### Seeded credentials

| Role    | Email                     | Password           |
|---------|---------------------------|--------------------|
| Admin   | `admin@utscheduler.com`   | `Theranostics2026!` |
| Patient | `patient@utscheduler.com` | `Theranostics2026!` |

## Frontend setup

```bash
cd frontend
cp .env.example .env   # VITE_API_URL=http://localhost:8000
npm install
npm run dev
```

App: http://localhost:5173

## Ownability map (for live interview edits)

| Change                         | Edit this file only                                      |
|--------------------------------|----------------------------------------------------------|
| Color / radius / shadow        | `frontend/src/styles/tokens.css`                         |
| UI copy                        | `frontend/src/content/strings.ts`                        |
| Day hours / slot length / resources | `backend/app/core/schedule_config.py` **and** `frontend/src/lib/scheduleConfig.ts` (keep in sync) |
| Scheduling algorithm           | `backend/app/services/scheduling_engine.py`              |

## Pathway 1 (ground truth)

Doctor 90m → NMT 30m → GAP 60m → Scan 60m → Doctor 30m  
**9 blocks · 4h 30m**

(Design-file pathway compositions are visual artifacts — not authoritative.)

## Tests

```bash
cd backend
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```

## Demo flow

1. Sign in as admin → drag-select slots → Mark unavailable  
2. Sign out → sign in as patient → select Pathway 1  
3. Watch stencil search animate rejected attempts, then land on earliest fit  
4. Confirm booking → sign back in as admin and see the occupied slots
