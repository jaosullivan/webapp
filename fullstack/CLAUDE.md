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
│   ├── users/                 # FastAPI — registration, JWT auth, RBAC (port 8001)
│   ├── orders/                # FastAPI — order lifecycle (port 8002)
│   ├── payments/              # FastAPI — payment processing (port 8003)
│   └── shared/                # Shared auth (get_current_user_id, require_admin), redis, log, middleware, tracing
├── frontend/                  # React 18 + TypeScript + Vite admin dashboard (port 3000)
│   ├── e2e/                   # Playwright E2E tests (auth, dashboard, orders, users, payments)
│   ├── nginx.conf             # nginx-unprivileged config: port 8080, asset caching, SPA fallback
│   └── Containerfile          # Multi-stage: node builder → nginxinc/nginx-unprivileged:alpine (port 8080)
├── infra/
│   ├── k8s/
│   │   ├── base/              # namespace.yaml, ingress.yaml (HTTPS redirect + HSTS enforced)
│   │   ├── services/          # Deployment + Service per workload (securityContext, init containers)
│   │   ├── monitoring/        # Prometheus, Grafana, Loki, Promtail, Tempo, Alertmanager
│   │   ├── overlays/
│   │   │   └── production/    # Kustomize overlay — CI writes image tags here
│   │   └── secrets/           # Managed manually out-of-band, never committed
│   ├── argocd/
│   │   ├── project.yaml       # ArgoCD AppProject
│   │   └── apps/fullstack-app.yaml  # ArgoCD Application — auto-syncs production overlay
│   ├── docs/
│   │   └── secret-rotation.md # Runbook: JWT, DB passwords, Grafana, Slack webhook rotation
│   └── database/              # postgres.yaml, redis.yaml with PVCs
├── .github/
│   ├── workflows/
│   │   ├── ci.yml             # test → build → scan (Trivy) → update-manifests → ArgoCD sync
│   │   └── bootstrap-argocd.yml
│   └── dependabot.yml         # Weekly updates: pip (3 services) + npm (frontend) + GitHub Actions
├── seed.py                    # Demo data via APIs — authenticates as admin before order/payment creation
├── start-dev.ps1              # One-shot: Podman + services + frontend + k3s + port-forwards
└── docker-compose.yml         # PostgreSQL 16 + Redis 7 for local dev (use Podman)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2.x (async), Alembic |
| Auth | `python-jose` HS256 JWT (15 min access + 7 day refresh), `bcrypt` (direct, not passlib) |
| RBAC | `is_admin` User field; `require_admin` FastAPI dependency; `INITIAL_ADMIN_EMAIL` bootstrap |
| Frontend | React 18, TypeScript 5, Vite 8, React Router v6, axios |
| UI Components | shadcn/ui (manual, no CLI) + Tailwind CSS v4 + lucide-react |
| Primary DB | PostgreSQL 16 (`asyncpg` async, `psycopg2-binary` for Alembic migrations) |
| Cache / Blocklist | Redis 7 — refresh token rotation + JWT blocklist (`blocklist:{token}` keys with TTL) |
| Observability | Prometheus + Grafana dashboard + Loki + Promtail + Tempo (OTel tracing) + Alertmanager |
| Container | Podman / Containerfile — multi-stage, non-root user 1001, `readOnlyRootFilesystem` |
| Orchestration | Kubernetes (k3s locally) — HPA, PDB, NetworkPolicy, securityContext, init containers |
| CI/CD | GitHub Actions → Trivy scan → ArgoCD GitOps |
| Testing | pytest + pytest-asyncio + httpx (ASGITransport) + Playwright E2E |

---

## API Endpoints

### Users service — port 8001

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Health check |
| POST | `/api/v1/users` | — | Register user (`{email, password}`) |
| POST | `/api/v1/auth/token` | — | Login — returns access token + sets refresh cookie (rate limited 50/min) |
| POST | `/api/v1/auth/refresh` | refresh cookie | Rotate tokens (rate limited 20/min) |
| POST | `/api/v1/auth/logout` | Bearer | Blocklist both tokens, clear cookie |
| GET | `/api/v1/users` | **admin** | List users (`?skip=&limit=`) |
| GET | `/api/v1/users/{id}` | **admin** | Get user |
| PATCH | `/api/v1/users/{id}/status` | **admin** | Toggle active/inactive |

