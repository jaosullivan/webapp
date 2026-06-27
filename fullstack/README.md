# Fullstack

Cloud-native web application with FastAPI microservices, React frontend, and Kubernetes deployment.

## Services

| Service  | Local Port | Description                    |
|----------|-----------|--------------------------------|
| users    | 8001      | Authentication and user management |
| orders   | 8002      | Order lifecycle management     |
| payments | 8003      | Payment processing             |
| frontend | 3000      | React + Vite SPA               |

## Stack

- **Backend**: FastAPI, SQLAlchemy (async), PostgreSQL, Redis
- **Frontend**: React 18, TypeScript, Vite
- **Container**: Podman / Containerfile
- **Orchestration**: Kubernetes, Helm
- **CI/CD**: GitHub Actions

## Quick Start

```sh
# Start a service locally
cd services/users
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8001

# Start frontend
cd frontend
npm install && npm run dev
```

## Kubernetes

```sh
kubectl apply -f infra/k8s/base/
kubectl apply -f infra/database/
kubectl apply -f infra/k8s/services/
```

Add `fullstack.local` to `/etc/hosts` pointing to the ingress IP.

## Building images (Podman)

```sh
podman build -t fullstack/users:latest -f services/users/Containerfile services/users/
podman build -t fullstack/orders:latest -f services/orders/Containerfile services/orders/
podman build -t fullstack/payments:latest -f services/payments/Containerfile services/payments/
podman build -t fullstack/frontend:latest -f frontend/Containerfile frontend/
```
