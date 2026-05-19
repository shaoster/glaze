# Operational Migration Guide: Docker Compose to k3s

This guide details the steps to migrate the Glaze application from its current Docker Compose setup to a k3s Kubernetes cluster.

## Phase 1: k3s Cluster Setup

1. **Install k3s on the droplet**:
   ```bash
   curl -sfL https://get.k3s.io | sh -
   ```
2. **Configure kubectl**:
   ```bash
   mkdir -p ~/.kube
   sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
   sudo chown $USER:$USER ~/.kube/config
   ```
3. **Install Helm**:
   ```bash
   curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
   ```
4. **Install Cert-Manager**:
   ```bash
   helm repo add jetstack https://charts.jetstack.io
   helm repo update
   helm install cert-manager jetstack/cert-manager --namespace cert-manager --create-namespace --set installCRDs=true
   ```

## Phase 2: Postgres Protection & Data Verification

Before migrating, we must ensure a verified backup of the production database exists.

1. **Perform `pg_dump` on the live Compose stack**:
   ```bash
   docker compose exec db pg_dump -U glaze glaze > glaze_prod_backup.sql
   ```
2. **Verify Backup**:
   - Transfer the backup to a safe off-droplet location.
   - Perform a checksum verification.
   - (Optional but recommended) Restore the backup to a local test instance to ensure data integrity.

## Phase 3: Prepare k3s Environment

1. **Create the `glaze-secrets`**:
   Extract variables from your `.env.production` and create the Kubernetes secret:
   ```bash
   kubectl create secret generic glaze-secrets \
     --from-literal=POSTGRES_PASSWORD=your_password \
     --from-literal=SECRET_KEY=your_secret_key \
     --from-literal=GRAFANA_CLOUD_OTLP_TOKEN=your_token
   ```
2. **Apply ClusterIssuer for TLS**:
   Create `letsencrypt-prod.yaml`:
   ```yaml
   apiVersion: cert-manager.io/v1
   kind: ClusterIssuer
   metadata:
     name: letsencrypt-prod
   spec:
     acme:
       server: https://acme-v02.api.letsencrypt.org/directory
       email: your-email@example.com
       privateKeySecretRef:
         name: letsencrypt-prod
       solvers:
       - http01:
           ingress:
             class: traefik
   ```
   Apply it: `kubectl apply -f letsencrypt-prod.yaml`

## Phase 4: Storage Cutover & Helm Deployment

1. **Stop the Compose stack**:
   ```bash
   docker compose stop
   ```
2. **Deploy the Helm chart (Wait for Postgres to be ready)**:
   ```bash
   helm upgrade --install glaze ./chart/glaze \
     --set image.tag=$(git rev-parse HEAD) \
     --set ingress.hosts[0].host=glaze.yourdomain.com \
     --set ingress.tls[0].hosts[0]=glaze.yourdomain.com
   ```
3. **Restore Postgres Data**:
   Find the Postgres pod name:
   ```bash
   POD_NAME=$(kubectl get pods -l app.kubernetes.io/name=glaze-postgres -o jsonpath="{.items[0].metadata.name}")
   ```
   Copy and restore the backup:
   ```bash
   kubectl cp glaze_prod_backup.sql $POD_NAME:/tmp/backup.sql
   kubectl exec $POD_NAME -- psql -U glaze -d glaze -f /tmp/backup.sql
   ```

## Phase 5: Traffic Cutover & Verification

1. **Verify Services**:
   Check if all pods are running and healthy.
   ```bash
   kubectl get pods
   ```
2. **Update DNS**:
   If you are moving to a new IP, update your A records. If staying on the same droplet, k3s Traefik will take over ports 80/443 (ensure host Nginx is stopped).
3. **Rollback Path**:
   If issues occur:
   1. `helm uninstall glaze`
   2. Start the Compose stack: `docker compose up -d`
   3. Verify data consistency.

## Phase 6: Post-Migration

1. **Cleanup**: Once verified, remove the old Docker Compose files and volumes.
2. **Monitoring**: Check Grafana/OTEL dashboards to ensure metrics are flowing from the new cluster.