### Orders service — port 8002

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Health check |
| POST | `/api/v1/orders` | Bearer | Create order (`{user_id, total}`) |
| GET | `/api/v1/orders` | Bearer | List orders (`?skip=&limit=`) |
| GET | `/api/v1/orders/stats` | Bearer | Aggregate stats — total, by_status, total_value |
| GET | `/api/v1/orders/user/{user_id}` | Bearer | Orders for a user |
| GET | `/api/v1/orders/{id}` | Bearer | Get order |
| PATCH | `/api/v1/orders/{id}/status` | Bearer | Update status (`{status}`) |

Order statuses: `pending` → `confirmed` → `shipped` → `delivered` | `cancelled`

### Payments service — port 8003

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Health check |
| POST | `/api/v1/payments` | Bearer | Create payment (`{order_id, amount}`) |
| GET | `/api/v1/payments` | Bearer | List payments (`?skip=&limit=`) |
| GET | `/api/v1/payments/stats` | Bearer | Aggregate stats — total, by_status, revenue |
| GET | `/api/v1/payments/{id}` | Bearer | Get payment |
| POST | `/api/v1/payments/{id}/process` | Bearer | Mark completed, assign provider_ref (idempotent) |
| PATCH | `/api/v1/payments/{id}/status` | Bearer | Set status |

---

## Per-Service Layout

```
services/<name>/
├── app/
│   ├── main.py            # FastAPI app + lifespan (create_all) + CORS + rate limiter + OTel
│   ├── api/routes.py      # All endpoints — call get_db directly, no repo layer
│   ├── core/
│   │   ├── config.py      # pydantic-settings BaseSettings (reads .env)
│   │   ├── limiter.py     # slowapi rate limiter instance
│   │   └── security.py    # JWT encode/decode (users service only); create_access_token(is_admin=)
│   ├── db/
│   │   ├── base.py        # DeclarativeBase
│   │   └── session.py     # create_async_engine, AsyncSessionLocal, get_db, init_db
│   ├── models/<entity>.py # SQLAlchemy ORM models
│   └── schemas/<entity>.py# Pydantic request/response schemas
├── migrations/
│   ├── env.py             # Alembic env — swaps asyncpg → psycopg2 for sync migration runner
│   ├── script.py.mako
│   └── versions/          # Migration files (0001_initial_schema.py, 0002_add_is_admin.py, …)
├── tests/
│   ├── conftest.py        # engine, clean_tables, client, admin_headers, user_headers fixtures
│   └── test_<name>.py     # Full test suite including RBAC 401/403 parametrized tests
├── alembic.ini
├── Containerfile          # Multi-stage: builder (--prefix=/deps) → runtime (non-root uid 1001)
└── pyproject.toml
```

---

## Auth Architecture

**Access tokens**: HS256 JWT, 15-minute TTL, payload `{sub, exp, admin}`. Sent as `Authorization: Bearer`.

**Refresh tokens**: HS256 JWT, 7-day TTL, payload `{sub, exp, type:"refresh"}`. Set as `HttpOnly; SameSite=Lax; Path=/api/v1/auth` cookie. **Rotated on every use** — old refresh token is blocklisted on each successful refresh.

**Redis blocklist**: both token types are added to `blocklist:{token}` with a TTL matching the token's remaining lifetime on logout. The `get_current_user_id` and `require_admin` dependencies check the blocklist on every request.

**RBAC**: `require_admin` (`shared/auth.py`) decodes the bearer token, checks `payload.get("admin", False)`, raises 403 if False. The `admin` claim is set at login time using `user.is_admin` from the DB. Token refresh re-fetches `is_admin` from the DB so promotions/demotions take effect on the next refresh.

