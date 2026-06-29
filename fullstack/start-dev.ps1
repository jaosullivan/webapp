$py     = "C:\Users\johna\AppData\Local\Programs\Python\Python314\python.exe"
$kubectl = "C:\Program Files\Docker\Docker\resources\bin\kubectl.exe"
$root   = "C:\MSDE\Webapp\fullstack"
$kubeconfig = "C:\Users\johna\.kube\k3s-config.yaml"

$env:PATH = "C:\Program Files\nodejs;" + $env:PATH

# ── Local dev: Podman containers ─────────────────────────────────────────────
Write-Host "[1/4] Starting Podman containers (postgres + redis)..."
podman start fullstack-postgres fullstack-redis
Start-Sleep -Seconds 3

# ── Local dev: Backend services ───────────────────────────────────────────────
# PYTHONPATH = services/ so that `import shared` resolves for all three services.
# INITIAL_ADMIN_EMAIL promotes admin@example.com to admin on first registration —
# seed.py relies on this to authenticate before creating orders and payments.
Write-Host "[2/4] Starting backend services on :8001 :8002 :8003..."
Start-Process "pwsh.exe" -ArgumentList "-NoExit", "-Command", @"
  `$env:PYTHONPATH='$root\services'
  `$env:INITIAL_ADMIN_EMAIL='admin@example.com'
  Set-Location '$root\services\users'
  & '$py' -m uvicorn app.main:app --reload --port 8001
"@
Start-Process "pwsh.exe" -ArgumentList "-NoExit", "-Command", @"
  `$env:PYTHONPATH='$root\services'
  Set-Location '$root\services\orders'
  & '$py' -m uvicorn app.main:app --reload --port 8002
"@
Start-Process "pwsh.exe" -ArgumentList "-NoExit", "-Command", @"
  `$env:PYTHONPATH='$root\services'
  Set-Location '$root\services\payments'
  & '$py' -m uvicorn app.main:app --reload --port 8003
"@

# ── Local dev: Frontend ───────────────────────────────────────────────────────
Write-Host "[3/4] Starting frontend dev server on :3000..."
Start-Process "pwsh.exe" -ArgumentList "-NoExit", "-Command", "`$env:PATH = 'C:\Program Files\nodejs;' + `$env:PATH; Set-Location '$root\frontend'; npm run dev"

# ── k3s cluster: ensure running + refresh kubeconfig ─────────────────────────
Write-Host "[4/4] Checking k3s cluster (WSL2 Ubuntu)..."

# Start k3s inside Ubuntu WSL2 if not already running
$k3sRunning = wsl -d Ubuntu -u root -- bash -c "pgrep -x k3s > /dev/null 2>&1 && echo yes || echo no" 2>$null
if ($k3sRunning -ne "yes") {
    Write-Host "  k3s not running — starting it..."
    wsl -d Ubuntu -u root -- bash -c "nohup k3s server --disable=traefik > /tmp/k3s.log 2>&1 &" 2>$null
    Start-Sleep -Seconds 8
} else {
    Write-Host "  k3s already running."
}

# Refresh kubeconfig with current WSL2 IP (changes on each WSL restart)
$wslIp = (wsl -d Ubuntu -u root -- hostname -I) -split '\s+' | Select-Object -First 1
if ($wslIp) {
    New-Item -ItemType Directory -Force (Split-Path $kubeconfig) | Out-Null
    $rawCfg = wsl -d Ubuntu -u root -- bash -c "cat /etc/rancher/k3s/k3s.yaml 2>/dev/null" 2>$null | Where-Object { $_ -notmatch 'bogus|screen size' }
    if ($rawCfg) {
        ($rawCfg -join "`n") -replace '127\.0\.0\.1', $wslIp | Set-Content $kubeconfig -Encoding utf8
        Write-Host "  Kubeconfig updated: $kubeconfig (server $wslIp)"
    } else {
        Write-Host "  Warning: could not read k3s kubeconfig from WSL2."
    }
}

# Port-forward cluster services → localhost
$env:KUBECONFIG = $kubeconfig
$clusterOk = & $kubectl cluster-info 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Starting ArgoCD port-forward on https://localhost:8080 ..."
    Start-Process "pwsh.exe" -ArgumentList "-NoExit", "-Command", "`$env:KUBECONFIG='$kubeconfig'; & '$kubectl' port-forward svc/argocd-server -n argocd 8080:443"

    Write-Host "  Starting Grafana port-forward on http://localhost:3001 ..."
    Start-Process "pwsh.exe" -ArgumentList "-NoExit", "-Command", "`$env:KUBECONFIG='$kubeconfig'; & '$kubectl' port-forward svc/grafana -n fullstack 3001:3000"

    Write-Host "  Starting Prometheus port-forward on http://localhost:9090 ..."
    Start-Process "pwsh.exe" -ArgumentList "-NoExit", "-Command", "`$env:KUBECONFIG='$kubeconfig'; & '$kubectl' port-forward svc/prometheus -n fullstack 9090:9090"

    # Print ArgoCD admin password
    $b64 = & $kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' 2>$null
    if ($b64) {
        $pw = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64))
        Write-Host "  ArgoCD  user: admin  password: $pw"
    }
} else {
    Write-Host "  Warning: cluster not reachable — skipping port-forwards."
}

Write-Host ""
Write-Host "Dev environment ready:"
Write-Host "  Frontend    → http://localhost:3000   (login: admin@example.com / admin123)"
Write-Host "  Users API   → http://localhost:8001/docs"
Write-Host "  Orders API  → http://localhost:8002/docs"
Write-Host "  Payments    → http://localhost:8003/docs"
Write-Host "  ArgoCD UI   → https://localhost:8080  (accept self-signed cert; user: admin)"
Write-Host "  Grafana     → http://localhost:3001   (user: admin — see grafana-admin Secret)"
Write-Host "  Prometheus  → http://localhost:9090"
Write-Host ""
Write-Host "Seed demo data (run after services are ready):"
Write-Host "  cd '$root'; & '$py' seed.py"
Write-Host ""
Write-Host "Run backend tests:"
Write-Host "  cd '$root\services\users'    && python -m pytest tests/ -v"
Write-Host "  cd '$root\services\orders'   && python -m pytest tests/ -v"
Write-Host "  cd '$root\services\payments' && python -m pytest tests/ -v"
Write-Host ""
Write-Host "Run E2E tests (requires services running + seed data loaded):"
Write-Host "  cd '$root\frontend' && npx playwright test          # headless"
Write-Host "  cd '$root\frontend' && npx playwright test --ui     # interactive"
