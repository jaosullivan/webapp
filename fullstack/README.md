# Fullstack — Cloud-Native Admin Dashboard

A production-ready full-stack application demonstrating microservices architecture, test-driven development, and Kubernetes deployment. Three FastAPI backend services, a React admin dashboard, PostgreSQL, Redis, and a GitHub Actions CI/CD pipeline.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Admin Dashboard                  │
│            (Vite · TypeScript · Tailwind CSS v4)          │
│                      localhost:3000                       │
└──────────┬────────────────┬────────────────┬─────────────┘
           │ /api/v1/users  │ /api/v1/orders │ /api/v1/payments
           ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Users        │  │ Orders       │  │ Payments     │
│ FastAPI      │  │ FastAPI      │  │ FastAPI      │
│ :8001        │  │ :8002        │  │ :8003        │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                  │
       ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│              PostgreSQL 16  ·  Redis 7                   │
│         (users_db · orders_db · payments_db)             │
└─────────────────────────────────────────────────────────┘
```

---

## Features

- **Admin dashboard** — Login, overview stats, paginated tables for users / orders / payments
- **JWT authentication** — Token issued by users service, validated across all services
- **User management** — Register, list, toggle active/inactive status
- **Order lifecycle** — Create and progress orders through `pending → confirmed → shipped → delivered`
- **Payment processing** — Create, process, mark failed/refunded with provider reference tracking
- **Aggregate stats** — `GET /orders/stats` and `GET /payments/stats` for dashboard metrics
- **49 passing tests** — Full pytest suite with real PostgreSQL, table-level isolation between tests
- **TDD workflow** — Stats endpoints built red → green → refactor with pytest-watch
- **Kubernetes-ready** — Manifests, Helm chart stubs, NGINX ingress, PVCs for all workloads
- **CI/CD** — GitHub Actions (CI) + ArgoCD (CD): test → build → push → GitOps sync

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2.x async |
| Auth | python-jose (JWT HS256), bcrypt |
| Frontend | React 18, TypeScript 5, Vite 8, React Router v6, axios |
| UI | Tailwind CSS v4, shadcn/ui components, lucide-react |
| Database | PostgreSQL 16 (asyncpg) |
| Cache | Redis 7 |
| Containers | Podman / Containerfile |
| Orchestration | Kubernetes, Helm |
| CI/CD | GitHub Actions + ArgoCD |
| Testing | pytest, pytest-asyncio, httpx ASGITransport, pytest-watch |

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- Podman (or Docker)

### 1. Start the databases

```bash
podman run -d --name fullstack-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 postgres:16

podman run -d --name fullstack-redis \
  -p 6379:6379 redis:7-alpine
```

Create the application databases:

```bash
podman exec fullstack-postgres psql -U postgres -c "CREATE DATABASE users;"
podman exec fullstack-postgres psql -U postgres -c "CREATE DATABASE orders;"
podman exec fullstack-postgres psql -U postgres -c "CREATE DATABASE payments;"
```

### 2. Install and start the backend services

```bash
# Run each in a separate terminal

cd services/users && pip install -e ".[dev]"
python -m uvicorn app.main:app --reload --port 8001

cd services/orders && pip install -e ".[dev]"
python -m uvicorn app.main:app --reload --port 8002

cd services/payments && pip install -e ".[dev]"
python -m uvicorn app.main:app --reload --port 8003
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

### 4. Create your first user and seed demo data

```bash
# Register an admin account
curl -X POST http://localhost:8001/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'

# Seed ~10 users, 35 orders, 30 payments with realistic statuses
python seed.py
```

Open http://localhost:3000 and log in with your admin credentials.

> **Windows:** Run `.\start-dev.ps1` from the `fullstack/` directory to start everything at once — Podman containers, all three services, the frontend dev server, and the local k3s cluster with ArgoCD UI at `https://localhost:8080`.

---

## Project Structure