**Admin bootstrap**: set `INITIAL_ADMIN_EMAIL` env var on the users service. The first `POST /api/v1/users` call with that email gets `is_admin=True` automatically. In production k8s this is `admin@example.com` (see `users.yaml`). For local dev, `start-dev.ps1` sets this env var on the users process.

**Frontend auth flow**: `api.ts` uses a single `_refreshPromise` to deduplicate concurrent 401 → refresh calls. If the refresh endpoint itself returns 401, the interceptor clears the token and redirects to `/login`. The `/auth/token` (login) endpoint is **exempt** from this refresh flow — a 401 from login means wrong credentials, not an expired token; the interceptor passes it straight to the caller so the LoginPage can render the error message. `src/lib/auth.ts` provides `isAdmin()` which base64-decodes the JWT payload from localStorage — used by `RequireAdmin` route guard and the conditional Users link in the Sidebar.

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

Starts Podman containers, all three backend services (with `INITIAL_ADMIN_EMAIL=admin@example.com`), Vite dev server, k3s cluster in WSL2, and port-forwards for ArgoCD (`:8080`), Grafana (`:3001`), and Prometheus (`:9090`).

### Manual startup

```powershell
# Start Podman containers
podman start fullstack-postgres fullstack-redis

# Per-service — set PYTHONPATH so `import shared` resolves
$env:PYTHONPATH = "C:\MSDE\Webapp\fullstack\services"
$env:INITIAL_ADMIN_EMAIL = "admin@example.com"  # users service only
cd services/users && python -m uvicorn app.main:app --reload --port 8001
cd services/orders && python -m uvicorn app.main:app --reload --port 8002
cd services/payments && python -m uvicorn app.main:app --reload --port 8003

# Frontend
cd frontend && npm run dev    # http://localhost:3000
```

### Seed demo data

```powershell
# From fullstack/ — requires all three services to be running
python seed.py
```

Creates 11 users (admin@example.com gets `is_admin=True`), ~35 orders, ~30 payments. The script logs in as admin before calling any protected endpoints (order/payment creation and listing all require a JWT).

### Run tests

```powershell
cd services/users    && python -m pytest tests/ -v
cd services/orders   && python -m pytest tests/ -v
cd services/payments && python -m pytest tests/ -v
```

Tests use real PostgreSQL (`users_test`, `orders_test`, `payments_test`). Tables are truncated between each test. `admin_headers`/`user_headers` fixtures in conftest generate JWTs directly (no DB writes) so user-count assertions are not affected.

### Run E2E tests

```powershell
# Requires all three services running on :8001/:8002/:8003 and seed data loaded
cd frontend
npx playwright test            # headless
npx playwright test --ui       # interactive UI mode
```

---

## Building Images (Podman)

The build context for backend services is `services/` (not `services/<name>/`) because the Containerfile copies both the service subdirectory and `shared/`:

```bash
# From fullstack/
podman build -t fullstack/users:latest    -f services/users/Containerfile    services/
podman build -t fullstack/orders:latest   -f services/orders/Containerfile   services/
podman build -t fullstack/payments:latest -f services/payments/Containerfile services/
podman build -t fullstack/frontend:latest -f frontend/Containerfile          frontend/
```

All backend images: multi-stage (builder installs deps to `--prefix=/deps`, runtime copies `/deps` to `/usr/local`), non-root user/group `app` (uid/gid 1001), `PYTHONDONTWRITEBYTECODE=1`. Alembic files (`alembic.ini`, `migrations/`) are included so the init container can run migrations.

Frontend: `nginxinc/nginx-unprivileged:alpine` serving on port 8080 with a custom `nginx.conf` (aggressive caching for hashed `/assets/*`, no-cache for `index.html`).

---

## Kubernetes

Cluster state is managed by ArgoCD — do not `kubectl apply` the service manifests directly.

**Security posture** (all backend + frontend pods):
- Pod-level: `runAsNonRoot: true`, `runAsUser: 1001` (101 for nginx-unprivileged)
- Container-level: `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities: {drop: [ALL]}`
- Backend pods have a `/tmp` emptyDir; frontend pod has `/var/cache/nginx`, `/var/run`, `/tmp` emptyDirs

