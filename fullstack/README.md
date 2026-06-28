# Fullstack — Kubernetes-Native Admin Dashboard

A production-grade fullstack application: three FastAPI microservices, a React 18 admin dashboard, and a GitOps deployment pipeline. Demonstrates real-world patterns — JWT auth with refresh tokens, RBAC, structured observability, hardened Kubernetes workloads, and automated security scanning.

---

## Architecture

```
Browser → NGINX ingress (HTTPS + HSTS)
              │
    ┌─────────┼──────────┬───────────────┐
    ▼         ▼          ▼               ▼
 frontend   users      orders        payments
 React 18   FastAPI    FastAPI       FastAPI
 :8080      :8000      :8000         :8000
              │
    ┌─────────┴──────────┐
    ▼                    ▼
 PostgreSQL            Redis 7
 (per-service DB)      (JWT blocklist)

Observability: Prometheus · Grafana · Loki · Tempo · Alertmanager
```

---

## Features

**Auth & RBAC**
- HS256 JWT — 15-minute access tokens + 7-day HttpOnly refresh tokens with rotation
- Both tokens blocklisted in Redis on logout; blocklist checked on every request
- `is_admin` claim in the JWT payload; `require_admin` FastAPI dependency (403 for non-admins)
- Admin bootstrap via `INITIAL_ADMIN_EMAIL` env var — first registration with that email becomes admin

**Frontend (Nexus dark theme)**
- Axios 401 interceptor deduplicates concurrent refresh calls via a shared promise
- `RequireAdmin` route guard + conditional Users nav from JWT payload decode
- React error boundaries on every route — no blank screens on component failures
- Toast notifications for 429, 5xx, and network errors

**Infrastructure**
- Multi-stage Containerfiles — non-root user (uid 1001), `readOnlyRootFilesystem: true`, `capabilities: drop ALL`
- Alembic migrations run as Kubernetes init containers before each deployment
- Daily PostgreSQL backups (`pg_dump | gzip`) to a PVC — 7-day retention
- HTTPS redirect + HSTS (1 year) at the ingress; nginx asset caching (`/assets/*` immutable)
- HPA, PDB, and NetworkPolicy for all workloads

**Observability**
- Prometheus metrics + auto-provisioned Grafana dashboard
- Loki + Promtail for structured JSON log aggregation
- Tempo for distributed traces via OpenTelemetry
- Alertmanager with Slack integration

**CI/CD**
- GitHub Actions: tests → E2E (real backends) → Podman build → **Trivy CRITICAL scan** → Kustomize update → ArgoCD sync
- Images with CRITICAL CVEs never reach production
- Dependabot: weekly PRs for pip (3 services), npm, and GitHub Actions

---

## Quick Start

### Prerequisites

- Python 3.11+, Node.js 20+
- Podman with `fullstack-postgres` (port 5432) and `fullstack-redis` (port 6379) containers

### Windows — one-shot startup

```powershell
# From fullstack/
.\start-dev.ps1
```

Opens terminal windows for each backend service, starts the Vite dev server, starts k3s in WSL2, and port-forwards ArgoCD (`:8080`), Grafana (`:3001`), and Prometheus (`:9090`).

### Manual startup

```powershell
podman start fullstack-postgres fullstack-redis

# Backend — run each in a separate terminal
# PYTHONPATH must include services/ so `import shared` resolves
$env:PYTHONPATH = "C:\path\to\fullstack\services"
$env:INITIAL_ADMIN_EMAIL = "admin@example.com"   # users service only
cd services/users    && python -m uvicorn app.main:app --reload --port 8001
cd services/orders   && python -m uvicorn app.main:app --reload --port 8002
cd services/payments && python -m uvicorn app.main:app --reload --port 8003

cd frontend && npm run dev   # http://localhost:3000
```

### Seed demo data

```powershell
python seed.py
```

Creates 11 users (`admin@example.com` → `is_admin=True`), ~35 orders, ~30 payments. Authenticates as admin before calling protected endpoints.

Log in at `http://localhost:3000` with `admin@example.com` / `admin123`.

---

## Testing

```powershell
# Unit tests — each service targets its own *_test database
cd services/users    && python -m pytest tests/ -v
cd services/orders   && python -m pytest tests/ -v
cd services/payments && python -m pytest tests/ -v

# Frontend unit tests (Vitest)
cd frontend && npm test

# E2E tests — requires all services running + seed data loaded
cd frontend && npx playwright test
cd frontend && npx playwright test --ui    # interactive
```

RBAC tests are parametrized across all three protected endpoints: no token → 401, non-admin token → 403, admin token → 200. The `admin_headers`/`user_headers` fixtures generate JWTs directly without touching the database.

---

## Building Images

The backend build context is `services/` (not `services/<name>/`) — the Containerfile copies both the service subdirectory and the shared module:

```bash
podman build -t fullstack/users:latest    -f services/users/Containerfile    services/
podman build -t fullstack/orders:latest   -f services/orders/Containerfile   services/
podman build -t fullstack/payments:latest -f services/payments/Containerfile services/
podman build -t fullstack/frontend:latest -f frontend/Containerfile          frontend/
```

---

## API Reference

### Users `:8001`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Health check |
| POST | `/api/v1/users` | — | Register `{email, password}` |
| POST | `/api/v1/auth/token` | — | Login → access token + refresh cookie |
| POST | `/api/v1/auth/refresh` | cookie | Rotate tokens |
| POST | `/api/v1/auth/logout` | Bearer | Blocklist tokens, clear cookie |
| GET | `/api/v1/users` | **admin** | List users |
| GET | `/api/v1/users/{id}` | **admin** | Get user |
| PATCH | `/api/v1/users/{id}/status` | **admin** | Toggle active/inactive |

