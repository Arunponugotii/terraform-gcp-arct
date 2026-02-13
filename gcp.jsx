import { useState } from "react";

const LAYERS = [
  {
    id: "containers",
    label: "LAYER 0 — CONTAINER IMAGE PATTERNS",
    color: "#0ea5e9",
    bgColor: "#f0f9ff",
    borderColor: "#7dd3fc",
    week: 1,
    components: [
      {
        id: "go-dockerfile",
        name: "Go — Multi-stage + Distroless",
        icon: "🐹",
        desc: "Payment Service & Auth Service. Two-stage build: compile in golang:1.22, copy binary to gcr.io/distroless/static-debian12. Final image ~8MB.",
        why: "Distroless has ZERO shell, ZERO package manager, ZERO OS utilities. If an attacker gets into your container, there's no bash to run, no curl to exfiltrate data. For FinTech payment handling, this is non-negotiable. Plus 8MB vs 900MB = faster pulls, smaller attack surface.",
        build: "FROM golang:1.22 AS builder → COPY → go build -ldflags='-s -w' → FROM gcr.io/distroless/static-debian12 → COPY --from=builder /app /app → USER nonroot:nonroot",
      },
      {
        id: "python-dockerfile",
        name: "Python — UV + Slim Base",
        icon: "🐍",
        desc: "Notification Service & Analytics Worker. Uses UV package manager for 10-50x faster installs. Multi-stage: install deps in builder, copy venv to python:3.12-slim.",
        why: "Python images are notoriously large (1.2GB with pip). UV + slim base → ~150MB. The real trick: COPY requirements first, then code. Docker layer caching means you only reinstall deps when requirements.txt changes, not on every code change. This saves 5-10 minutes per CI build.",
        build: "FROM python:3.12-slim AS builder → COPY --from=ghcr.io/astral-sh/uv → uv pip install → FROM python:3.12-slim → COPY --from=builder /venv → USER 1001",
      },
      {
        id: "node-dockerfile",
        name: "Node.js — Distroless + Tini",
        icon: "🟢",
        desc: "API Gateway BFF & WebSocket Service. Uses node:20-slim builder → distroless/nodejs20. Tini as PID 1 for proper signal handling.",
        why: "Node.js as PID 1 doesn't handle SIGTERM properly — your pod takes 30s to terminate instead of gracefully shutting down. Tini fixes this. Distroless Node means no npm in production (npm = supply chain attack vector). Also: .dockerignore node_modules, because node_modules in images is how you get 2GB containers.",
        build: "FROM node:20-slim AS builder → npm ci --production → FROM gcr.io/distroless/nodejs20-debian12 → COPY --from=builder → ENTRYPOINT [\"/nodejs/bin/node\"]",
      },
      {
        id: "scanning",
        name: "Image Security Pipeline",
        icon: "🔬",
        desc: "Trivy scan → no CRITICAL/HIGH CVEs → cosign sign → push to Artifact Registry → Binary Auth attestation",
        why: "You build a perfect distroless image, but your Go module pulls in a library with a known CVE. Trivy catches this BEFORE it reaches your cluster. Cosign signs the image so Binary Auth (from Project 1) can verify only YOUR pipeline produced it. This is supply chain security end-to-end.",
        build: "Cloud Build step: trivy image --severity CRITICAL,HIGH --exit-code 1 → cosign sign --key kms://... → docker push",
      },
      {
        id: "imageopt",
        name: "Image Optimization Practices",
        icon: "📐",
        desc: "Non-root user, read-only filesystem, no secrets in image, .dockerignore, minimal layers, LABEL metadata",
        why: "USER nonroot = if exploit happens, attacker has no root. Read-only FS = attacker can't write malware. No secrets in image = if image leaks (it happens), no credentials exposed. LABEL with git-sha = you can trace ANY running container back to the exact commit that built it.",
        build: "USER nonroot:nonroot → securityContext.readOnlyRootFilesystem: true → emptyDir for /tmp",
      },
    ],
  },
  {
    id: "poddesign",
    label: "LAYER 1 — POD DESIGN PATTERNS",
    color: "#8b5cf6",
    bgColor: "#f5f3ff",
    borderColor: "#c4b5fd",
    week: 1,
    components: [
      {
        id: "sidecar",
        name: "Sidecar Pattern",
        icon: "🏍️",
        desc: "Istio envoy proxy (auto-injected), log forwarder (Fluent Bit), Vault agent for secrets rotation",
        why: "Sidecar = your app doesn't need to know about mTLS, logging format, or secret rotation. The sidecar handles it. Your Go payment service just does HTTP — the Envoy sidecar encrypts it to mTLS automatically. Separation of concerns at the infrastructure level. This is why service mesh exists.",
        build: "Istio: label namespace with istio-injection=enabled → automatic Envoy sidecar. Fluent Bit: add as container in pod spec sharing log volume.",
      },
      {
        id: "initcontainer",
        name: "Init Container Pattern",
        icon: "🏁",
        desc: "DB migration runner, config fetcher, dependency health checker (wait for postgres, wait for kafka)",
        why: "Your payment service crashes on startup because Cloud SQL isn't ready yet. Init container runs 'pg_isready' in a loop until DB is up, THEN your main container starts. For migrations: init container runs 'alembic upgrade head' so your app always starts with correct schema. Never put migration logic in your app's startup code.",
        build: "initContainers: [{name: wait-for-db, image: busybox, command: ['sh', '-c', 'until pg_isready -h $DB_HOST; do sleep 2; done']}]",
      },
      {
        id: "multicontainer",
        name: "Ambassador / Adapter Pattern",
        icon: "🔀",
        desc: "Ambassador: proxy to external services (Stripe API). Adapter: transform metrics format (StatsD → Prometheus).",
        why: "Ambassador pattern: your payment service calls localhost:8080/stripe → ambassador container handles mTLS to Stripe, retries, circuit breaking. If Stripe changes their API? Update the ambassador, not your app. Adapter pattern: your legacy Java app emits StatsD metrics → adapter converts to Prometheus format. Zero code changes to legacy app.",
        build: "containers: [{name: app, ...}, {name: stripe-ambassador, ports: [{containerPort: 8080}]}] with shared localhost networking",
      },
      {
        id: "probes",
        name: "Health Probes (Deep Dive)",
        icon: "❤️",
        desc: "Liveness: is the process stuck? Readiness: can it serve traffic? Startup: is it still booting? Each has different failure behavior.",
        why: "Liveness fail = K8s RESTARTS your pod (use for deadlocks). Readiness fail = K8s REMOVES from Service endpoints but keeps pod alive (use for DB connection lost — don't restart, wait for reconnect). Startup probe = gives slow apps time to boot without liveness killing them. Most people use liveness for everything — that's wrong and causes cascading restarts under load.",
        build: "livenessProbe: {httpGet: /healthz, initialDelaySeconds: 10, periodSeconds: 15} | readinessProbe: {httpGet: /readyz, periodSeconds: 5} | startupProbe: {httpGet: /healthz, failureThreshold: 30, periodSeconds: 10}",
      },
      {
        id: "resources",
        name: "Resource Management",
        icon: "📊",
        desc: "Requests (guaranteed), Limits (max), QoS classes (Guaranteed/Burstable/BestEffort), LimitRanges, ResourceQuotas",
        why: "Request = what the scheduler uses to PLACE your pod. Limit = what the kernel enforces (OOMKill if exceeded). Set requests = limits for payment service (Guaranteed QoS, never evicted). Burstable for dev workloads. NEVER deploy without requests — your pod becomes BestEffort and gets killed first during node pressure. ResourceQuota per namespace = one team can't starve another.",
        build: "resources: {requests: {cpu: 250m, memory: 256Mi}, limits: {cpu: 500m, memory: 512Mi}} + LimitRange for namespace defaults",
      },
      {
        id: "pdb",
        name: "PodDisruptionBudget",
        icon: "🛡️",
        desc: "Ensures minimum available pods during voluntary disruptions (node upgrades, autoscaler scale-down).",
        why: "GKE auto-upgrades nodes on a schedule. Without PDB, it could drain ALL your payment service pods simultaneously = downtime. PDB says 'always keep at least 2 payment pods running.' The upgrade will wait. This is the most forgotten resource in K8s — and the one that saves you from 3 AM incidents during node upgrades.",
        build: "PodDisruptionBudget: {minAvailable: 2, selector: {matchLabels: {app: payment-service}}}",
      },
    ],
  },
  {
    id: "workloads",
    label: "LAYER 2 — WORKLOAD TYPES",
    color: "#059669",
    bgColor: "#ecfdf5",
    borderColor: "#6ee7b7",
    week: 1,
    components: [
      {
        id: "deployment",
        name: "Deployment (Stateless APIs)",
        icon: "🔄",
        desc: "Payment, Auth, User, Notification services. RollingUpdate strategy with maxSurge/maxUnavailable. HPA for auto-scaling.",
        why: "Deployment = stateless, horizontally scalable, zero-downtime updates. RollingUpdate with maxSurge: 1, maxUnavailable: 0 means 'always have all current pods running, add new ones first, then remove old.' Combined with readiness probes = no request is ever dropped during deploy.",
        build: "Deployment + HPA (cpu/memory/custom metrics) + PDB + Service + Ingress",
      },
      {
        id: "statefulset",
        name: "StatefulSet (Databases, Kafka)",
        icon: "💾",
        desc: "PostgreSQL (CloudNativePG operator), Kafka (Strimzi operator), Redis Sentinel. Stable network IDs, ordered deployment, persistent volumes.",
        why: "StatefulSet gives: stable hostname (kafka-0, kafka-1), ordered start/stop (leader first), and PVC per pod (data survives pod restart). This is WHY you can't use Deployment for databases — Deployments give random names and share volumes. Kafka broker-0 needs to ALWAYS be broker-0 so other brokers can find it.",
        build: "StatefulSet + PVC template + headless Service (clusterIP: None) + StorageClass (pd-ssd)",
      },
      {
        id: "daemonset",
        name: "DaemonSet (Node-level agents)",
        icon: "👁️",
        desc: "Fluent Bit (log collector), Node Problem Detector, Falco (runtime security), Prometheus Node Exporter.",
        why: "DaemonSet = exactly ONE pod per node. Fluent Bit on every node collects container logs and ships to Cloud Logging. Falco on every node watches syscalls for suspicious activity (shell exec in container, sensitive file read). You can't use Deployment because you need EVERY node covered, not just N replicas randomly placed.",
        build: "DaemonSet + tolerations (to run on ALL nodes including tainted system pool) + hostPath volumes for /var/log",
      },
      {
        id: "jobs",
        name: "Job & CronJob",
        icon: "⏰",
        desc: "Job: DB migration, data backfill, report generation. CronJob: daily reconciliation, weekly PCI scan, hourly metric aggregation.",
        why: "CronJob for daily payment reconciliation: compare your transaction DB with Stripe's records, flag discrepancies. This is a compliance requirement for FinTech. Job for one-time migrations: run once, verify success, never run again. backoffLimit + activeDeadlineSeconds prevent infinite retry loops that waste cluster resources.",
        build: "CronJob: {schedule: '0 2 * * *', jobTemplate: {spec: {backoffLimit: 3, activeDeadlineSeconds: 3600, ttlSecondsAfterFinished: 86400}}}",
      },
    ],
  },
  {
    id: "istio",
    label: "LAYER 3 — ISTIO SERVICE MESH (DEEP DIVE)",
    color: "#e11d48",
    bgColor: "#fff1f2",
    borderColor: "#fda4af",
    week: 2,
    components: [
      {
        id: "istio-arch",
        name: "Istio Architecture",
        icon: "🕸️",
        desc: "Control plane (istiod): Pilot (config), Citadel (certs), Galley (validation). Data plane: Envoy sidecar in every pod.",
        why: "istiod manages ALL mesh config, certificate rotation, and service discovery. Envoy sidecars intercept ALL traffic in/out of your pod. Your app talks HTTP to localhost → Envoy encrypts to mTLS → destination Envoy decrypts → delivers to destination app. Zero code changes. This is why Istio is a game-changer for FinTech security.",
        build: "istioctl install --set profile=default → label namespace: istio-injection=enabled → restart pods for sidecar injection",
      },
      {
        id: "istio-mtls",
        name: "mTLS (Mutual TLS)",
        icon: "🔐",
        desc: "STRICT mode: all service-to-service traffic encrypted. PeerAuthentication + DestinationRule for TLS settings per service.",
        why: "Regular TLS: client verifies server identity. mTLS: BOTH sides verify each other. Payment service talks to User service — both present certificates issued by Istio's CA. If an attacker puts a rogue pod in the cluster, it has no valid cert = no communication possible. PCI-DSS requires encryption in transit — Istio mTLS gives you this with ZERO code changes.",
        build: "PeerAuthentication: {mtls: {mode: STRICT}} (mesh-wide) → DestinationRule with tls: {mode: ISTIO_MUTUAL} per service",
      },
      {
        id: "istio-vs",
        name: "VirtualService (Traffic Routing)",
        icon: "🔀",
        desc: "Route by header, weight, URI. A/B testing, canary releases, version routing. Request retries and timeouts.",
        why: "VirtualService controls WHERE traffic goes: send 95% to v1, 5% to v2 (canary). Route /api/v2/* to new version, /api/v1/* to old (API versioning without code changes). Match header x-user-group: beta → route to experimental version. Retries with budget: retry 2 times but only if total requests with retries < 20% above normal (prevents retry storms).",
        build: "VirtualService: {http: [{match: [{headers: {x-canary: {exact: 'true'}}}], route: [{destination: {host: payment-v2}}]}, {route: [{destination: {host: payment-v1, weight: 95}}, {destination: {host: payment-v2, weight: 5}}]}]}",
      },
      {
        id: "istio-dr",
        name: "DestinationRule (Load Balancing & Resilience)",
        icon: "⚖️",
        desc: "Connection pooling, outlier detection (circuit breaking), load balancing algorithms, TLS settings per subset.",
        why: "Outlier detection = automatic circuit breaking. If payment-service-pod-3 returns 5xx errors 5 times in 30 seconds, Istio ejects it from the load balancer for 30 seconds. Your users never see the errors because traffic shifts to healthy pods. Without this, K8s keeps sending traffic to the failing pod until liveness kills it (could take 30-60 seconds of errors).",
        build: "DestinationRule: {trafficPolicy: {connectionPool: {http: {h2UpgradePolicy: UPGRADE, maxRequestsPerConnection: 100}}, outlierDetection: {consecutive5xxErrors: 5, interval: 30s, baseEjectionTime: 30s}}}",
      },
      {
        id: "istio-gw",
        name: "Istio Gateway + Ingress",
        icon: "🚪",
        desc: "Gateway: L4-L6 (port, protocol, TLS). VirtualService: L7 (routing, headers, rewrites). Replaces nginx ingress.",
        why: "Istio Gateway separates concerns: Gateway handles TLS termination and port binding. VirtualService handles routing logic. This means your network team manages Gateway (which ports are open, which certs) and app teams manage VirtualService (how traffic routes). With nginx ingress, everything is in annotations on one resource — messy at scale.",
        build: "Gateway: {servers: [{port: {number: 443, protocol: HTTPS}, tls: {mode: SIMPLE, credentialName: tls-cert}, hosts: ['api.fintech.com']}]}",
      },
      {
        id: "istio-fault",
        name: "Fault Injection & Chaos",
        icon: "💥",
        desc: "Inject delays (test timeout handling), inject aborts (test error handling), test circuit breakers under load.",
        why: "You THINK your payment service handles a 5s Stripe delay gracefully. Prove it. Inject 5s delay on Stripe ambassador → does your service timeout correctly? Does it return a proper error to the user? Does the circuit breaker trip? Fault injection in Istio lets you test failure scenarios WITHOUT breaking external services. This is how Netflix tests — chaos engineering.",
        build: "VirtualService: {http: [{fault: {delay: {percentage: {value: 10}, fixedDelay: 5s}}, fault: {abort: {percentage: {value: 5}, httpStatus: 503}}}]}",
      },
      {
        id: "istio-authz",
        name: "AuthorizationPolicy",
        icon: "🛂",
        desc: "L7 access control: which service can call which endpoint. Payment service can call /charge but not /admin. Deny-all default.",
        why: "Network policies work at L3/L4 (IP + port). Istio AuthorizationPolicy works at L7 (HTTP method + path + headers). You can say: 'Only auth-service can POST to /api/v1/payments. User-service can only GET.' This is defense in depth — even if network policy is misconfigured, AuthorizationPolicy blocks unauthorized calls at the application protocol level.",
        build: "AuthorizationPolicy: {rules: [{from: [{source: {principals: ['cluster.local/ns/auth/sa/auth-sa']}}], to: [{operation: {methods: ['POST'], paths: ['/api/v1/payments']}}]}]}",
      },
    ],
  },
  {
    id: "deployment-strategies",
    label: "LAYER 4 — DEPLOYMENT STRATEGIES",
    color: "#7c3aed",
    bgColor: "#faf5ff",
    borderColor: "#c4b5fd",
    week: 3,
    components: [
      {
        id: "canary",
        name: "Canary (Argo Rollouts + Istio)",
        icon: "🐤",
        desc: "5% → 25% → 50% → 100% with automated metric analysis between steps. Auto-rollback if error rate spikes.",
        why: "You deploy payment-service v2. Argo Rollouts sends 5% traffic, waits 5 minutes, checks Prometheus: is error rate < 1%? Is p99 latency < 500ms? If yes → promote to 25%. If no → auto-rollback to v1. Your users see zero impact. Without this, you deploy 100% and pray. Canary with Istio is the gold standard for FinTech deployments.",
        build: "Rollout: {strategy: {canary: {steps: [{setWeight: 5}, {pause: {duration: 5m}}, {analysis: {templates: [{templateName: success-rate}]}}, {setWeight: 25}, ...], trafficRouting: {istio: {virtualService: {name: payment-vs}}}}}}",
      },
      {
        id: "bluegreen",
        name: "Blue-Green (Zero Downtime Switch)",
        icon: "🔵🟢",
        desc: "Two full environments. Green = new version (fully tested). Switch traffic instantly via Service selector change.",
        why: "For database migrations that break backward compatibility: deploy green (new code + new schema) alongside blue (old code + old schema). Test green thoroughly. Switch ALL traffic at once. If something breaks: switch back instantly (blue is still running). Slower than canary (needs 2x resources) but safer for breaking changes.",
        build: "Rollout: {strategy: {blueGreen: {activeService: payment-active, previewService: payment-preview, autoPromotionEnabled: false, prePromotionAnalysis: {templates: [...]}}}}",
      },
      {
        id: "progressive",
        name: "Progressive Delivery (Flagger)",
        icon: "📈",
        desc: "Flagger automates canary with Istio. Auto-generates VirtualService, DestinationRule, and analysis runs.",
        why: "Argo Rollouts = you manage VirtualService + DestinationRule manually. Flagger = it creates and manages them for you automatically. Trade-off: Flagger is simpler but less flexible. For a startup with 5-10 services, Flagger saves significant operational overhead. For complex routing (header-based canary), Argo Rollouts gives more control.",
        build: "Canary CRD: {targetRef: {kind: Deployment}, service: {port: 8080}, analysis: {interval: 1m, threshold: 5, metrics: [{name: request-success-rate, threshold: 99}]}}",
      },
      {
        id: "gitops-deploy",
        name: "GitOps Deployment Flow",
        icon: "🔄",
        desc: "Dev pushes code → CI builds image → CI updates image tag in GitOps repo → ArgoCD detects change → Argo Rollouts executes canary",
        why: "The developer NEVER runs kubectl. They push code, CI handles the image, and a separate GitOps repo tracks desired cluster state. ArgoCD syncs that repo to the cluster. Argo Rollouts manages the rollout strategy. If anything drifts from git state, ArgoCD alerts and auto-corrects. Full audit trail: every production change is a git commit with author, timestamp, and PR approval.",
        build: "GitOps repo structure: /apps/payment-service/base/ + /apps/payment-service/overlays/prod/ (Kustomize) → ArgoCD Application pointing to overlay",
      },
    ],
  },
  {
    id: "helm",
    label: "LAYER 5 — HELM CHART PACKAGING",
    color: "#ea580c",
    bgColor: "#fff7ed",
    borderColor: "#fdba74",
    week: 3,
    components: [
      {
        id: "helm-structure",
        name: "Chart Structure (From Scratch)",
        icon: "📁",
        desc: "Chart.yaml, values.yaml, templates/ (deployment, service, hpa, pdb, networkpolicy, istio virtualservice), helpers.tpl, tests/",
        why: "Building your OWN chart means you define the standard for your org. Every new microservice uses YOUR template. You bake in: resource limits required, probes required, PDB required, network policy required. Developers can't deploy without these — they're in the template. This is how platform teams enforce standards without being blockers.",
        build: "helm create fintech-microservice → customize templates → helm package → push to OCI registry in Artifact Registry",
      },
      {
        id: "helm-values",
        name: "Values.yaml Design",
        icon: "⚙️",
        desc: "Per-environment overrides: values-dev.yaml, values-staging.yaml, values-prod.yaml. Sensible defaults, overridable everything.",
        why: "Design your values.yaml so 80% of services need ZERO customization. Good defaults: replicas: 2, resources.requests.cpu: 250m, probes enabled, PDB minAvailable: 1. Teams only override what's different (image name, env vars, specific resource needs). Bad values.yaml = every team copies-pastes and drifts. Good values.yaml = consistency across 50 services.",
        build: "values.yaml with nested structure: app.image, app.port, resources.requests, resources.limits, autoscaling.enabled, istio.enabled, monitoring.enabled",
      },
      {
        id: "helm-hooks",
        name: "Helm Hooks & Tests",
        icon: "🪝",
        desc: "pre-install: create DB schema. pre-upgrade: run migration. test: verify deployment health. post-install: seed data.",
        why: "Helm hooks run Jobs at specific lifecycle points. pre-upgrade hook runs DB migration BEFORE new pods deploy. If migration fails → helm upgrade fails → old pods stay running. Without hooks, you deploy new code that expects new schema → crash → rollback code but schema is already migrated → double mess.",
        build: "annotations: {'helm.sh/hook': pre-upgrade, 'helm.sh/hook-weight': '-5', 'helm.sh/hook-delete-policy': hook-succeeded}",
      },
      {
        id: "helm-library",
        name: "Library Chart (Shared Templates)",
        icon: "📚",
        desc: "Base chart with common templates (deployment, service, monitoring). App charts depend on it. Change once → all services update.",
        why: "Without library chart: 15 microservices × copy-pasted deployment.yaml = 15 places to update when you change probe defaults. With library chart: update the library, bump version in each Chart.yaml → done. This is the DRY principle for Kubernetes manifests. Platform teams use this to roll out org-wide policy changes.",
        build: "type: library in Chart.yaml → define named templates → app charts: dependencies: [{name: fintech-common, version: 1.x.x, repository: oci://...}]",
      },
    ],
  },
  {
    id: "security-app",
    label: "LAYER 6 — APPLICATION SECURITY (Inside Cluster)",
    color: "#b91c1c",
    bgColor: "#fef2f2",
    borderColor: "#fca5a5",
    week: 2,
    components: [
      {
        id: "pss",
        name: "Pod Security Standards",
        icon: "🔒",
        desc: "Restricted profile: no root, no privileged, no hostPath, no hostNetwork, read-only rootfs, drop ALL capabilities.",
        why: "Pod Security Standards replaced PodSecurityPolicy. Three levels: Privileged (allow all — never use), Baseline (reasonable), Restricted (hardened). FinTech = Restricted. Why drop ALL capabilities? By default, containers get 14 Linux capabilities including NET_RAW (craft raw packets). Drop all, add back only what's needed (almost nothing for a Go API).",
        build: "Namespace label: pod-security.kubernetes.io/enforce: restricted → SecurityContext: {runAsNonRoot: true, allowPrivilegeEscalation: false, capabilities: {drop: ['ALL']}}",
      },
      {
        id: "netpol-app",
        name: "Network Policies (Application Level)",
        icon: "🚧",
        desc: "Default deny-all per namespace. Explicit allow: payment→DB:5432, payment→redis:6379, auth→payment:8080, nothing else.",
        why: "Layer 1 (Project 1) was cluster-level network policy. This is APPLICATION-level: payment service can ONLY reach DB on 5432 and Redis on 6379. If payment service gets compromised, attacker can't scan the network — every other port and service is blocked. Draw the network policy diagram for every service BEFORE you deploy it.",
        build: "NetworkPolicy: {policyTypes: [Ingress, Egress], ingress: [{from: [{podSelector: {matchLabels: {app: auth}}}], ports: [{port: 8080}]}], egress: [{to: [{podSelector: {matchLabels: {app: postgres}}}], ports: [{port: 5432}]}]}",
      },
      {
        id: "sa-rbac",
        name: "ServiceAccount per Pod",
        icon: "🎭",
        desc: "Each microservice gets its own ServiceAccount + Role + RoleBinding. No default SA. automountServiceAccountToken: false unless needed.",
        why: "Default ServiceAccount has more permissions than you think. Every pod auto-mounts a token that can query the K8s API. Payment service doesn't need K8s API access — set automountServiceAccountToken: false. If it DOES need API access (like a deployment controller), create a dedicated SA with ONLY the verbs and resources needed. This is the principle of least privilege applied to K8s.",
        build: "ServiceAccount per service → Role with specific verbs/resources → RoleBinding → Pod spec: serviceAccountName + automountServiceAccountToken: false",
      },
      {
        id: "falco",
        name: "Falco (Runtime Security)",
        icon: "🦅",
        desc: "Kernel-level syscall monitoring. Alerts on: shell exec in container, sensitive file read, unexpected network connection, privilege escalation.",
        why: "All the security above is PREVENTIVE. Falco is DETECTIVE. If an attacker somehow gets shell access despite distroless + read-only FS + no capabilities, Falco sees the syscall and alerts within seconds. Rule example: 'Alert if any process in payment namespace makes an outbound connection to an IP not in the Stripe allowlist.' This is the last defense layer.",
        build: "Helm: falcosecurity/falco as DaemonSet → custom rules per namespace → alerts to Pub/Sub → PagerDuty",
      },
    ],
  },
  {
    id: "stateful",
    label: "LAYER 7 — STATEFUL WORKLOADS (In-Cluster)",
    color: "#0d9488",
    bgColor: "#f0fdfa",
    borderColor: "#5eead4",
    week: 3,
    components: [
      {
        id: "cnpg",
        name: "CloudNativePG (PostgreSQL in K8s)",
        icon: "🐘",
        desc: "Operator manages: primary + 2 replicas, automated failover, continuous WAL archiving to GCS, point-in-time recovery.",
        why: "Project 1 used Cloud SQL (managed). This project: run PostgreSQL IN K8s to understand StatefulSet, PVCs, operator pattern. CloudNativePG handles failover in seconds (vs minutes for Cloud SQL). You learn: how operators work, how WAL archiving works, how PVCs bind to PDs. In production, you choose based on: team DBA skills? → Cloud SQL. Need <10s failover? → CloudNativePG.",
        build: "Helm: cloudnative-pg → Cluster CRD: {instances: 3, storage: {size: 20Gi, storageClass: premium-rwo}, backup: {barmanObjectStore: {destinationPath: gs://...}}}",
      },
      {
        id: "kafka-strimzi",
        name: "Kafka (Strimzi Operator)",
        icon: "📬",
        desc: "3 broker + 3 ZooKeeper (or KRaft). Topics: payment-events, user-events, notification-events. Schema Registry for Avro.",
        why: "Pub/Sub in Project 1 was managed. Running Kafka in K8s teaches you: StatefulSet nuances (ordered rolling updates), PVC management (each broker has its own disk), headless Services (broker-0.kafka.svc), and the operator pattern. Strimzi handles: rolling upgrades (one broker at a time, ensuring ISR), topic management via CRDs, and mTLS between brokers. Critical learning for any data platform role.",
        build: "Strimzi operator → Kafka CRD: {kafka: {replicas: 3, storage: {type: persistent-claim, size: 50Gi}}, zookeeper: {replicas: 3}} → KafkaTopic CRD → KafkaUser CRD with ACLs",
      },
      {
        id: "redis-sentinel",
        name: "Redis Sentinel (HA Cache)",
        icon: "⚡",
        desc: "1 master + 2 replicas + 3 sentinels. Auto-failover. Used for: session tokens, rate limit counters, idempotency keys.",
        why: "Memorystore (Project 1) is managed. Redis in K8s with Sentinel teaches you: master election, failover detection, and the split-brain problem. Your payment service caches idempotency keys (payment_id → processed) in Redis. If Redis master dies, Sentinel promotes a replica in ~10 seconds. Without Sentinel, your app reconnects to a dead master and every payment retries = double charges.",
        build: "StatefulSet (redis) + Deployment (sentinel) + ConfigMap with sentinel.conf → or Bitnami Helm chart: redis with sentinel.enabled=true",
      },
      {
        id: "storage",
        name: "Storage Classes & PVCs",
        icon: "💿",
        desc: "pd-ssd (databases), pd-balanced (Kafka logs), pd-standard (archives). Topology-aware, volume expansion enabled.",
        why: "StorageClass defines: what DISK TYPE backs your PVC, whether it can EXPAND, and how it RECLAIMS. For PostgreSQL: pd-ssd (low latency). For Kafka: pd-balanced (throughput matters more than latency). Always set allowVolumeExpansion: true — running out of disk on a database is a career-defining incident. reclaimPolicy: Retain = disk survives even if PVC is deleted (safety net).",
        build: "StorageClass: {provisioner: pd.csi.storage.gke.io, parameters: {type: pd-ssd}, allowVolumeExpansion: true, reclaimPolicy: Retain, volumeBindingMode: WaitForFirstConsumer}",
      },
    ],
  },
  {
    id: "observability",
    label: "LAYER 8 — OBSERVABILITY (Mesh-Integrated)",
    color: "#ca8a04",
    bgColor: "#fefce8",
    borderColor: "#fde047",
    week: 4,
    components: [
      {
        id: "kiali",
        name: "Kiali (Service Mesh Dashboard)",
        icon: "🗺️",
        desc: "Real-time service graph, traffic flow visualization, health status, Istio config validation.",
        why: "You have 8 microservices with Istio. Which service calls which? Is mTLS active on ALL connections? Are there misconfigured VirtualServices? Kiali shows a LIVE graph of your mesh with green/red lines showing health. When you demo this in an interview, it's incredibly compelling — you can literally show the traffic flowing through your architecture in real-time.",
        build: "Helm: kiali-server → integrates automatically with Istio, Prometheus, Jaeger, Grafana",
      },
      {
        id: "jaeger",
        name: "Jaeger (Distributed Tracing)",
        icon: "🔍",
        desc: "End-to-end request tracing across all microservices. See exactly where latency comes from.",
        why: "Payment takes 3 seconds. Is it the auth service? The database query? The Stripe API call? Jaeger shows the full trace: auth-service (50ms) → payment-service (100ms) → stripe-ambassador (2800ms) → oh, it's Stripe being slow. Without tracing, you'd check logs in 5 different services trying to correlate by timestamp. With Istio, tracing headers propagate automatically.",
        build: "Helm: jaeger-operator → Jaeger CRD with production storage (Elasticsearch/Cassandra) → Istio meshConfig: enableTracing: true",
      },
      {
        id: "prom-grafana",
        name: "Prometheus + Grafana Stack",
        icon: "📊",
        desc: "Prometheus scrapes Istio metrics + app custom metrics. Grafana dashboards: RED method (Rate, Error, Duration) per service.",
        why: "Istio generates metrics automatically for EVERY request (without instrumenting your code): request count, request duration, request size, response size, response code. Prometheus stores it, Grafana visualizes it. RED dashboards per service = you see exactly which service is degrading. Custom metrics (payment_amount_total, active_users_gauge) give business visibility alongside technical metrics.",
        build: "kube-prometheus-stack Helm chart → ServiceMonitor for each app → Grafana dashboards imported/coded in JSON → PrometheusRule for alerting",
      },
      {
        id: "otel",
        name: "OpenTelemetry Collector",
        icon: "📡",
        desc: "Unified telemetry pipeline: collect traces + metrics + logs from all services, export to multiple backends.",
        why: "Without OTel Collector, each service directly sends to Jaeger AND Prometheus AND Cloud Logging = tight coupling. OTel Collector is the middleman: services send to Collector → Collector routes to backends. Want to switch from Jaeger to Tempo? Change Collector config, zero app changes. This is the CNCF standard for observability — learn it once, use it everywhere.",
        build: "Helm: opentelemetry-collector → DaemonSet mode for logs, Deployment mode for traces → OTLP receiver → multiple exporters",
      },
    ],
  },
];

