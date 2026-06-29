# Webapp — Kubernetes-native Fullstack App

A microservices-based fullstack application with a React admin dashboard ("Nexus"), three FastAPI backend services, and a GitOps deployment pipeline via ArgoCD on k3s.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React 18 + Vite (Nexus Admin Dashboard — port 3000)    │
└───────────────────────┬─────────────────────────────────┘
                        │ Vite proxy → /api/v1/*
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
  Users :8001     Orders :8002   Payments :8003
  FastAPI         FastAPI         FastAPI
  asyncpg         asyncpg         asyncpg
        │               │               │
        └───────────────┴───────────────┘
                        │
              PostgreSQL + Redis
```

**Deployment**: k3s (WSL2 Ubuntu) · ArgoCD GitOps · ghcr.io container registry · Kustomize overlays · Grafana + Prometheus monitoring

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind v4, Playwright (E2E), Vitest (unit) |
| Backend | FastAPI, SQLAlchemy asyncio, asyncpg, Alembic, slowapi, structlog |
| Auth | JWT access tokens (localStorage) + HttpOnly refresh token cookie, bcrypt, Redis blocklist |
| Database | PostgreSQL 16 (one DB per service) |
| Cache/Rate limit | Redis 7 |
| Containers | Podman (local), Docker (CI) |
| Orchestration | k3s on WSL2 Ubuntu |
| GitOps | ArgoCD, Kustomize |
| CI/CD | GitHub Actions → ghcr.io → ArgoCD auto-sync |
| Monitoring | Prometheus + Grafana |
| Security | Trivy CRITICAL CVE scan gates every release |

## Prerequisites

- Windows 11 with WSL2 (Ubuntu distro)
- [Podman Desktop](https://podman-desktop.io/) — for local PostgreSQL and Redis containers
- Python 3.11+ (path: `C:\Users\johna\AppData\Local\Programs\Python\Python314\python.exe`)
- Node.js 24+
- k3s installed inside the Ubuntu WSL2 distro (`sudo k3s server`)
- kubectl at `C:\Program Files\Docker\Docker\resources\bin\kubectl.exe`
- kubeconfig at `C:\Users\johna\.kube\k3s-config.yaml` (auto-refreshed by start-dev.ps1)

## Local Setup

### 1. Configure environment

Each service reads from a `.env` file (copy from `.env.example`):

```
fullstack/services/users/.env
fullstack/services/orders/.env
fullstack/services/payments/.env
```

Minimum required variables:

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/<service>
REDIS_URL=redis://localhost:6379
SECRET_KEY=<random-secret>
INITIAL_ADMIN_EMAIL=admin@example.com   # users service only
```

### 2. Start everything

```powershell
.\fullstack\start-dev.ps1
```

This script:
1. Starts Podman containers (`fullstack-postgres`, `fullstack-redis`)
2. Opens three terminal windows running each backend service with `uvicorn --reload`
3. Opens a terminal running the Vite dev server
4. Starts/refreshes the k3s cluster in WSL2 and updates kubeconfig with the current WSL2 IP
5. Port-forwards ArgoCD (8080→443), Grafana (3001→3000), Prometheus (9090→9090)
6. Prints the ArgoCD admin password
7. Auto-recreates `shared-secrets` if missing (lost on every k3s restart)

To stop the environment:

```powershell
.\fullstack\shutdown-dev.ps1              # stops everything; leaves k3s running (faster restart)
.\fullstack\shutdown-dev.ps1 -StopCluster # full shutdown including k3s in WSL2
```

### 3. Seed demo data

After services are healthy:

```powershell
cd fullstack
python seed.py
```

This creates the admin user (`admin@example.com` / `admin123`), sample users, orders, and payments.

## Local Service URLs

| Service | URL | Credentials |
|---|---|---|
| Nexus Dashboard | http://localhost:3000 | admin@example.com / admin123 |
| Users API docs | http://localhost:8001/docs | — |
| Orders API docs | http://localhost:8002/docs | — |
| Payments API docs | http://localhost:8003/docs | — |
| ArgoCD UI | https://localhost:8080 | admin / (printed by start-dev.ps1; accept self-signed cert) |
| Grafana | http://localhost:3001 | admin / (see `grafana-admin` k8s Secret) |
| Prometheus | http://localhost:9090 | — |

## Running Tests

### Backend (pytest + asyncio)

```powershell
cd fullstack\services\users    ; python -m pytest tests/ -v
cd fullstack\services\orders   ; python -m pytest tests/ -v
cd fullstack\services\payments ; python -m pytest tests/ -v
```

Each service test suite creates its own in-memory SQLite database. Tests use `asyncio_default_test_loop_scope=function` (each test gets an isolated event loop). Health check handlers use `NullPool` engines to avoid asyncio loop binding issues across test functions.

### Frontend unit tests (Vitest)

```powershell
cd fullstack\frontend
npm test
```

Only files matching `src/test/**/*.{test,spec}.{ts,tsx}` are picked up — Playwright E2E specs are excluded.

### E2E tests (Playwright)

Requires all three backend services running and seed data loaded:

```powershell
cd fullstack\frontend
npx playwright test           # headless (Chromium)
npx playwright test --ui      # interactive UI mode
```

E2E tests run against the live Vite dev server. On CI, `retries: 1` is set for flakiness resilience. The login endpoint is rate-limited at 50/minute to accommodate bulk test runs (~22 logins across 24 tests).

## CI/CD Pipeline

All jobs run on GitHub Actions. The pipeline is defined in [.github/workflows/ci.yml](.github/workflows/ci.yml).

```
push to main / PR to main
        │
        ├── test (matrix: users, orders, payments) ──────────┐
        │   pytest against real PostgreSQL + Redis            │
        │                                                     │
        └── test-frontend ────────────────────────────────────┤
            Vitest unit tests                                 │
                                                              ▼
                                                    test-e2e (push only)
                                                    Full stack + Playwright
                                                              │
                                              ┌───────────────┘
                                              ▼
                                     build-push (main only)
                                     Docker build → ghcr.io
                                     (users, orders, payments, frontend)
                                              │
                                              ▼
                                     scan (main only)
                                     Trivy CRITICAL CVE scan
                                     --ignore-unfixed
                                              │
                                              ▼
                                     update-manifests (main only)
                                     kustomize edit set image
                                     → git commit [skip ci]
                                     → ArgoCD detects change → syncs cluster
