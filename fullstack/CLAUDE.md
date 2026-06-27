# CLAUDE.md — Fullstack Project

> Automatically read by Claude Code on every session. Keep it accurate and concise.

---

## Project Overview

Kubernetes-native full-stack application with three FastAPI microservices, a React 18 admin
dashboard frontend, PostgreSQL + Redis persistence, and a GitHub Actions CI/CD pipeline.
Container runtime is **Podman** (Containerfile, not Dockerfile).

GitHub: https://github.com/jaosullivan/webapp/tree/main/fullstack

---

## Repository Structure

```
fullstack/
├── .vscode/                   # settings.json, launch.json, extensions.json
├── services/
│   ├── users/                 # FastAPI — registration, JWT auth (port 8001)
│   ├── orders/                # FastAPI — order lifecycle (port 8002)
│   ├── payments/              # FastAPI — payment processing (port 8003)
│   └── shared/                # Shared JWT bearer extractor
├── frontend/                  # React 18 + TypeScript + Vite admin dashboard (port 3000)
├── infra/
│   ├── k8s/
│   │   ├── base/              # namespace.yaml, ingress.yaml (NGINX)
│   │   ├── services/          # Deployment + Service per workload
│   │   └── secrets/           # Managed manually, not committed
│   ├── helm/                  # Helm chart stubs (templates not yet populated)
│   └── database/              # postgres.yaml, redis.yaml with PVCs
├── ops/
│   ├── ci/ci.yml              # GitHub Actions — pytest matrix + Podman build
│   └── cd/deploy.yml          # GitHub Actions — kubectl apply + rollout wait
├── seed.py                    # Populates demo data via service APIs
├── start-dev.ps1              # One-shot script to start all services locally
└── docker-compose.yml         # PostgreSQL 16 + Redis 7 for local dev (use Podman)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2.x (async) |
| Auth | `python-jose` (JWT) + `bcrypt` (direct, not passlib — incompatible with bcrypt 5.x) |
| Frontend | React 18, TypeScript 5, Vite 8, React Router v6, axios |
| UI Components | shadcn/ui (manual, no CLI) + Tailwind CSS v4 + lucide-react |
| Primary DB | PostgreSQL 16 (`asyncpg`) |
| Cache | Redis 7 |
| Container | Podman / Containerfile |
| Orchestration | Kubernetes + Helm |
| CI/CD | GitHub Actions (`ops/ci/`, `ops/cd/`) |
| Testing | pytest + pytest-asyncio + httpx (ASGITransport) + pytest-watch |

---

## API Endpoints

### Users service — port 8001

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/v1/users` | Register user (`{email, password}`) |
| GET | `/api/v1/users` | List users (`?skip=&limit=`) |
| GET | `/api/v1/users/{id}` | Get user |
| PATCH | `/api/v1/users/{id}/status` | Toggle active/inactive |
| POST | `/api/v1/auth/token` | Login — returns JWT (`application/x-www-form-urlencoded`) |

### Orders service — port 8002

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/v1/orders` | Create order (`{user_id, total}`) |
| GET | `/api/v1/orders` | List orders (`?skip=&limit=`) |
| GET | `/api/v1/orders/stats` | Aggregate stats — total, by_status, total_value |
| GET | `/api/v1/orders/user/{user_id}` | Orders for a user |
| GET | `/api/v1/orders/{id}` | Get order |
| PATCH | `/api/v1/orders/{id}/status` | Update status (`{status}`) |

Order statuses: `pending` → `confirmed` → `shipped` → `delivered` | `cancelled`

### Payments service — port 8003

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/v1/payments` | Create payment (`{order_id, amount}`) |
| GET | `/api/v1/payments` | List payments (`?skip=&limit=`) |
| GET | `/api/v1/payments/stats` | Aggregate stats — total, by_status, revenue (completed only) |
| GET | `/api/v1/payments/{id}` | Get payment |
| POST | `/api/v1/payments/{id}/process` | Mark completed, assign provider_ref (idempotent) |
| PATCH | `/api/v1/payments/{id}/status` | Set status (`pending`/`completed`/`failed`/`refunded`) |

---

## Per-Service Layout

```
services/<name>/
├── app/
│   ├── main.py            # FastAPI app + lifespan (runs create_all) + CORS
│   ├── api/routes.py      # All endpoints — call get_db directly, no repo layer
│   ├── core/
│   │   ├── config.py      # pydantic-settings BaseSettings (reads .env)
│   │   └── security.py    # JWT encode/decode (users service only)
│   ├── db/
│   │   ├── base.py        # DeclarativeBase
│   │   └── session.py     # create_async_engine, AsyncSessionLocal, get_db, init_db
│   ├── models/<entity>.py # SQLAlchemy ORM models
│   └── schemas/<entity>.py# Pydantic request/response schemas
├── tests/
│   ├── conftest.py        # engine fixture, clean_tables autouse, client fixture
│   └── test_<name>.py     # Full test suite
├── Containerfile
└── pyproject.toml
```