```
fullstack/
├── services/
│   ├── users/          # Auth + user management (port 8001)
│   ├── orders/         # Order lifecycle (port 8002)
│   ├── payments/       # Payment processing (port 8003)
│   └── shared/         # JWT bearer extractor shared across services
├── frontend/           # React SPA (port 3000)
├── infra/
│   ├── k8s/
│   │   ├── base/       # namespace.yaml, ingress.yaml
│   │   ├── services/   # Deployment + Service per workload
│   │   └── overlays/production/  # Kustomize overlay — image tags updated by CI
│   ├── argocd/         # AppProject + Application manifests
│   ├── helm/           # Helm chart stubs
│   └── database/       # PostgreSQL + Redis with PVCs
├── .github/workflows/
│   ├── ci.yml          # Test → build → push → update Kustomize overlay
│   └── bootstrap-argocd.yml  # One-time manual ArgoCD install
├── ops/                # Redirect stubs pointing to .github/workflows/
├── seed.py             # Demo data generator
├── start-dev.ps1       # Windows one-shot: local dev + k3s cluster + ArgoCD UI
└── docker-compose.yml  # PostgreSQL + Redis for local dev
```

Each service follows the same internal layout:

```
services/<name>/
├── app/
│   ├── main.py              # FastAPI app, lifespan (runs create_all), CORS
│   ├── api/routes.py        # All endpoints
│   ├── core/config.py       # pydantic-settings (reads .env)
│   ├── db/session.py        # Async engine, session factory, get_db
│   ├── models/<entity>.py   # SQLAlchemy ORM models
│   └── schemas/<entity>.py  # Pydantic request/response schemas
├── tests/
│   ├── conftest.py          # engine, clean_tables, client fixtures
│   └── test_<name>.py       # Full test suite
├── Containerfile
└── pyproject.toml
```

---

## API Reference

### Users — :8001

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/v1/users` | Register `{email, password}` |
| GET | `/api/v1/users` | List users — `?skip=&limit=` |
| GET | `/api/v1/users/{id}` | Get user |
| PATCH | `/api/v1/users/{id}/status` | Toggle active/inactive |
| POST | `/api/v1/auth/token` | Login — returns `{access_token, token_type}` |

### Orders — :8002

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/v1/orders` | Create `{user_id, total}` |
| GET | `/api/v1/orders` | List orders — `?skip=&limit=` |
| GET | `/api/v1/orders/stats` | `{total, by_status, total_value}` |
| GET | `/api/v1/orders/user/{user_id}` | Orders for a user |
| GET | `/api/v1/orders/{id}` | Get order |
| PATCH | `/api/v1/orders/{id}/status` | Update status |

Order statuses: `pending → confirmed → shipped → delivered` or `cancelled`

### Payments — :8003

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/v1/payments` | Create `{order_id, amount}` |
| GET | `/api/v1/payments` | List payments — `?skip=&limit=` |
| GET | `/api/v1/payments/stats` | `{total, by_status, revenue}` — revenue is completed-only |
| GET | `/api/v1/payments/{id}` | Get payment |
| POST | `/api/v1/payments/{id}/process` | Mark completed, assign provider ref (idempotent) |
| PATCH | `/api/v1/payments/{id}/status` | Set `pending`/`completed`/`failed`/`refunded` |

---

## Testing

Tests use `httpx.ASGITransport` (in-process — no running server required) against real PostgreSQL test databases. Each test starts with clean tables.

```bash
# One-time: create test databases
podman exec fullstack-postgres psql -U postgres -c "CREATE DATABASE users_test;"
podman exec fullstack-postgres psql -U postgres -c "CREATE DATABASE orders_test;"
podman exec fullstack-postgres psql -U postgres -c "CREATE DATABASE payments_test;"

# Run the full suite
cd services/users    && python -m pytest tests/ -v   # 14 tests
cd services/orders   && python -m pytest tests/ -v   # 16 tests
cd services/payments && python -m pytest tests/ -v   # 19 tests

