# CLAUDE.md — Fullstack Project

> Automatically read by Claude Code on every session. Keep it accurate and concise.

---

## Project Overview

Kubernetes-native full-stack application with three FastAPI microservices, a React frontend,
PostgreSQL + Redis persistence, and a GitHub Actions CI/CD pipeline.
Container runtime is **Podman** (Containerfile, not Dockerfile).

---

## Repository Structure

```
fullstack/
├── .vscode/                   # settings.json, launch.json, extensions.json
├── services/
│   ├── users/                 # FastAPI — user registration, JWT auth
│   ├── orders/                # FastAPI — order lifecycle
│   ├── payments/              # FastAPI — payment processing
│   └── shared/                # Shared auth utilities (JWT bearer extractor)
├── frontend/                  # React 18 + TypeScript + Vite SPA
├── infra/
│   ├── k8s/
│   │   ├── base/              # namespace.yaml, ingress.yaml (NGINX)
│   │   ├── services/          # Deployment + Service per workload
│   │   └── secrets/           # Managed manually, not committed
│   ├── helm/                  # Helm chart stubs (one dir per service)
│   └── database/              # postgres.yaml, redis.yaml with PVCs
└── ops/
    ├── ci/ci.yml              # GitHub Actions — test matrix + Podman build
    └── cd/deploy.yml          # GitHub Actions — kubectl apply + rollout
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2.x (async) |
| Auth | `python-jose` (JWT), `passlib[bcrypt]` — users service only |
| Frontend | React 18, TypeScript 5, Vite, React Router v6, axios |
| Primary DB | PostgreSQL 16 (`asyncpg`) |
| Cache | Redis 7 |
| Container | Podman / Containerfile |
| Orchestration | Kubernetes + Helm |
| CI/CD | GitHub Actions (`ops/ci/`, `ops/cd/`) |

---

## Per-Service Layout

Every service under `services/<name>/` follows this structure:

```
services/<name>/
├── app/
│   ├── __init__.py
│   ├── main.py            # FastAPI app, includes router, /health endpoint
│   ├── api/
│   │   └── routes.py      # APIRouter — endpoints call get_db directly
│   ├── core/
│   │   ├── config.py      # pydantic-settings BaseSettings (reads .env)
│   │   └── security.py    # JWT helpers (users service only)
│   ├── db/
│   │   └── session.py     # AsyncEngine, AsyncSessionLocal, get_db dep
│   ├── models/
│   │   └── <entity>.py    # SQLAlchemy DeclarativeBase ORM models
│   └── schemas/
│       └── <entity>.py    # Pydantic request/response schemas
├── tests/
│   └── test_<name>.py
├── Containerfile
└── pyproject.toml
```

### Service ports (local dev)

| Service | Port |
|---|---|
| users | 8001 |
| orders | 8002 |
| payments | 8003 |
| frontend | 3000 |

---

## Local Development

```bash
# Per-service (pick the right port)
cd services/users
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8001

# Frontend
cd frontend
npm install
npm run dev    # :3000 — proxies /api/users→8001, /api/orders→8002, /api/payments→8003
```

VS Code launch configs (`F5`) cover all three services with env vars pre-filled.

---

## Building Images (Podman)

```bash
podman build -t fullstack/users:latest    -f services/users/Containerfile    services/users/
podman build -t fullstack/orders:latest   -f services/orders/Containerfile   services/orders/
podman build -t fullstack/payments:latest -f services/payments/Containerfile services/payments/
podman build -t fullstack/frontend:latest -f frontend/Containerfile          frontend/
```

Images are tagged `fullstack/<service>:<git-sha>` in CI.

---

## Kubernetes

```bash
kubectl apply -f infra/k8s/base/       # namespace + NGINX ingress
kubectl apply -f infra/database/       # postgres + redis
kubectl apply -f infra/k8s/services/   # all four workloads
```

Ingress routes: `fullstack.local/api/users/*` → users, `/api/orders/*` → orders,
`/api/payments/*` → payments, `/*` → frontend. Add `fullstack.local` to `/etc/hosts`.

---

## Conventions

### Python / FastAPI

- All config from environment variables via `pydantic-settings`. Local: copy `.env.example` → `.env`.
- `async def` throughout. Never use synchronous SQLAlchemy or sync HTTP clients.
- Routes query `AsyncSession` directly via `Depends(get_db)` — no separate repository layer.
- Every endpoint returns a Pydantic response model. Never return raw dicts.
- UUID string primary keys on all models (`default=lambda: str(uuid.uuid4())`).
- All response schemas use `model_config = {"from_attributes": True}`.
- Raise `HTTPException` for all error responses.
- Every service exposes `GET /health → {"status": "ok"}`.

### Inter-service communication

- Services call each other over HTTP using `httpx.AsyncClient`.
- JWT tokens issued by the users service. `services/shared/auth.py` provides a bearer extractor
  for orders/payments to validate tokens without re-implementing JWT logic.
- Each service owns its own database. No cross-service DB queries.

### TypeScript / React

- Functional components only.
- `react-router-dom` v6 for routing (`Routes` / `Route`).
- `axios` for API calls.
- File naming: `PascalCase` for components, `camelCase` for utilities.

### K8s / Helm

- Resource `requests` and `limits` are required on every container.
- `readinessProbe` required on every deployment.
- Helm chart directories exist under `infra/helm/<service>/` — templates not yet populated.

---

## CI/CD

| File | Trigger | What it does |
|---|---|---|
| `ops/ci/ci.yml` | Push / PR | pytest matrix (users, orders, payments) → Podman build all 4 images |
| `ops/cd/deploy.yml` | Push to `main` | `kubectl apply` base + db + services, `kubectl set image`, rollout wait |

Secrets required: `KUBECONFIG` in GitHub Actions environment `production`.

---

## Do Not

- Do not hardcode secrets, passwords, or API keys in source code
- Do not use synchronous SQLAlchemy (`create_engine`) — always `create_async_engine`
- Do not return raw `dict` from endpoints — always use a Pydantic response model
- Do not query another service's database directly — use HTTP calls instead
- Do not use sync HTTP clients (`requests`) — use `httpx.AsyncClient`
- Do not commit `.env` files or K8s Secret manifests with real values