---

## Local Development

### Prerequisites

- Python 3.11+ (project uses 3.14 at `C:\Users\johna\AppData\Local\Programs\Python\Python314\`)
- Node.js 20+ at `C:\Program Files\nodejs\`
- Podman running with containers `fullstack-postgres` (port 5432) and `fullstack-redis` (port 6379)

### Start everything

```powershell
# From fullstack/
.\start-dev.ps1
```

This starts Podman containers, all three backend services in terminal windows, and the Vite dev server.

### Manual startup

```powershell
# Start Podman containers
podman start fullstack-postgres fullstack-redis

# Per-service
cd services/users
pip install -e ".[dev]"
python -m uvicorn app.main:app --reload --port 8001

# Frontend
cd frontend
npm install
npm run dev    # http://localhost:3000
```

### Seed demo data

```powershell
# From fullstack/ — requires all three services to be running
python seed.py
```

Creates 10 users, ~35 orders across all statuses, ~30 payments (mix of completed/pending/failed).

### Run tests

```powershell
cd services/users    && python -m pytest tests/ -v
cd services/orders   && python -m pytest tests/ -v
cd services/payments && python -m pytest tests/ -v

# Watch mode (re-runs on file save — TDD workflow)
python -m pytest_watch tests/
```

Tests use real PostgreSQL (`users_test`, `orders_test`, `payments_test` databases).
Tables are truncated between each test for isolation.

---

## Building Images (Podman)

```bash
podman build -t fullstack/users:latest    -f services/users/Containerfile    services/users/
podman build -t fullstack/orders:latest   -f services/orders/Containerfile   services/orders/
podman build -t fullstack/payments:latest -f services/payments/Containerfile services/payments/
podman build -t fullstack/frontend:latest -f frontend/Containerfile          frontend/
```

Images tagged `fullstack/<service>:<git-sha>` in CI.

---

## Kubernetes

```bash
kubectl apply -f infra/k8s/base/       # namespace + NGINX ingress
kubectl apply -f infra/database/       # postgres + redis with PVCs
kubectl apply -f infra/k8s/services/   # all four workloads
```

Ingress routes: `fullstack.local/api/v1/auth` and `/api/v1/users` → users,
`/api/v1/orders` → orders, `/api/v1/payments` → payments, `/*` → frontend.
Add `fullstack.local` to `/etc/hosts`.

---

## Frontend

- Vite proxy routes `/api/v1/auth` and `/api/v1/users` → `:8001`, `/api/v1/orders` → `:8002`, `/api/v1/payments` → `:8003`
- JWT stored in `localStorage`. Axios interceptor attaches `Authorization: Bearer <token>` to every request and redirects to `/login` on 401.
- Dashboard stats use `GET /orders/stats` and `GET /payments/stats` — not paginated list fetches.
- shadcn/ui components are hand-written (no CLI) in `frontend/src/components/ui/`.

---

## Conventions

### Python / FastAPI

- All config from environment variables via `pydantic-settings`. Local: copy `.env.example` → `.env`.
- `async def` throughout — never sync SQLAlchemy or sync HTTP clients.
- Routes call `AsyncSession` via `Depends(get_db)` directly — no repository layer.
- Every endpoint returns a Pydantic response model — never raw dicts.
- UUID string PKs on all models: `default=lambda: str(uuid.uuid4())`.
- Response schemas use `model_config = {"from_attributes": True}`.
- Raise `HTTPException` for all error responses.
- Every service exposes `GET /health → {"status": "ok"}`.
- Stats/aggregate routes registered **before** `/{id}` routes to avoid FastAPI matching `stats` as an ID.

### Auth (users service only)

- Passwords hashed with `bcrypt` directly (not passlib — passlib 1.7.4 is incompatible with bcrypt 4+).
- JWT signed with HS256. Secret in `SECRET_KEY` env var.
- Login endpoint accepts `application/x-www-form-urlencoded` (OAuth2PasswordRequestForm).

### Inter-service communication

- Services call each other over HTTP using `httpx.AsyncClient`.
- `services/shared/auth.py` provides a bearer extractor for orders/payments to validate JWTs.
- Each service owns its own database — no cross-service DB queries.

### TypeScript / React

- Functional components only.
- `react-router-dom` v6 for routing.
- `axios` for all API calls, configured in `frontend/src/lib/api.ts`.
- File naming: `PascalCase` components, `camelCase` utilities.

### Testing

- Tests use `ASGITransport` (in-process) — no running server needed.
- `conftest.py` sets `DATABASE_URL` env var **before** any app imports to point at `*_test` DB.
- Session-scoped engine fixture creates/drops tables once per test run.
- `autouse` fixture truncates all tables before each test.
- `client` fixture overrides `get_db` dependency with test session factory.

---

## CI/CD

CI is GitHub Actions. CD is ArgoCD (GitOps — no `kubectl` in the pipeline after bootstrap).

### Flow

```
Push to main
    │
    ├─ test (matrix: users, orders, payments)
    │       pytest against ephemeral PostgreSQL service container
    │
    ├─ build-push (after tests pass)
    │       podman build + push to ghcr.io/jaosullivan/webapp/<service>:<sha>
    │
    └─ update-manifests
            kustomize edit set image → updates infra/k8s/overlays/production/kustomization.yaml
            git commit + push [skip ci]
                │
                └─ ArgoCD detects the change → syncs cluster automatically
```

### Files

| File | Purpose |
|---|---|
| `ops/ci/ci.yml` | Test → build → push → update Kustomize overlay |
| `ops/cd/bootstrap-argocd.yml` | One-time manual workflow: installs ArgoCD, registers the Application |
| `infra/argocd/project.yaml` | ArgoCD AppProject — scopes source repo and allowed namespaces |
| `infra/argocd/apps/fullstack-app.yaml` | ArgoCD Application — watches `infra/k8s/overlays/production`, auto-syncs |
| `infra/k8s/overlays/production/kustomization.yaml` | Kustomize overlay; CI writes image tags here |

### Image registry

`ghcr.io/jaosullivan/webapp/<service>:<sha>` and `:latest`

### ArgoCD sync policy

- `automated.prune: true` — removes K8s resources deleted from Git
- `automated.selfHeal: true` — reverts out-of-band manual cluster changes
- `CreateNamespace=true` — ArgoCD creates the `fullstack` namespace if absent

### Secrets required

| Secret | Where | Value |
|---|---|---|
| `GITHUB_TOKEN` | Auto-provided | Push packages to ghcr.io, commit manifest changes |
| `KUBECONFIG` | GitHub Actions environment `production` | Only needed for the one-time bootstrap |

### Local cluster (k3s in WSL2 Ubuntu)

A local Kubernetes cluster runs k3s inside the Ubuntu WSL2 distro.

**Kubeconfig**: `C:\Users\johna\.kube\k3s-config.yaml`  
**kubectl**: `C:\Program Files\Docker\Docker\resources\bin\kubectl.exe`

The server IP in the kubeconfig (`172.20.183.125`) is the Ubuntu WSL2 NIC IP which can change on WSL restart. To refresh it:
```powershell
$wslIp = (wsl -d Ubuntu -u root -- hostname -I) -split '\s+' | Select-Object -First 1
$cfg = Get-Content "C:\Users\johna\.kube\k3s-config.yaml" -Raw
# replace old IP with new one, then Set-Content
```

**ArgoCD UI**: `https://localhost:8080` (after port-forward)  
```powershell
$env:KUBECONFIG = "C:\Users\johna\.kube\k3s-config.yaml"
& "C:\Program Files\Docker\Docker\resources\bin\kubectl.exe" port-forward svc/argocd-server -n argocd 8080:443
# user: admin  password: get with:
& "C:\Program Files\Docker\Docker\resources\bin\kubectl.exe" -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | ForEach-Object { [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($_)) }
```

**In-cluster secrets** (not in Git — apply imperatively after cluster restart):
```powershell
$kubectl = "C:\Program Files\Docker\Docker\resources\bin\kubectl.exe"
& $kubectl create secret generic postgres-secrets -n fullstack --from-literal=password=postgres --dry-run=client -o yaml | & $kubectl apply -f -
@("users","orders","payments") | ForEach-Object {
  $url = "postgresql+asyncpg://postgres:postgres@postgres.fullstack.svc.cluster.local:5432/$_"
  & $kubectl create secret generic "${_}-secrets" -n fullstack --from-literal=database-url=$url --dry-run=client -o yaml | & $kubectl apply -f -
}
```

**ArgoCD kustomize config** (already patched — survives restarts):
- `argocd-cm` ConfigMap has `kustomize.buildOptions: --load-restrictor LoadRestrictionsNone`

---

## Do Not

- Do not hardcode secrets, passwords, or API keys in source code
- Do not use `passlib` — use `bcrypt` directly (passlib incompatible with bcrypt 5.x)
- Do not use synchronous SQLAlchemy (`create_engine`) — always `create_async_engine`
- Do not return raw `dict` from endpoints — always use a Pydantic response model
- Do not query another service's database directly — use HTTP calls
- Do not use sync HTTP clients (`requests`) — use `httpx.AsyncClient`
- Do not commit `.env` files or K8s Secret manifests with real values
- Do not register `/{id}` routes before named routes like `/stats` or `/user/{uid}`
