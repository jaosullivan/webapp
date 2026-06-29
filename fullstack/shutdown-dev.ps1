# shutdown-dev.ps1 — mirrors start-dev.ps1 in reverse.
#
# Stops all dev environment components:
#   port-forwards (kubectl) → frontend (Vite/node) → backend services (uvicorn)
#   → closes associated terminal windows → Podman containers
#
# Pass -StopCluster to also stop k3s inside WSL2 Ubuntu.
# Omit it (default) when you just want a restart — start-dev.ps1 handles a
# running cluster fine and is faster to bring back up.

param(
    [switch]$StopCluster
)

# ── Helper: stop whichever process is listening on a given port ───────────────
function Stop-DevPort {
    param([int]$Port, [string]$Label)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  Stopping $Label on :$Port  ($($proc.Name) PID $($proc.Id))..."
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            return
        }
    }
    Write-Host "  :$Port not active — $Label already stopped."
}

Write-Host "Shutting down dev environment..."
Write-Host ""

# ── [1/4] Port-forwards ───────────────────────────────────────────────────────
Write-Host "[1/4] Stopping port-forwards..."
Stop-DevPort 8080 "ArgoCD port-forward"
Stop-DevPort 3001 "Grafana port-forward"
Stop-DevPort 9090 "Prometheus port-forward"

# ── [2/4] Frontend ────────────────────────────────────────────────────────────
Write-Host "[2/4] Stopping frontend dev server..."
Stop-DevPort 3000 "frontend (Vite)"

# ── [3/4] Backend services ────────────────────────────────────────────────────
Write-Host "[3/4] Stopping backend services..."
Stop-DevPort 8001 "users service"
Stop-DevPort 8002 "orders service"
Stop-DevPort 8003 "payments service"

# Close the -NoExit terminal windows left behind by start-dev.ps1.
# Match on command-line fragments unique to each window type.
$windowPatterns = @('uvicorn app\.main', 'npm run dev', 'port-forward svc/')
$closedWindows = 0
Get-CimInstance Win32_Process -Filter "Name='pwsh.exe'" |
    Where-Object { $cl = $_.CommandLine; $windowPatterns | Where-Object { $cl -match $_ } } |
    ForEach-Object {
        Write-Host "  Closing terminal window (PID $($_.ProcessId))..."
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        $closedWindows++
    }
if ($closedWindows -eq 0) {
    Write-Host "  No dev terminal windows found."
}

# ── [4/4] Podman containers ───────────────────────────────────────────────────
Write-Host "[4/4] Stopping Podman containers..."
$podmanOut = podman stop fullstack-postgres fullstack-redis 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  fullstack-postgres stopped."
    Write-Host "  fullstack-redis stopped."
} else {
    Write-Host "  Warning: $podmanOut"
}

# ── Optional: k3s ─────────────────────────────────────────────────────────────
if ($StopCluster) {
    Write-Host "Stopping k3s cluster (WSL2 Ubuntu)..."
    wsl -d Ubuntu -u root -- pkill -x k3s 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  k3s stopped."
    } else {
        Write-Host "  k3s was not running (or pkill found nothing)."
    }
}

Write-Host ""
Write-Host "Dev environment stopped."
if (-not $StopCluster) {
    Write-Host "  k3s is still running in WSL2 — pass -StopCluster to stop it."
}
Write-Host "  Run .\start-dev.ps1 to restart."