const FINTECH_SERVICES = [
  { name: "API Gateway BFF", lang: "Node.js", icon: "🟢", type: "Deployment", pattern: "Ambassador", connects: ["Auth", "Payment", "User", "Notification"] },
  { name: "Auth Service", lang: "Go", icon: "🐹", type: "Deployment", pattern: "Sidecar (Vault)", connects: ["Redis", "PostgreSQL"] },
  { name: "Payment Service", lang: "Go", icon: "💳", type: "Deployment", pattern: "Ambassador (Stripe)", connects: ["PostgreSQL", "Redis", "Kafka"] },
  { name: "User Service", lang: "Python", icon: "🐍", type: "Deployment", pattern: "Init (migration)", connects: ["PostgreSQL", "Redis"] },
  { name: "Notification Service", lang: "Python", icon: "🔔", type: "Deployment", pattern: "Sidecar (Fluent Bit)", connects: ["Kafka", "Redis"] },
  { name: "Reconciliation Job", lang: "Go", icon: "🔄", type: "CronJob", pattern: "Init (DB check)", connects: ["PostgreSQL", "Stripe API"] },
  { name: "PostgreSQL", lang: "CloudNativePG", icon: "🐘", type: "StatefulSet", pattern: "Operator", connects: [] },
  { name: "Kafka", lang: "Strimzi", icon: "📬", type: "StatefulSet", pattern: "Operator", connects: [] },
  { name: "Redis Sentinel", lang: "Redis 7", icon: "⚡", type: "StatefulSet", pattern: "Sentinel HA", connects: [] },
];