**Alembic init containers**: each backend Deployment has an `initContainers.migrate` that runs `alembic upgrade head` before the app starts, using the same image and DATABASE_URL secret. This ensures schema migrations are applied before traffic reaches the new version.

**Ingress**: `ingressClassName: nginx` routing `fullstack.local`. TLS via cert-manager. HTTPS redirect and HSTS (1 year) enforced via annotations.

**NGINX ingress controller** (installed on local k3s):
```powershell
$env:KUBECONFIG = "C:\Users\johna\.kube\k3s-config.yaml"
helm install ingress-nginx ingress-nginx/ingress-nginx `
    --namespace ingress-nginx --create-namespace `
    --set controller.admissionWebhooks.enabled=false `
    --set controller.service.type=NodePort
```

**Monitoring** (deployed in `fullstack` namespace):
- Prometheus scrapes `/metrics` from all three services (prometheus-fastapi-instrumentator)
- Grafana auto-provisions "Fullstack — Service Overview" dashboard + Loki + Tempo datasources
- Loki + Promtail collect structured JSON logs from all pods
- Tempo receives OTel traces from services via gRPC on port 4317
- Alertmanager sends Slack alerts (webhook URL in `alertmanager-slack-secret`)

```powershell
& $kubectl port-forward svc/prometheus  -n fullstack 9090:9090
& $kubectl port-forward svc/grafana     -n fullstack 3001:3000
& $kubectl port-forward svc/tempo       -n fullstack 3200:3200
```

**NetworkPolicies** (`infra/k8s/services/network-policies.yaml`): `default-deny-ingress` blocks all pod ingress by default. Every workload needs a matching allow rule or it will be unreachable. Current allow rules: `frontend` (from ingress-nginx), `backends` (from ingress-nginx + prometheus), `postgres` (from users/orders/payments/postgres-backup on port 5432), `redis` (from backends on port 6379), plus monitoring stack rules. The `postgres-backup` CronJob pod template carries `app: postgres-backup` label so the postgres NetworkPolicy can select it.

**PostgreSQL backups**: `postgres-backup` CronJob runs daily at 02:00 UTC, dumps all three databases with `pg_dump | gzip`, retains 7 days on a 5Gi PVC (`local-path`, `WaitForFirstConsumer` — binds on first pod mount).

**In-cluster secrets** (apply imperatively after cluster restart — never committed to Git):

`shared-secrets` is the most critical — without it all backend pods crash at startup (`CreateContainerConfigError`). `start-dev.ps1` auto-recreates it if missing. Manual recreation (PowerShell — no `openssl` needed):

```powershell
$kubectl = "C:\Program Files\Docker\Docker\resources\bin\kubectl.exe"
# Shared JWT secret (generates 32 random bytes as hex using PowerShell)
$sk = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
& $kubectl create secret generic shared-secrets -n fullstack --from-literal="secret-key=$sk" --dry-run=client -o yaml | & $kubectl apply -f -
# Per-service DB URLs
@("users","orders","payments") | ForEach-Object {
  $url = "postgresql+asyncpg://postgres:postgres@postgres.fullstack.svc.cluster.local:5432/$_"
  & $kubectl create secret generic "${_}-secrets" -n fullstack --from-literal=database-url=$url --dry-run=client -o yaml | & $kubectl apply -f -
}
# Postgres password (used by backup CronJob)
& $kubectl create secret generic postgres-secrets -n fullstack --from-literal=password=postgres --dry-run=client -o yaml | & $kubectl apply -f -
# Grafana admin credentials
& $kubectl create secret generic grafana-admin -n fullstack --from-literal=admin-user=admin --from-literal=admin-password=admin --dry-run=client -o yaml | & $kubectl apply -f -
# Alertmanager Slack webhook
& $kubectl create secret generic alertmanager-slack-secret -n fullstack --from-literal=SLACK_WEBHOOK_URL="https://hooks.slack.com/services/REPLACE_ME" --dry-run=client -o yaml | & $kubectl apply -f -
```

See `infra/docs/secret-rotation.md` for the full rotation procedure.

**ArgoCD kustomize config** (already patched — survives restarts via `bootstrap-argocd.yml`):
- `argocd-cm` has `kustomize.buildOptions: --load-restrictor LoadRestrictionsNone`
- `argocd-cm` has a custom Lua PVC health check: maps `Pending` → `Healthy` so PVCs using `WaitForFirstConsumer` (k3s `local-path` StorageClass) don't hold the app in a perpetual Progressing state. The `postgres-backup-pvc` uses this mode and only binds when a pod first mounts it. Trigger a one-off job to force binding: `kubectl create job -n fullstack --from=cronjob/postgres-backup postgres-backup-init`

**ArgoCD AppProject whitelist** (`infra/argocd/project.yaml`): the `fullstack` AppProject controls which resource kinds ArgoCD is allowed to sync. Any resource kind not in `namespaceResourceWhitelist` will cause the entire sync to fail with "resource ... is not permitted in project fullstack". Current permitted kinds: `Deployment`, `Service`, `ConfigMap`, `PersistentVolumeClaim`, `Ingress`, `NetworkPolicy`, `PodDisruptionBudget`, `HorizontalPodAutoscaler`, `CronJob`. When adding new resource kinds to the manifests, update the whitelist first and apply it (`kubectl apply -f infra/argocd/project.yaml`) before pushing.

### Local cluster (k3s in WSL2 Ubuntu)

**Kubeconfig**: `C:\Users\johna\.kube\k3s-config.yaml`  
**kubectl**: `C:\Program Files\Docker\Docker\resources\bin\kubectl.exe`

The WSL2 NIC IP changes on each restart. `start-dev.ps1` refreshes it automatically. Manual refresh:
```powershell
$wslIp = (wsl -d Ubuntu -u root -- hostname -I) -split '\s+' | Select-Object -First 1
(Get-Content "C:\Users\johna\.kube\k3s-config.yaml" -Raw) -replace '[\d.]+(?=:\d{4,})', $wslIp |
  Set-Content "C:\Users\johna\.kube\k3s-config.yaml" -Encoding utf8