### Orders `:8002`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Health check |
| POST | `/api/v1/orders` | Bearer | Create `{user_id, total}` |
| GET | `/api/v1/orders` | Bearer | List orders |
| GET | `/api/v1/orders/stats` | Bearer | `{total, by_status, total_value}` |
| GET | `/api/v1/orders/{id}` | Bearer | Get order |
| PATCH | `/api/v1/orders/{id}/status` | Bearer | Update status |

Statuses: `pending → confirmed → shipped → delivered` or `cancelled`

### Payments `:8003`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Health check |
| POST | `/api/v1/payments` | Bearer | Create `{order_id, amount}` |
| GET | `/api/v1/payments` | Bearer | List payments |
| GET | `/api/v1/payments/stats` | Bearer | `{total, by_status, revenue}` |
| GET | `/api/v1/payments/{id}` | Bearer | Get payment |
| POST | `/api/v1/payments/{id}/process` | Bearer | Mark completed (idempotent) |
| PATCH | `/api/v1/payments/{id}/status` | Bearer | Set status |

---

## Deployment

CD is GitOps — the CI pipeline never runs `kubectl apply`. It writes new image SHAs to `infra/k8s/overlays/production/kustomization.yaml` and ArgoCD syncs the cluster automatically.

```
Push to main
    ├─ test (matrix)       pytest + real PostgreSQL + Redis
    ├─ test-frontend       Vitest
    ├─ test-e2e            real backends + Playwright
    ├─ build-push          docker build → ghcr.io/jaosullivan/webapp/<svc>:<sha>
    ├─ scan                Trivy CRITICAL scan (fails = no deploy)
    └─ update-manifests    kustomize edit set image → git commit → ArgoCD sync
```

**Required Kubernetes secrets** (applied imperatively — never committed):

```powershell
$kubectl = "C:\Program Files\Docker\Docker\resources\bin\kubectl.exe"
& $kubectl create secret generic shared-secrets -n fullstack `
  --from-literal=secret-key=$(openssl rand -hex 32) --dry-run=client -o yaml | & $kubectl apply -f -
@("users","orders","payments") | ForEach-Object {
  & $kubectl create secret generic "${_}-secrets" -n fullstack `
    --from-literal=database-url="postgresql+asyncpg://postgres:postgres@postgres.fullstack.svc.cluster.local:5432/$_" `
    --dry-run=client -o yaml | & $kubectl apply -f -
}
& $kubectl create secret generic postgres-secrets -n fullstack --from-literal=password=postgres --dry-run=client -o yaml | & $kubectl apply -f -
& $kubectl create secret generic grafana-admin -n fullstack --from-literal=admin-user=admin --from-literal=admin-password=admin --dry-run=client -o yaml | & $kubectl apply -f -
& $kubectl create secret generic alertmanager-slack-secret -n fullstack --from-literal=SLACK_WEBHOOK_URL="https://hooks.slack.com/services/REPLACE_ME" --dry-run=client -o yaml | & $kubectl apply -f -
```

See [`infra/docs/secret-rotation.md`](infra/docs/secret-rotation.md) for rotation procedures.

---

## Project Layout

```
fullstack/
├── services/
│   ├── users/          # FastAPI + Alembic + tests (auth, RBAC)
│   ├── orders/         # FastAPI + Alembic + tests
│   ├── payments/       # FastAPI + Alembic + tests
│   └── shared/         # auth.py, redis.py, log.py, middleware.py, tracing.py
├── frontend/
│   ├── src/
│   │   ├── lib/        # api.ts (axios + refresh), auth.ts (JWT decode + isAdmin)
│   │   ├── pages/      # Dashboard, Users, Orders, Payments, Login
│   │   └── components/ # Sidebar, Layout, ErrorBoundary, ui/ (shadcn)
│   ├── e2e/            # Playwright: auth, dashboard, orders, users (RBAC), payments
│   └── nginx.conf      # Port 8080, SPA fallback, /assets/* immutable cache
├── infra/
│   ├── k8s/
│   │   ├── base/               # namespace, ingress (HTTPS + HSTS)
│   │   ├── services/           # Deployments with init containers + securityContext
│   │   ├── monitoring/         # Prometheus, Grafana, Loki, Promtail, Tempo, Alertmanager
│   │   └── overlays/production # Kustomize — CI writes image SHAs here
│   └── docs/secret-rotation.md
├── .github/
│   ├── workflows/ci.yml        # Full pipeline with Trivy scan
│   └── dependabot.yml          # Weekly pip + npm + Actions updates
├── seed.py
├── start-dev.ps1               # Windows: everything in one command
└── CLAUDE.md                   # AI assistant context — kept in sync
```

---

## Tech Stack

| | |
|---|---|
| **Backend** | Python 3.11, FastAPI, SQLAlchemy 2.x async, Alembic, Pydantic v2 |
| **Auth** | python-jose HS256, bcrypt (direct), Redis blocklist, refresh token rotation |
| **Frontend** | React 18, TypeScript 5, Vite, React Router v6, axios, Tailwind v4, shadcn/ui |
| **Database** | PostgreSQL 16 (asyncpg), Redis 7 |
| **Containers** | Podman, multi-stage Containerfiles, non-root uid 1001, readOnlyRootFilesystem |
| **Orchestration** | Kubernetes (k3s locally), HPA, PDB, NetworkPolicy, cert-manager TLS |
| **Observability** | Prometheus, Grafana, Loki, Tempo (OTel gRPC), Alertmanager + Slack |
| **CI/CD** | GitHub Actions, Trivy scanning, ArgoCD GitOps, Dependabot |