```

Images are published to `ghcr.io/jaosullivan/webapp/<service>:<sha>` and `:latest`. The `update-manifests` job commits the new SHA tags to `fullstack/infra/k8s/overlays/production/kustomization.yaml`, triggering an ArgoCD auto-sync.

### ArgoCD AppProject whitelist

The `fullstack` AppProject ([fullstack/infra/argocd/project.yaml](fullstack/infra/argocd/project.yaml)) controls which Kubernetes resource kinds ArgoCD is permitted to sync. A resource kind absent from `namespaceResourceWhitelist` causes the **entire** sync to fail — not just that resource. Currently permitted: `Deployment`, `Service`, `ConfigMap`, `PersistentVolumeClaim`, `Ingress`, `NetworkPolicy`, `PodDisruptionBudget`, `HorizontalPodAutoscaler`, `CronJob`.

When adding a new resource kind to the manifests, update `project.yaml` and apply it to the cluster first:

```powershell
$env:KUBECONFIG = "C:\Users\johna\.kube\k3s-config.yaml"
& "C:\Program Files\Docker\Docker\resources\bin\kubectl.exe" apply -f fullstack/infra/argocd/project.yaml
```

### ArgoCD PVC health check

The k3s `local-path` StorageClass uses `WaitForFirstConsumer` volume binding — PVCs stay `Pending` until a pod actually mounts them. ArgoCD treats `Pending` PVCs as `Progressing`, causing the app to show a permanent Progressing health status even when all pods are running.

`argocd-cm` has a custom Lua health check that maps PVC `Pending` → `Healthy`. This is configured by `bootstrap-argocd.yml` and survives reinstalls.

To force an unbound PVC to bind immediately (e.g. after a fresh cluster), trigger the backup CronJob once:

```powershell
$env:KUBECONFIG = "C:\Users\johna\.kube\k3s-config.yaml"
& "C:\Program Files\Docker\Docker\resources\bin\kubectl.exe" create job -n fullstack --from=cronjob/postgres-backup postgres-backup-init
```

### After a cluster restart

The `shared-secrets` Secret (JWT signing key) is not persisted to disk and is lost on every cluster restart. Without it all backend pods crash with `CreateContainerConfigError`. `start-dev.ps1` detects and auto-recreates it. To recreate manually:

```powershell
$k = "C:\Program Files\Docker\Docker\resources\bin\kubectl.exe"
$sk = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
& $k create secret generic shared-secrets -n fullstack --from-literal="secret-key=$sk" --dry-run=client -o yaml | & $k apply -f -
```

Note: creating a new key invalidates all existing JWT sessions — users will need to log in again.

## Project Structure

```
c:\MSDE\Webapp\
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Main CI/CD pipeline
│       └── bootstrap-argocd.yml  # One-time ArgoCD setup
├── fullstack/
│   ├── start-dev.ps1             # Local dev launcher
│   ├── shutdown-dev.ps1          # Stops all dev components (reverse of start-dev.ps1)
│   ├── seed.py                   # Demo data seeder
│   ├── CLAUDE.md                 # AI assistant context (conventions, Do Not list)
│   ├── frontend/                 # React 18 + Vite (Nexus dashboard)
│   │   ├── src/
│   │   │   ├── pages/            # Dashboard, Users, Orders, Payments, Login
│   │   │   ├── components/       # Layout, Sidebar, ui/ primitives
│   │   │   └── lib/api.ts        # Axios client + JWT interceptor
│   │   ├── e2e/                  # Playwright specs
│   │   └── src/test/             # Vitest unit tests
│   ├── services/
│   │   ├── shared/               # Shared auth + Redis helpers
│   │   ├── users/                # Auth, JWT, user CRUD (:8001)
│   │   ├── orders/               # Order management (:8002)
│   │   └── payments/             # Payment processing (:8003)
│   └── infra/
│       └── k8s/
│           ├── base/             # Kustomize base manifests
│           └── overlays/
│               └── production/   # Image tags updated by CI
└── README.md
```

## Key Conventions

See [fullstack/CLAUDE.md](fullstack/CLAUDE.md) for the full conventions reference. Highlights:

- **Do not** use `add_logger_name` with `structlog.PrintLoggerFactory()` — incompatible
- **Do not** reuse SQLAlchemy `AsyncEngine` across pytest functions — use `NullPool` in health checks
- **Do not** use `page.waitForURL("/")` in Playwright — use content-based heading waits instead
- **Do not** hardcode secrets or commit `.env` files / K8s Secret manifests with real values
- **Do not** push images that fail the Trivy CRITICAL scan — `scan` gates `update-manifests`
- **Do not** add new Kubernetes resource kinds to manifests without updating the ArgoCD AppProject whitelist in [fullstack/infra/argocd/project.yaml](fullstack/infra/argocd/project.yaml) — a single unlisted kind blocks the entire sync
- **Do not** add a workload that connects to postgres without a NetworkPolicy allow rule — `default-deny-ingress` blocks all ingress; the symptom is `Connection refused` in the Alembic init container
- **Do not** assume `shared-secrets` persists across cluster restarts — recreate it with `start-dev.ps1` or the manual command above