# TDD watch mode — re-runs on every file save
cd services/orders && ptw tests/
```

The `/orders/stats` and `/payments/stats` endpoints were built using strict red → green → refactor TDD.

---

## Deployment

### Build images (Podman)

```bash
podman build -t fullstack/users:latest    -f services/users/Containerfile    services/users/
podman build -t fullstack/orders:latest   -f services/orders/Containerfile   services/orders/
podman build -t fullstack/payments:latest -f services/payments/Containerfile services/payments/
podman build -t fullstack/frontend:latest -f frontend/Containerfile          frontend/
```

### Deploy to Kubernetes

Cluster state is managed by ArgoCD — do not apply service manifests directly with `kubectl apply`. The CI pipeline writes image tags to the Kustomize overlay and ArgoCD syncs the cluster automatically.

For a new cluster, apply postgres and create the secrets (not managed by ArgoCD since they contain credentials):

```bash
kubectl apply -f infra/database/postgres.yaml -n fullstack
kubectl exec -n fullstack deploy/postgres -- psql -U postgres -c "CREATE DATABASE users;"
kubectl exec -n fullstack deploy/postgres -- psql -U postgres -c "CREATE DATABASE orders;"
kubectl exec -n fullstack deploy/postgres -- psql -U postgres -c "CREATE DATABASE payments;"

kubectl create secret generic postgres-secrets -n fullstack --from-literal=password=postgres
for svc in users orders payments; do
  kubectl create secret generic ${svc}-secrets -n fullstack \
    --from-literal=database-url="postgresql+asyncpg://postgres:postgres@postgres.fullstack.svc.cluster.local:5432/${svc}"
done
```

### CI/CD — GitHub Actions + ArgoCD

CD is GitOps: the pipeline never runs `kubectl apply`. Instead it updates the Kustomize production overlay in Git and ArgoCD syncs the cluster automatically.

```
Push to main
    │
    ├─ test            pytest against ephemeral PostgreSQL service container
    ├─ build-push      docker build + push → ghcr.io/jaosullivan/webapp/<service>:<sha>
    └─ update-manifests
              kustomize edit set image → commit infra/k8s/overlays/production/kustomization.yaml
                    │
                    └─ ArgoCD detects the change → syncs cluster automatically
```

| File | Purpose |
|---|---|
| `.github/workflows/ci.yml` | Test → build → push → update Kustomize overlay |
| `.github/workflows/bootstrap-argocd.yml` | One-time `workflow_dispatch`: install ArgoCD + register Application |
| `infra/argocd/project.yaml` | ArgoCD AppProject — scopes repo and namespaces |
| `infra/argocd/apps/fullstack-app.yaml` | ArgoCD Application — auto-sync with prune + selfHeal |
| `infra/k8s/overlays/production/kustomization.yaml` | Image tags written here by CI |

**ArgoCD bootstrap** (run once per cluster):

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.12.0/manifests/install.yaml

# Allow kustomize to resolve ../../base paths
kubectl patch configmap argocd-cm -n argocd --type merge \
  -p '{"data":{"kustomize.buildOptions":"--load-restrictor LoadRestrictionsNone"}}'
kubectl rollout restart deployment/argocd-repo-server -n argocd

kubectl apply -f infra/argocd/project.yaml
kubectl apply -f infra/argocd/apps/fullstack-app.yaml
```

**Local cluster (k3s in WSL2 Ubuntu):** `start-dev.ps1` handles k3s startup and kubeconfig refresh automatically. ArgoCD UI is available at `https://localhost:8080` (user: `admin`).

**Secrets required for CI:**

| Secret | Scope | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | Auto-provided | Push to ghcr.io, commit manifest changes |
| `KUBECONFIG` | GitHub Actions environment `production` | Bootstrap workflow only |

---

## Environment Variables

Each service reads config from environment variables or a `.env` file in the service directory.

| Service | Variable | Default |
|---|---|---|
| users | `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/users` |
| users | `SECRET_KEY` | `changeme-in-production` |
| users | `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` |
| orders | `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/orders` |
| orders | `USERS_SERVICE_URL` | `http://users:8000` |
| payments | `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/payments` |
| payments | `ORDERS_SERVICE_URL` | `http://orders:8000` |
