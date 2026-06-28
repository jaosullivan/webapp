# Secret Rotation Runbook

All secrets live in Kubernetes Secrets in the `fullstack` namespace, never in Git.
Apply updates imperatively with `kubectl` or your Sealed Secrets workflow.

---

## JWT SECRET_KEY

**Impact**: rotating invalidates all active access tokens and refresh tokens immediately.
Plan for a brief re-login prompt across all sessions.

**Rotation procedure**:

```bash
# 1. Generate a new 32-byte hex key
NEW_SECRET=$(openssl rand -hex 32)

# 2. Update the Kubernetes Secret
kubectl create secret generic shared-secrets \
  --namespace fullstack \
  --from-literal=secret-key="$NEW_SECRET" \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Roll all backend pods to pick up the new secret
kubectl rollout restart deployment/users deployment/orders deployment/payments \
  -n fullstack

# 4. Monitor rollout
kubectl rollout status deployment/users deployment/orders deployment/payments \
  -n fullstack

# 5. Verify — existing tokens will return 401; users re-login normally
```

**Recovery**: if something breaks, re-apply the previous value in step 2 and re-roll.

---

## PostgreSQL passwords

Each service has its own `*-secrets` Secret with a `database-url` key.

```bash
# 1. Generate a new password
NEW_PW=$(openssl rand -hex 24)

# 2. Update Postgres role
kubectl exec -n fullstack deploy/postgres -- \
  psql -U postgres -c "ALTER USER postgres PASSWORD '$NEW_PW';"

# 3. Re-create the database-url secrets for each service
for SVC in users orders payments; do
  kubectl create secret generic ${SVC}-secrets \
    --namespace fullstack \
    --from-literal=database-url="postgresql+asyncpg://postgres:${NEW_PW}@postgres.fullstack.svc.cluster.local:5432/${SVC}" \
    --dry-run=client -o yaml | kubectl apply -f -
done

# 4. Roll all backend deployments
kubectl rollout restart deployment/users deployment/orders deployment/payments \
  -n fullstack

kubectl rollout status deployment/users deployment/orders deployment/payments \
  -n fullstack
```

**Note**: the `postgres-backup` CronJob reads the `postgres-secrets` Secret for `PGPASSWORD`.
Update it too:

```bash
kubectl create secret generic postgres-secrets \
  --namespace fullstack \
  --from-literal=password="$NEW_PW" \
  --dry-run=client -o yaml | kubectl apply -f -
```

---

## Grafana admin password

```bash
# 1. Generate a new password
NEW_GF_PW=$(openssl rand -base64 18)

# 2. Update the Grafana admin Secret
kubectl create secret generic grafana-admin \
  --namespace fullstack \
  --from-literal=admin-user=admin \
  --from-literal=admin-password="$NEW_GF_PW" \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Restart Grafana to pick up the new secret
kubectl rollout restart deployment/grafana -n fullstack
kubectl rollout status deployment/grafana -n fullstack

echo "New Grafana password: $NEW_GF_PW"
```

---

## Alertmanager Slack webhook

```bash
# 1. Get a new webhook URL from the Slack App admin page

# 2. Update the Secret
kubectl create secret generic alertmanager-slack-secret \
  --namespace fullstack \
  --from-literal=SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/NEW/URL" \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Restart Alertmanager
kubectl rollout restart deployment/alertmanager -n fullstack
```

---

## Sealed Secrets re-sealing (if using Sealed Secrets controller)

If secrets are managed with Bitnami Sealed Secrets, re-seal after rotation:

```bash
# For each secret:
kubectl get secret <name> -n fullstack -o yaml \
  | kubeseal --controller-name sealed-secrets \
             --controller-namespace kube-system \
             --format yaml \
  > infra/k8s/secrets/<name>-sealed.yaml

# Commit the new SealedSecret to Git — the controller decrypts it in-cluster
git add infra/k8s/secrets/
git commit -m "chore: re-seal rotated secrets"
git push
```

---

## Rotation schedule

| Secret | Recommended rotation | Last rotated |
|--------|---------------------|--------------|
| JWT SECRET_KEY | Every 90 days | — |
| PostgreSQL password | Every 90 days | — |
| Grafana admin password | Every 180 days | — |
| Slack webhook URL | On team offboarding | — |

Update the "Last rotated" column in this table after each rotation.