const WEEK_PLAN = [
  {
    week: 1,
    title: "Containers + Pod Patterns + Workload Types",
    focus: "Write Dockerfiles (Go, Python, Node.js), implement all pod design patterns (sidecar, init, probes, resources, PDB), deploy all workload types (Deployment, StatefulSet, DaemonSet, Job, CronJob)",
    outcome: "You can explain why you chose distroless for Go, why probes differ per workload, and demonstrate init container dependency ordering",
    daily: "Day 1-2: Dockerfiles. Day 3-4: Pod patterns. Day 5-6: Workload types. Day 7: Wire them together.",
  },
  {
    week: 2,
    title: "Istio Deep Dive + Application Security",
    focus: "Install Istio, enable mTLS STRICT, create VirtualServices + DestinationRules for all services, implement circuit breakers, fault injection, AuthorizationPolicies. Add Pod Security Standards, per-service NetworkPolicies, Falco runtime security.",
    outcome: "You can demonstrate: mTLS between services, canary routing via headers, circuit breaker tripping, Falco detecting anomalous behavior",
    daily: "Day 1-2: Istio install + mTLS. Day 3-4: Traffic management + fault injection. Day 5-6: AuthorizationPolicy + security. Day 7: Test everything breaks correctly.",
  },
  {
    week: 3,
    title: "Deployment Strategies + Helm + Stateful Workloads",
    focus: "Set up Argo Rollouts, implement canary + blue-green deploys, build Helm chart from scratch with library chart, deploy CloudNativePG, Strimzi Kafka, Redis Sentinel. Configure StorageClasses and PVC management.",
    outcome: "You can demo: automated canary rollout with metric-based promotion, your Helm chart used across 3+ services, PostgreSQL failover, Kafka topic production/consumption",
    daily: "Day 1-2: Argo Rollouts + canary. Day 3-4: Helm charts. Day 5-6: StatefulSets + operators. Day 7: Integration test the full flow.",
  },
  {
    week: 4,
    title: "Observability + Polish + Documentation",
    focus: "Deploy Kiali, Jaeger, Prometheus+Grafana, OTel Collector. Build RED dashboards per service. Set up SLO-based alerts. Write architecture documentation. Record demo.",
    outcome: "You can walk someone through Kiali showing live traffic, Jaeger showing payment trace across 5 services, and Grafana showing SLO compliance — while explaining every architectural decision",
    daily: "Day 1-2: Observability stack. Day 3-4: Dashboards + alerts. Day 5-6: Documentation + architecture diagrams. Day 7: Record walkthrough demo for portfolio.",
  },
];