```

---

## Frontend

- **App name**: Nexus (dark SaaS theme — zinc/indigo)
- Vite proxy: `/api/v1/auth`, `/api/v1/users` → `:8001`; `/api/v1/orders` → `:8002`; `/api/v1/payments` → `:8003`
- **JWT**: stored in `localStorage`. `src/lib/auth.ts` — `decodeToken()` base64-decodes the JWT payload, `isAdmin()` checks the `admin` claim. Used by `RequireAdmin` route guard and Sidebar conditional rendering.
- **Token refresh**: axios 401 interceptor in `api.ts` calls `POST /auth/refresh` (HttpOnly cookie is sent automatically). Concurrent 401s are deduplicated via `_refreshPromise`. Refresh 401 → clear token → redirect to `/login`.
- **Error boundaries**: `src/components/ErrorBoundary.tsx` wraps each route page — shows "Something went wrong" with a "Try again" reset button instead of a blank screen.
- **Toasts**: `src/contexts/ToastContext` + `api.ts._onApiError` — 429, 5xx, and network errors show toast notifications.
- shadcn/ui components are hand-written (no CLI) in `frontend/src/components/ui/`.

---

## Conventions

### Python / FastAPI

- All config from environment variables via `pydantic-settings`.
- `async def` throughout — never sync SQLAlchemy or sync HTTP clients.
- Routes call `AsyncSession` via `Depends(get_db)` directly — no repository layer.
- Every endpoint returns a Pydantic response model — never raw dicts.
- UUID string PKs on all models: `default=lambda: str(uuid.uuid4())`.
- Response schemas use `model_config = {"from_attributes": True}`.
- Raise `HTTPException` for all error responses.
- Every service exposes `GET /health → {"status": "ok"}`. The health handler creates a **fresh `NullPool` engine** per call (`create_async_engine(url, poolclass=NullPool)`) rather than reusing the module-level pool. `QueuePool` binds its internal `asyncio.Queue` to the first event loop that uses it; disposing the pool does not reset the queue, causing "attached to a different loop" errors across test functions.
- Stats/aggregate routes registered **before** `/{id}` routes to avoid FastAPI matching `stats` as an ID.

### Auth (users service only)

- Passwords hashed with `bcrypt` directly — `passlib` is incompatible with bcrypt 4+, never use it.
- `create_access_token(subject, secret_key, expire_minutes, is_admin=False)` — always pass `is_admin`.
- Login endpoint accepts `application/x-www-form-urlencoded` (OAuth2PasswordRequestForm).
- `require_admin` is a FastAPI dependency in `shared/auth.py` — import it from there, do not re-implement.

### Migrations (Alembic)

- All three services have `alembic.ini` + `migrations/versions/` — use Alembic for every schema change, never raw `CREATE TABLE`.
- Migration files follow the naming pattern `NNNN_<description>.py`.
- `env.py` swaps `asyncpg` → `postgresql://` (psycopg2) for the sync migration runner.
- In production, migrations run automatically via the `migrate` init container before the app starts.
- **DuplicateTable recovery**: if the database was bootstrapped via `create_all` (e.g. after a fresh cluster) but the `alembic_version` table is missing, the init container will fail with `DuplicateTable`. Fix by stamping each database with its head revision via the postgres pod:
  ```powershell
  $k = "C:\Program Files\Docker\Docker\resources\bin\kubectl.exe"
  $pg = (& $k get pod -n fullstack -l app=postgres -o jsonpath='{.items[0].metadata.name}')
  & $k exec -n fullstack $pg -- psql -U postgres -d users    -c "CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL, CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)); DELETE FROM alembic_version; INSERT INTO alembic_version VALUES ('0002');"
  & $k exec -n fullstack $pg -- psql -U postgres -d orders   -c "CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL, CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)); DELETE FROM alembic_version; INSERT INTO alembic_version VALUES ('0001');"
  & $k exec -n fullstack $pg -- psql -U postgres -d payments -c "CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL, CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)); DELETE FROM alembic_version; INSERT INTO alembic_version VALUES ('0001');"
  ```
  Then delete the crashing pods so they restart and re-run migrations cleanly.

