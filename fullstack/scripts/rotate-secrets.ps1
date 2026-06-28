# rotate-secrets.ps1
# Generates strong random secrets, applies them to the cluster, and produces
# SealedSecret manifests that can be committed to Git.
#
# Prerequisites:
#   - kubectl configured (KUBECONFIG set)
#   - kubeseal installed (https://github.com/bitnami-labs/sealed-secrets/releases)
#   - Sealed Secrets controller running in kube-system
#   - Run from the repo root
#
# Usage:
#   $env:KUBECONFIG = "C:\Users\johna\.kube\k3s-config.yaml"
#   .\scripts\rotate-secrets.ps1

param(
    [string]$Namespace = "fullstack",
    [string]$KubectlPath = "C:\Program Files\Docker\Docker\resources\bin\kubectl.exe",
    [string]$KubesealPath = "kubeseal"   # must be on PATH or provide full path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function New-RandomSecret([int]$Length = 48) {
    $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes($Length)
    return [System.Convert]::ToBase64String($bytes).Replace("+","").Replace("/","").Replace("=","").Substring(0, $Length)
}

function Invoke-Kubectl { & $KubectlPath @args }
function Invoke-Kubeseal { & $KubesealPath @args }

$sealedSecretsDir = Join-Path $PSScriptRoot "..\infra\k8s\sealed-secrets"
New-Item -ItemType Directory -Force $sealedSecretsDir | Out-Null

Write-Host "Generating secrets for namespace: $Namespace"

# ── Shared secret (JWT signing key) ──────────────────────────────────────────
$secretKey = New-RandomSecret 48
Write-Host "  shared-secrets: secret-key = $($secretKey.Substring(0,8))..."

$sharedJson = Invoke-Kubectl create secret generic shared-secrets `
    -n $Namespace `
    --from-literal=secret-key=$secretKey `
    --dry-run=client -o json

$sharedJson | Invoke-Kubeseal `
    --controller-name=sealed-secrets-controller `
    --controller-namespace=kube-system `
    --format yaml `
    | Out-File -Encoding utf8 (Join-Path $sealedSecretsDir "shared-secrets.yaml")

# Apply live
$sharedJson | Invoke-Kubectl apply -f -
Write-Host "  Applied shared-secrets to cluster."

# ── Per-service DB secrets ────────────────────────────────────────────────────
$pgPassword = New-RandomSecret 32
Write-Host "  postgres password = $($pgPassword.Substring(0,8))..."

foreach ($svc in @("users", "orders", "payments")) {
    $dbUrl = "postgresql+asyncpg://postgres:${pgPassword}@postgres.${Namespace}.svc.cluster.local:5432/${svc}"
    $svcJson = Invoke-Kubectl create secret generic "${svc}-secrets" `
        -n $Namespace `
        --from-literal=database-url=$dbUrl `
        --dry-run=client -o json

    $svcJson | Invoke-Kubeseal `
        --controller-name=sealed-secrets-controller `
        --controller-namespace=kube-system `
        --format yaml `
        | Out-File -Encoding utf8 (Join-Path $sealedSecretsDir "${svc}-secrets.yaml")

    $svcJson | Invoke-Kubectl apply -f -
    Write-Host "  Applied ${svc}-secrets to cluster."
}

# ── Postgres secret ───────────────────────────────────────────────────────────
$pgJson = Invoke-Kubectl create secret generic postgres-secrets `
    -n $Namespace `
    --from-literal=password=$pgPassword `
    --dry-run=client -o json

$pgJson | Invoke-Kubeseal `
    --controller-name=sealed-secrets-controller `
    --controller-namespace=kube-system `
    --format yaml `
    | Out-File -Encoding utf8 (Join-Path $sealedSecretsDir "postgres-secrets.yaml")

$pgJson | Invoke-Kubectl apply -f -
Write-Host "  Applied postgres-secrets to cluster."

Write-Host ""
Write-Host "Done. SealedSecret manifests written to: $sealedSecretsDir"
Write-Host "Commit those files to Git — they are safe to store (encrypted with the controller's key)."
Write-Host ""
Write-Host "IMPORTANT: if you destroy and recreate the cluster you must restore the"
Write-Host "controller's private key before applying sealed secrets, or re-seal everything."
Write-Host "Back up the key with:"
Write-Host "  kubectl get secret -n kube-system -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml > sealed-secrets-key-backup.yaml"