const ConnectionArrows = () => (
  <div style={{ textAlign: "center", padding: "2px 0", lineHeight: 1 }}>
    <span style={{ color: "#94a3b8", fontSize: 18, letterSpacing: 2 }}>▼ ▼ ▼</span>
  </div>
);

const ComponentCard = ({ comp, isSelected, onClick }) => (
  <button
    onClick={onClick}
    style={{
      background: isSelected ? "#1e293b" : "#ffffff",
      color: isSelected ? "#f8fafc" : "#1e293b",
      border: `1.5px solid ${isSelected ? "#3b82f6" : "#e2e8f0"}`,
      borderRadius: 8,
      padding: "8px 12px",
      cursor: "pointer",
      textAlign: "left",
      transition: "all 0.15s ease",
      minWidth: 150,
      flex: "1 1 150px",
      maxWidth: 240,
      boxShadow: isSelected ? "0 0 0 2px #3b82f680" : "0 1px 2px rgba(0,0,0,0.04)",
    }}
  >
    <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 15 }}>{comp.icon}</span>
      <span style={{ lineHeight: 1.2 }}>{comp.name}</span>
    </div>
  </button>
);

const DetailPanel = ({ comp }) => {
  if (!comp) return (
    <div style={{
      background: "#f8fafc",
      border: "2px dashed #cbd5e1",
      borderRadius: 12,
      padding: 32,
      textAlign: "center",
      color: "#94a3b8",
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 14,
    }}>
      ← Click any component to see the deep-dive: WHAT → WHY → BUILD
    </div>
  );

  return (
    <div style={{
      background: "#0f172a",
      borderRadius: 12,
      padding: 20,
      color: "#e2e8f0",
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12,
      lineHeight: 1.7,
      border: "1px solid #334155",
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#38bdf8", display: "flex", alignItems: "center", gap: 8 }}>
        <span>{comp.icon}</span> {comp.name}
      </div>
      <div style={{ marginBottom: 12 }}>
        <span style={{ color: "#22d3ee", fontWeight: 600 }}>WHAT: </span>
        <span style={{ color: "#cbd5e1" }}>{comp.desc}</span>
      </div>
      <div style={{ marginBottom: 12 }}>
        <span style={{ color: "#f59e0b", fontWeight: 600 }}>WHY (the real reason): </span>
        <span style={{ color: "#fde68a" }}>{comp.why}</span>
      </div>
      {comp.build && (
        <div style={{
          background: "#1e293b",
          borderRadius: 8,
          padding: 12,
          marginTop: 8,
          border: "1px solid #475569",
          overflowX: "auto",
        }}>
          <span style={{ color: "#4ade80", fontWeight: 600 }}>BUILD: </span>
          <span style={{ color: "#86efac", wordBreak: "break-word" }}>{comp.build}</span>
        </div>
      )}
    </div>
  );
};

export default function Project2Architecture() {
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState("architecture");
  const [expandedWeek, setExpandedWeek] = useState(null);

  const selectedComp = selected
    ? LAYERS.flatMap(l => l.components).find(c => c.id === selected)
    : null;

  return (
    <div style={{
      fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
      background: "#020617",
      minHeight: "100vh",
      color: "#e2e8f0",
      padding: "16px",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{
          display: "inline-block",
          background: "linear-gradient(135deg, #1a0a2e, #1e293b)",
          border: "1px solid #334155",
          borderRadius: 16,
          padding: "16px 32px",
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#f472b6",
            letterSpacing: "2px",
            fontFamily: "monospace",
            marginBottom: 4,
          }}>
            PROJECT 2
          </div>
          <h1 style={{
            fontSize: 20,
            fontWeight: 800,
            margin: 0,
            background: "linear-gradient(135deg, #f472b6, #818cf8, #38bdf8)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.5px",
          }}>
            Application Architecture Inside GKE
          </h1>
          <p style={{ color: "#64748b", fontSize: 11, margin: "6px 0 0", fontFamily: "monospace" }}>
            Pod Patterns · Istio Deep Dive · Deployment Strategies · Stateful Workloads · 9 Layers · Click to learn
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { id: "architecture", label: "🏗️ Architecture" },
          { id: "services", label: "🧩 Service Map" },
          { id: "roadmap", label: "🗓️ 4-Week Plan" },
          { id: "comparison", label: "⚡ P1 vs P2" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: activeTab === tab.id ? "#7c3aed" : "#1e293b",
              color: activeTab === tab.id ? "#fff" : "#94a3b8",
              border: `1px solid ${activeTab === tab.id ? "#7c3aed" : "#334155"}`,
              borderRadius: 8,
              padding: "8px 14px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              transition: "all 0.2s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Architecture Tab */}
      {activeTab === "architecture" && (
        <div style={{ display: "flex", gap: 16, maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ flex: "1 1 58%", minWidth: 0 }}>
            {LAYERS.map((layer, i) => (
              <div key={layer.id}>
                {i > 0 && <ConnectionArrows />}
                <div style={{
                  background: layer.bgColor,
                  border: `2px solid ${layer.borderColor}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  marginBottom: 2,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{
                      background: layer.color,
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 4,
                      letterSpacing: "0.5px",
                      fontFamily: "monospace",
                      whiteSpace: "nowrap",
                    }}>
                      {layer.label}
                    </span>
                    {layer.week && (
                      <span style={{
                        background: "#1e293b",
                        color: "#c084fc",
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontFamily: "monospace",
                      }}>
                        WEEK {layer.week}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {layer.components.map(comp => (
                      <ComponentCard
                        key={comp.id}
                        comp={comp}
                        isSelected={selected === comp.id}
                        onClick={() => setSelected(selected === comp.id ? null : comp.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ flex: "1 1 42%", minWidth: 280, position: "sticky", top: 16, alignSelf: "flex-start" }}>
            <DetailPanel comp={selectedComp} />
          </div>
        </div>
      )}

      {/* Services Tab */}
      {activeTab === "services" && (
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 12,
            padding: 20,
          }}>
            <div style={{ color: "#c084fc", fontWeight: 700, fontSize: 14, marginBottom: 16, fontFamily: "monospace" }}>
              🧩 FINTECH MICROSERVICES — What runs inside your cluster
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {FINTECH_SERVICES.map((svc, i) => (
                <div key={i} style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 10,
                  padding: "14px 18px",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 12,
                }}>
                  <span style={{ fontSize: 22 }}>{svc.icon}</span>
                  <div style={{ flex: "1 1 200px", minWidth: 150 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#f8fafc" }}>{svc.name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                      <span style={{
                        background: "#7c3aed30",
                        color: "#c084fc",
                        padding: "1px 6px",
                        borderRadius: 3,
                        fontSize: 10,
                        fontWeight: 600,
                        marginRight: 6,
                      }}>
                        {svc.lang}
                      </span>
                      <span style={{
                        background: "#0ea5e930",
                        color: "#38bdf8",
                        padding: "1px 6px",
                        borderRadius: 3,
                        fontSize: 10,
                        fontWeight: 600,
                        marginRight: 6,
                      }}>
                        {svc.type}
                      </span>
                      <span style={{
                        background: "#f59e0b20",
                        color: "#fbbf24",
                        padding: "1px 6px",
                        borderRadius: 3,
                        fontSize: 10,
                        fontWeight: 600,
                      }}>
                        {svc.pattern}
                      </span>
                    </div>
                  </div>
                  {svc.connects.length > 0 && (
                    <div style={{ fontSize: 11, color: "#64748b", display: "flex", flexWrap: "wrap", gap: 4 }}>
                      <span style={{ color: "#475569" }}>→</span>
                      {svc.connects.map((c, j) => (
                        <span key={j} style={{
                          background: "#0f172a",
                          border: "1px solid #334155",
                          padding: "1px 6px",
                          borderRadius: 3,
                          color: "#94a3b8",
                          fontSize: 10,
                        }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 16,
              background: "#1a0a2e",
              border: "1px solid #7c3aed40",
              borderRadius: 10,
              padding: 16,
              fontFamily: "monospace",
              fontSize: 12,
              lineHeight: 1.8,
            }}>
              <div style={{ color: "#c084fc", fontWeight: 700, marginBottom: 6 }}>WHY THIS MIX MATTERS FOR LEARNING:</div>
              <div style={{ color: "#e2e8f0" }}>
                <span style={{ color: "#4ade80" }}>Go (Payment, Auth):</span> Teaches multi-stage builds with distroless, small binary, no runtime deps<br/>
                <span style={{ color: "#38bdf8" }}>Python (User, Notification):</span> Teaches dependency management, venv copying, large base image optimization<br/>
                <span style={{ color: "#22d3ee" }}>Node.js (API Gateway BFF):</span> Teaches npm ci, PID 1 problem, node_modules handling<br/>
                <span style={{ color: "#f59e0b" }}>Operators (PostgreSQL, Kafka, Redis):</span> Teaches CRD-driven management, StatefulSet patterns, HA configuration<br/>
                <span style={{ color: "#f472b6" }}>CronJob (Reconciliation):</span> Teaches batch scheduling, backoff policies, idempotent job design
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Roadmap Tab */}
      {activeTab === "roadmap" && (
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          {WEEK_PLAN.map((w) => (
            <div key={w.week} style={{ marginBottom: 12 }}>
              <button
                onClick={() => setExpandedWeek(expandedWeek === w.week ? null : w.week)}
                style={{
                  width: "100%",
                  background: expandedWeek === w.week ? "#581c87" : "#1e293b",
                  border: `1px solid ${expandedWeek === w.week ? "#7c3aed" : "#334155"}`,
                  borderRadius: expandedWeek === w.week ? "10px 10px 0 0" : 10,
                  padding: "16px 20px",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "#e2e8f0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span style={{
                    background: "#7c3aed",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "3px 10px",
                    borderRadius: 4,
                    marginRight: 12,
                    fontFamily: "monospace",
                  }}>
                    WEEK {w.week}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{w.title}</span>
                </div>
                <span style={{ color: "#64748b", fontSize: 18 }}>
                  {expandedWeek === w.week ? "−" : "+"}
                </span>
              </button>
              {expandedWeek === w.week && (
                <div style={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderTop: "none",
                  borderRadius: "0 0 10px 10px",
                  padding: 20,
                }}>
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ color: "#c084fc", fontWeight: 600, fontFamily: "monospace", fontSize: 11 }}>FOCUS: </span>
                    <span style={{ color: "#cbd5e1", fontSize: 13 }}>{w.focus}</span>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ color: "#4ade80", fontWeight: 600, fontFamily: "monospace", fontSize: 11 }}>SUCCESS METRIC: </span>
                    <span style={{ color: "#86efac", fontSize: 13 }}>{w.outcome}</span>
                  </div>
                  <div style={{
                    background: "#1e293b",
                    border: "1px solid #475569",
                    borderRadius: 8,
                    padding: 12,
                  }}>
                    <span style={{ color: "#f59e0b", fontWeight: 600, fontFamily: "monospace", fontSize: 11 }}>DAILY BREAKDOWN: </span>
                    <span style={{ color: "#fde68a", fontSize: 12 }}>{w.daily}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                    {LAYERS.filter(l => l.week === w.week).flatMap(l => l.components).map(c => (
                      <span key={c.id} style={{
                        background: "#1e293b",
                        border: "1px solid #475569",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontSize: 11,
                        color: "#e2e8f0",
                      }}>
                        {c.icon} {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div style={{
            background: "#14532d",
            border: "1px solid #22c55e",
            borderRadius: 10,
            padding: 16,
            marginTop: 16,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#4ade80", marginBottom: 4 }}>
              🎯 END STATE — PROJECT 1 + PROJECT 2 COMBINED
            </div>
            <div style={{ color: "#bbf7d0", fontSize: 12, lineHeight: 1.7 }}>
              A complete FinTech platform: Terraform-provisioned GCP infrastructure (P1) running 6 microservices in 3 languages
              with Istio service mesh, canary deployments, in-cluster databases, Kafka event streaming, full observability,
              and every decision documented with WHY. This is a senior/staff-level portfolio piece.
            </div>
          </div>
        </div>
      )}

      {/* Comparison Tab */}
      {activeTab === "comparison" && (
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 12,
            padding: 20,
            fontFamily: "monospace",
            fontSize: 12,
          }}>
            <div style={{ color: "#f472b6", fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
              ⚡ PROJECT 1 vs PROJECT 2 — What each teaches you
            </div>
            {[
              { topic: "Identity & Access", p1: "IAM, Service Accounts, Workload Identity", p2: "RBAC, ServiceAccount per pod, Istio AuthorizationPolicy", insight: "P1 = who can access GCP. P2 = who can access what inside the cluster." },
              { topic: "Networking", p1: "VPC, Subnets, Firewall rules, NAT, PSC", p2: "Network Policies, Istio VirtualService, mTLS, Service mesh routing", insight: "P1 = network plumbing. P2 = application-level traffic control." },
              { topic: "Security", p1: "Cloud Armor, Binary Auth, KMS, Secret Manager", p2: "Pod Security Standards, Falco, distroless images, supply chain security", insight: "P1 = perimeter security. P2 = zero-trust inside the perimeter." },
              { topic: "Deployment", p1: "Terraform apply → infrastructure exists", p2: "Canary rollouts, blue-green, GitOps, Argo Rollouts + Istio", insight: "P1 = infra as code. P2 = application as code with safe deployment." },
              { topic: "Data", p1: "Cloud SQL (managed), Memorystore, Pub/Sub", p2: "CloudNativePG, Strimzi Kafka, Redis Sentinel (self-managed in K8s)", insight: "P1 = 'use managed services.' P2 = 'understand what managed services abstract away.'" },
              { topic: "Observability", p1: "Cloud Monitoring, Cloud Logging, basic alerts", p2: "Kiali mesh graph, Jaeger tracing, Prometheus + Grafana, SLO-based alerts", insight: "P1 = infrastructure metrics. P2 = application-level observability." },
            ].map((row, i) => (
              <div key={i} style={{
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: 10,
                padding: 14,
                marginBottom: 10,
              }}>
                <div style={{ color: "#f8fafc", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{row.topic}</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                  <div style={{ flex: "1 1 200px" }}>
                    <span style={{ color: "#3b82f6", fontWeight: 600, fontSize: 10 }}>P1 (INFRA): </span>
                    <span style={{ color: "#93c5fd", fontSize: 11 }}>{row.p1}</span>
                  </div>
                  <div style={{ flex: "1 1 200px" }}>
                    <span style={{ color: "#c084fc", fontWeight: 600, fontSize: 10 }}>P2 (APP): </span>
                    <span style={{ color: "#d8b4fe", fontSize: 11 }}>{row.p2}</span>
                  </div>
                </div>
                <div style={{
                  background: "#0f172a",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 11,
                }}>
                  <span style={{ color: "#4ade80", fontWeight: 600 }}>💡 </span>
                  <span style={{ color: "#86efac" }}>{row.insight}</span>
                </div>
              </div>
            ))}
            <div style={{
              marginTop: 16,
              background: "#1a0a2e",
              border: "1px solid #7c3aed",
              borderRadius: 10,
              padding: 16,
              textAlign: "center",
            }}>
              <div style={{ color: "#c084fc", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                THE ARCHITECT'S SUPERPOWER
              </div>
              <div style={{ color: "#e2e8f0", fontSize: 12, lineHeight: 1.7, maxWidth: 600, margin: "0 auto" }}>
                When someone asks "How do you secure a payment API?", you don't give ONE answer.
                You give LAYERS: Cloud Armor (DDoS) → WAF → TLS termination → Istio mTLS → AuthorizationPolicy (L7) → Network Policy (L4) → Pod Security (runtime) → Falco (detection) → Audit logging (compliance).
                <br/><br/>
                <span style={{ color: "#4ade80", fontWeight: 700 }}>
                  That's what separates a deployer from an architect.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{
        textAlign: "center",
        marginTop: 24,
        color: "#475569",
        fontSize: 11,
        fontFamily: "monospace",
      }}>
        Project 2 of 2 · Application Architecture Inside GKE · Builds on Project 1 (Infrastructure) · Click components to learn WHY before you BUILD
      </div>
    </div>
  );
}