### Inter-service communication

- `services/shared/auth.py` provides `get_current_user_id` and `require_admin` for orders/payments.
- Each service owns its own database — no cross-service DB queries.

### TypeScript / React

- Functional components only; class components only for `ErrorBoundary`.
- `react-router-dom` v6 for routing.
- All API calls go through the axios instance in `src/lib/api.ts` — never use `fetch` directly.
- Auth utilities (`isAdmin`, `decodeToken`) live in `src/lib/auth.ts`.
- File naming: `PascalCase` components, `camelCase` utilities.

### Testing

- Unit tests use `ASGITransport` (in-process) — no running server needed.
- `conftest.py` sets `DATABASE_URL` and `INITIAL_ADMIN_EMAIL` env vars **before** any app imports.
- `admin_headers` / `user_headers` fixtures generate JWT tokens directly (no DB writes) — count-based assertions remain accurate.
- RBAC tests are parametrized: `(method, path)` × `(no token → 401, non-admin → 403)`.
- `pytest-asyncio` uses `asyncio_default_test_loop_scope = "function"` — each test gets its own event loop. The module-level `QueuePool` engine binds its queue to the first loop; health check tests must use a fresh `NullPool` engine per call to avoid "attached to a different loop" errors.
- Do not add `structlog.stdlib.add_logger_name` to shared processors — it calls `logger.name` which only exists on stdlib `logging.Logger`, not `PrintLogger` from `PrintLoggerFactory()`.
- E2E Playwright tests in `frontend/e2e/` cover login, dashboard, orders, users (RBAC), and payments.
- Vitest `include: ["src/test/**/*.{test,spec}.{ts,tsx}"]` is required in `vite.config.ts` — without it the Vitest glob also picks up `e2e/*.spec.ts` Playwright files, which fail because `test.describe()` isn't in scope.
- E2E login helpers must use a content-based navigation check — `page.getByRole("heading", { name: "Overview" }).waitFor({ timeout: 8000 })` — not `page.waitForURL("/")`. React Router SPA navigation can be missed by the URL poller.
- The `/auth/token` login endpoint is rate-limited at **50/minute** per IP. The full E2E suite makes ~22 login calls; this limit covers the suite with headroom for retries.

---

## CI/CD

### Flow

```
Push to main
    │
    ├─ test (matrix: users, orders, payments)
    │       pytest + real PostgreSQL + Redis service containers
    │
    ├─ test-frontend
    │       Vitest unit tests
    │
    ├─ test-e2e (on push only)
    │       postgres + redis services, all three backends started via uvicorn
    │       seed.py populates data, Playwright runs against http://localhost:3000
    │
    ├─ build-push (after test + test-frontend)
    │       docker build + push to ghcr.io/jaosullivan/webapp/<service>:<sha>
    │
    ├─ scan (after build-push, parallel across 4 images)
    │       Trivy CLI (direct install) — fails on CRITICAL CVEs that have a fix available
    │       (`--ignore-unfixed` skips CVEs with no fixed version in the base OS package)
    │
    └─ update-manifests (after build-push + scan)
            kustomize edit set image → production/kustomization.yaml
            git commit [skip ci]
                │
                └─ ArgoCD auto-syncs cluster
```

### Dependabot

`.github/dependabot.yml` — weekly PRs for:
- GitHub Actions versions
- pip deps for each of the three services
- npm deps for frontend (React ecosystem and Tailwind grouped)

### Image registry

`ghcr.io/jaosullivan/webapp/<service>:<sha>` and `:latest`

### Secrets required

| Secret | Where | Value |
|---|---|---|
| `GITHUB_TOKEN` | Auto-provided | Push packages to ghcr.io, commit manifest changes |
| `KUBECONFIG` | GitHub Actions environment `production` | One-time bootstrap only |

---

## Do Not

- Do not hardcode secrets, passwords, or API keys in source code
- Do not use `passlib` — use `bcrypt` directly (incompatible with bcrypt 5.x)
- Do not use synchronous SQLAlchemy (`create_engine`) — always `create_async_engine`
- Do not return raw `dict` from endpoints — always use a Pydantic response model
- Do not query another service's database directly — use HTTP calls
- Do not use sync HTTP clients (`requests`) — use `httpx.AsyncClient`
- Do not commit `.env` files or K8s Secret manifests with real values
- Do not register `/{id}` routes before named routes like `/stats` or `/user/{uid}`
- Do not add new schema changes without a corresponding Alembic migration
- Do not bypass `require_admin` — re-implement it — import it from `shared/auth.py`
- Do not push images that fail Trivy CRITICAL scan — the `scan` CI job gates `update-manifests`
- Do not use `fetch` directly in the frontend — route all API calls through `src/lib/api.ts`
- Do not add `structlog.stdlib.add_logger_name` to shared processors — `PrintLogger` has no `.name` attribute; use `add_log_level` and `TimeStamper` only
- Do not use `page.waitForURL("/")` after login in E2E tests — use `page.getByRole("heading", { name: "Overview" }).waitFor()` instead
- Do not reuse the module-level SQLAlchemy engine in health check handlers — create a fresh `NullPool` engine per call and dispose it in a `finally` block
- Do not add new Kubernetes resource kinds to the production overlay without also adding them to `infra/argocd/project.yaml` `namespaceResourceWhitelist` — ArgoCD will fail the entire sync with "not permitted" and block all resources, not just the new one
- Do not add a new workload (Deployment, CronJob, etc.) that connects to postgres without adding a corresponding NetworkPolicy rule — `default-deny-ingress` blocks all pod ingress; connection refused at the TCP level is the symptom
- Do not use `openssl rand` in PowerShell scripts — it is not available on Windows; use `-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })` to generate a 32-byte hex secret
