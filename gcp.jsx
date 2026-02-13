import { useState } from "react";

const LAYERS = [
  {
    id: "internet",
    label: "INTERNET / CLIENTS",
    color: "#64748b",
    bgColor: "#f1f5f9",
    borderColor: "#cbd5e1",
    week: null,
    components: [
      {
        id: "clients",
        name: "Mobile / Web Clients",
        icon: "📱",
        desc: "End users accessing the FinTech API via HTTPS",
        why: "All traffic enters through Cloud CDN → Load Balancer. Never expose pods directly.",
        build: null,
      },
      {
        id: "thirdparty",
        name: "3rd Party (Stripe/Plaid)",
        icon: "🏦",
        desc: "External payment processors and banking APIs",
        why: "Webhook callbacks need dedicated ingress rules + signature verification.",
        build: null,
      },
    ],
  },
  {
    id: "edge",
    label: "LAYER 0 — EDGE & DNS",
    color: "#0369a1",
    bgColor: "#e0f2fe",
    borderColor: "#7dd3fc",
    week: 1,
    components: [
      {
        id: "clouddns",
        name: "Cloud DNS",
        icon: "🌐",
        desc: "Managed DNS with DNSSEC enabled",
        why: "DNSSEC prevents DNS spoofing — critical for FinTech. If someone hijacks your DNS, they redirect payments.",
        build: "Terraform: google_dns_managed_zone + google_dns_record_set",
      },
      {
        id: "cloudcdn",
        name: "Cloud CDN + Armor",
        icon: "🛡️",
        desc: "DDoS protection + WAF rules + rate limiting",
        why: "Cloud Armor blocks OWASP Top 10, geo-restricts, rate-limits. First line of defense before traffic hits your cluster.",
        build: "Terraform: google_compute_security_policy with preconfigured WAF rules",
      },
      {
        id: "gclb",
        name: "Global HTTPS LB",
        icon: "⚖️",
        desc: "L7 load balancer with managed SSL certificates",
        why: "TLS termination at Google's edge. Your pods never handle raw SSL — reduces attack surface and simplifies cert management.",
        build: "Terraform: google_compute_global_forwarding_rule + google_compute_managed_ssl_certificate",
      },
    ],
  },
  {
    id: "foundation",
    label: "LAYER 1 — GCP FOUNDATION",
    color: "#7c3aed",
    bgColor: "#f5f3ff",
    borderColor: "#c4b5fd",
    week: 1,
    components: [
      {
        id: "org",
        name: "GCP Organization",
        icon: "🏢",
        desc: "Org → Folders (prod/staging/dev) → Projects",
        why: "Folder hierarchy = blast radius control. A compromised dev project can't touch prod. IAM policies inherit downward.",
        build: "Terraform: google_folder + google_project with org policies",
      },
      {
        id: "vpc",
        name: "Shared VPC",
        icon: "🔗",
        desc: "Host project owns network, service projects consume subnets",
        why: "Shared VPC = centralized network control. Network team manages firewall rules, app teams get subnets. This is how enterprises prevent shadow IT networking.",
        build: "Terraform: google_compute_shared_vpc_host_project + service_project",
      },
      {
        id: "iam",
        name: "IAM + Workload Identity",
        icon: "🔑",
        desc: "No service account keys. Ever. Pods get GCP identity via Workload Identity Federation.",
        why: "Service account keys are the #1 cause of GCP breaches. Workload Identity binds K8s ServiceAccount → GCP ServiceAccount with zero keys.",
        build: "Terraform: google_service_account + google_service_account_iam_binding",
      },
      {
        id: "auditlog",
        name: "Audit Logging + Log Sink",
        icon: "📋",
        desc: "All admin actions → BigQuery for compliance",
        why: "PCI-DSS requires audit trail of all access. Log sinks send to BigQuery (queryable) + Cloud Storage (long-term retention).",
        build: "Terraform: google_logging_project_sink → BigQuery dataset",
      },
    ],
  },
  {
    id: "network",
    label: "LAYER 2 — NETWORKING",
    color: "#059669",
    bgColor: "#ecfdf5",
    borderColor: "#6ee7b7",
    week: 1,
    components: [
      {
        id: "vpcnet",
        name: "Custom VPC",
        icon: "🌐",
        desc: "Custom mode VPC (never use default). Private Google Access enabled.",
        why: "Default VPC has 0.0.0.0/0 routes and permissive firewall. Custom VPC = you define every route and rule. Private Google Access lets pods reach GCP APIs without public IPs.",
        build: "Terraform: google_compute_network (auto_create_subnetworks = false)",
      },
      {
        id: "subnets",
        name: "Subnet Design",
        icon: "📊",
        desc: "3 subnets: GKE nodes (/22), Pods (/16), Services (/20)",
        why: "GKE needs 3 CIDR ranges. /16 for pods = 65K pod IPs. Plan for 10x growth. Under-sizing CIDRs is the #1 networking mistake — you can't expand later.",
        build: "Terraform: google_compute_subnetwork with secondary_ip_range blocks",
      },
      {
        id: "firewall",
        name: "Firewall Rules",
        icon: "🔥",
        desc: "Deny-all default. Explicit allow rules only for required paths.",
        why: "Zero-trust starts here. Default deny + allow only: LB→nodes:80/443, nodes→master:443, master→nodes:10250 (kubelet). Every rule needs a justification.",
        build: "Terraform: google_compute_firewall with target_tags",
      },
      {
        id: "nat",
        name: "Cloud NAT",
        icon: "🚪",
        desc: "Outbound internet for private nodes (pulling images, calling APIs)",
        why: "Private GKE nodes have NO public IPs (good). But they need outbound for container registry pulls and external API calls. Cloud NAT gives controlled outbound without exposure.",
        build: "Terraform: google_compute_router_nat",
      },
      {
        id: "psc",
        name: "Private Service Connect",
        icon: "🔒",
        desc: "Private endpoints for Cloud SQL, Redis, Pub/Sub",
        why: "Even GCP-to-GCP traffic should stay private. PSC creates private endpoints so your pods talk to Cloud SQL over internal IPs, never public internet.",
        build: "Terraform: google_compute_global_address + google_service_networking_connection",
      },
    ],
  },
  {
    id: "gke",
    label: "LAYER 3 — GKE CLUSTER",
    color: "#dc2626",
    bgColor: "#fef2f2",
    borderColor: "#fca5a5",
    week: 2,
    components: [
      {
        id: "cluster",
        name: "Private GKE Cluster",
        icon: "☸️",
        desc: "Private endpoint + authorized networks + Dataplane V2",
        why: "Private cluster = API server not exposed to internet. Dataplane V2 (eBPF-based) replaces kube-proxy, enables native network policies, and gives you pod-level traffic visibility.",
        build: "Terraform: google_container_cluster (private_cluster_config block)",
      },
      {
        id: "nodepool",
        name: "Node Pools (3 types)",
        icon: "🖥️",
        desc: "system (infra), app (workloads), spot (batch jobs)",
        why: "Taint system pool (CriticalAddonsOnly) so apps can't land there. Spot pool for batch = 60-90% cost savings. Separate pools = separate scaling + security boundaries.",
        build: "Terraform: google_container_node_pool × 3 with taints + labels",
      },
      {
        id: "netpol",
        name: "Network Policies",
        icon: "🚧",
        desc: "Default deny all. Explicit allow between namespaces.",
        why: "Without network policies, ANY pod can talk to ANY pod. In FinTech, the payment-service namespace must ONLY reach the database — not the user-service. This is lateral movement prevention.",
        build: "K8s: NetworkPolicy YAML with namespaceSelector + podSelector",
      },
      {
        id: "rbac",
        name: "RBAC + Namespaces",
        icon: "👥",
        desc: "Namespace per service. RBAC roles scoped to namespace.",
        why: "Dev team gets edit on dev namespace, view-only on staging, zero access to prod. Namespace = blast radius. RBAC = least privilege. Both are PCI requirements.",
        build: "K8s: Namespace + Role + RoleBinding per team/service",
      },
      {
        id: "gatekeeper",
        name: "OPA Gatekeeper",
        icon: "⛔",
        desc: "Policy engine: no privileged containers, no latest tag, resource limits required",
        why: "Developers WILL try to deploy privileged containers and skip resource limits. Gatekeeper makes policy violations a deploy-time error, not a runtime surprise.",
        build: "Helm: gatekeeper + ConstraintTemplate + Constraint CRDs",
      },
    ],
  },
  {
    id: "security",
    label: "LAYER 4 — SECURITY & SECRETS",
    color: "#b91c1c",
    bgColor: "#fef2f2",
    borderColor: "#f87171",
    week: 2,
    components: [
      {
        id: "secretmgr",
        name: "Secret Manager + CSI",
        icon: "🔐",
        desc: "Secrets stored in GCP Secret Manager, mounted via CSI driver",
        why: "Never store secrets in K8s Secrets (base64 ≠ encryption). Secret Manager CSI driver mounts secrets as files. Rotation = update in Secret Manager, pods get new version automatically.",
        build: "Terraform: google_secret_manager_secret + K8s SecretProviderClass",
      },
      {
        id: "kms",
        name: "Cloud KMS",
        icon: "🗝️",
        desc: "Customer-managed encryption keys for etcd + application-level encryption",
        why: "By default, Google encrypts etcd. But PCI-DSS requires you CONTROL the keys. CMEK = you can revoke access, rotate keys, and prove to auditors you own the encryption.",
        build: "Terraform: google_kms_key_ring + google_kms_crypto_key + CMEK config on GKE",
      },
      {
        id: "binaryauth",
        name: "Binary Authorization",
        icon: "✅",
        desc: "Only signed images from your Artifact Registry can deploy",
        why: "Prevents supply chain attacks. Even if someone gets kubectl access, they can't deploy a random Docker image. Only images signed by your CI/CD pipeline are allowed.",
        build: "Terraform: google_binary_authorization_policy + Attestor",
      },
      {
        id: "securitycmd",
        name: "Security Command Center",
        icon: "🔍",
        desc: "Vulnerability scanning, misconfiguration detection, threat detection",
        why: "Continuous security posture assessment. Flags things like: public IPs on nodes, overly permissive IAM, unpatched container vulnerabilities. Your security dashboard.",
        build: "Enable via Console → integrates with GKE automatically",
      },
    ],
  },
  {
    id: "app",
    label: "LAYER 5 — APPLICATION (FinTech Microservices)",
    color: "#ea580c",
    bgColor: "#fff7ed",
    borderColor: "#fdba74",
    week: 3,
    components: [
      {
        id: "apigw",
        name: "API Gateway (Kong/Istio)",
        icon: "🚪",
        desc: "Rate limiting, auth, request routing, API versioning",
        why: "Single entry point for all API traffic. Handles JWT validation, rate limiting per client, request/response transformation. Without this, every microservice implements auth differently.",
        build: "Helm: kong + Ingress resources with annotations",
      },
      {
        id: "authsvc",
        name: "Auth Service",
        icon: "🔓",
        desc: "JWT issuance, OAuth2, MFA verification",
        why: "Centralized auth = one place to audit, one place to fix vulnerabilities. Issues short-lived JWTs (15min). Refresh tokens stored encrypted in Redis.",
        build: "Go/Python app + Deployment + Service + HPA",
      },
      {
        id: "paymentsvc",
        name: "Payment Service",
        icon: "💳",
        desc: "Processes transactions, talks to Stripe/Plaid via mTLS",
        why: "The crown jewel. Isolated namespace, strictest network policies, separate node pool consideration. All external calls via mTLS. Every transaction logged to immutable audit log.",
        build: "Go/Python app + strict NetworkPolicy + dedicated ServiceAccount",
      },
      {
        id: "usersvc",
        name: "User Service",
        icon: "👤",
        desc: "User profiles, KYC data, PII handling",
        why: "PII requires encryption at rest + in transit + field-level encryption for sensitive data (SSN, bank account). Separate database from payment data.",
        build: "Go/Python app + Cloud SQL (separate instance from payments)",
      },
      {
        id: "notifysvc",
        name: "Notification Service",
        icon: "🔔",
        desc: "Pub/Sub consumer for async events (email, SMS, push)",
        why: "Async via Pub/Sub = payment service doesn't wait for email delivery. Dead letter queue catches failures. This is how you decouple and scale independently.",
        build: "Go/Python app + Pub/Sub subscription + Cloud Tasks",
      },
    ],
  },
  {
    id: "data",
    label: "LAYER 6 — DATA & STATE",
    color: "#7c3aed",
    bgColor: "#faf5ff",
    borderColor: "#c4b5fd",
    week: 3,
    components: [
      {
        id: "cloudsql",
        name: "Cloud SQL (PostgreSQL)",
        icon: "🗄️",
        desc: "HA PostgreSQL with private IP, automated backups, CMEK encryption",
        why: "Managed DB = Google handles patching, failover, backups. Private IP = no public exposure. Point-in-time recovery for compliance. Never self-host databases unless you have a DBA team.",
        build: "Terraform: google_sql_database_instance + private network config",
      },
      {
        id: "redis",
        name: "Memorystore (Redis)",
        icon: "⚡",
        desc: "Session cache, rate limit counters, pub/sub for real-time",
        why: "Redis for rate limiting = O(1) check per request. Session tokens in Redis = stateless pods (any pod can serve any user). Critical for horizontal scaling.",
        build: "Terraform: google_redis_instance with AUTH enabled",
      },
      {
        id: "pubsub",
        name: "Cloud Pub/Sub",
        icon: "📨",
        desc: "Event bus for async microservice communication",
        why: "Payment completed → publish event → notification service, ledger service, analytics all consume independently. If one consumer fails, others aren't affected. This is event-driven architecture.",
        build: "Terraform: google_pubsub_topic + google_pubsub_subscription with DLQ",
      },
      {
        id: "gcs",
        name: "Cloud Storage",
        icon: "📦",
        desc: "Document storage (KYC docs), Terraform state, audit log archive",
        why: "Versioned bucket for Terraform state (so you can rollback infra). Separate bucket for KYC docs with object-level IAM. Lifecycle rules auto-archive to Coldline after 90 days.",
        build: "Terraform: google_storage_bucket with versioning + lifecycle rules",
      },
    ],
  },
  {
    id: "cicd",
    label: "LAYER 7 — CI/CD PIPELINE",
    color: "#0284c7",
    bgColor: "#e0f2fe",
    borderColor: "#7dd3fc",
    week: 4,
    components: [
      {
        id: "github",
        name: "GitHub + Branch Protection",
        icon: "🐙",
        desc: "Main branch protected. PRs require review + passing CI.",
        why: "No one pushes directly to main. PR reviews catch misconfigs before they hit infra. Branch protection = your human firewall.",
        build: "GitHub: branch protection rules + CODEOWNERS file",
      },
      {
        id: "cloudbuild",
        name: "Cloud Build",
        icon: "🔨",
        desc: "Build → Test → Scan → Sign → Push to Artifact Registry",
        why: "Cloud Build runs IN GCP, so it has native access to Artifact Registry and Binary Authorization. No credentials to manage. Build steps: lint → test → trivy scan → cosign sign → push.",
        build: "cloudbuild.yaml + Terraform: google_cloudbuild_trigger",
      },
      {
        id: "artifactreg",
        name: "Artifact Registry",
        icon: "📦",
        desc: "Private container registry with vulnerability scanning",
        why: "Never pull from Docker Hub in production. Your images live in Artifact Registry with automatic vulnerability scanning. Binary Auth ensures only these signed images deploy.",
        build: "Terraform: google_artifact_registry_repository",
      },
      {
        id: "argocd",
        name: "ArgoCD (GitOps)",
        icon: "🔄",
        desc: "Git repo = source of truth for cluster state. ArgoCD syncs automatically.",
        why: "GitOps = every change is a git commit = full audit trail. ArgoCD watches your manifests repo and auto-syncs. If someone kubectl-edits in prod, ArgoCD reverts it. Drift detection = compliance.",
        build: "Helm: argo-cd + ApplicationSet for multi-env",
      },
    ],
  },
  {
    id: "observability",
    label: "LAYER 8 — OBSERVABILITY (SRE)",
    color: "#ca8a04",
    bgColor: "#fefce8",
    borderColor: "#fde047",
    week: 4,
    components: [
      {
        id: "monitoring",
        name: "Cloud Monitoring + Prometheus",
        icon: "📈",
        desc: "4 Golden Signals: Latency, Traffic, Errors, Saturation",
        why: "Google SRE's 4 signals diagnose 90% of issues. Prometheus scrapes pod metrics, Cloud Monitoring for infra. SLO dashboards show: 'Are we meeting our 99.9% target?'",
        build: "Terraform: google_monitoring_alert_policy + Helm: prometheus-stack",
      },
      {
        id: "logging",
        name: "Cloud Logging + Loki",
        icon: "📝",
        desc: "Structured JSON logs → Cloud Logging with log-based metrics",
        why: "Structured logs = queryable. Log-based metrics = alert when error rate spikes. Correlation: request-id in logs + traces lets you follow one payment through every service.",
        build: "Terraform: google_logging_metric + log sinks to BigQuery",
      },
      {
        id: "tracing",
        name: "Cloud Trace (OpenTelemetry)",
        icon: "🔎",
        desc: "Distributed tracing across all microservices",
        why: "When a payment takes 5s instead of 200ms, tracing shows EXACTLY which service added latency. Without tracing, debugging microservices is guesswork.",
        build: "OpenTelemetry SDK in each service + Cloud Trace exporter",
      },
      {
        id: "alerting",
        name: "PagerDuty / Alerting",
        icon: "🚨",
        desc: "SLO-based alerts, not threshold-based. Error budget burn rate alerts.",
        why: "Don't alert on 'CPU > 80%'. Alert on 'error budget burning 10x faster than normal'. This means: your SLO is at risk, act now. Reduces alert fatigue dramatically.",
        build: "Terraform: google_monitoring_alert_policy with SLO conditions",
      },
    ],
  },
];

const WEEK_PLAN = [
  {
    week: 1,
    title: "Foundation + Networking",
    focus: "GCP org, VPC, subnets, firewall, NAT, Shared VPC",
    outcome: "You can explain WHY every network component exists and what happens without it",
  },
  {
    week: 2,
    title: "GKE + Security",
    focus: "Private cluster, RBAC, Network Policies, Secrets, KMS, Binary Auth",
    outcome: "You can draw the security boundary around each microservice from memory",
  },
  {
    week: 3,
    title: "Application + Data",
    focus: "Deploy microservices, Cloud SQL, Redis, Pub/Sub, API Gateway",
    outcome: "You can explain the data flow of a payment transaction end-to-end",
  },
  {
    week: 4,
    title: "CI/CD + Observability",
    focus: "Cloud Build, ArgoCD, Monitoring, Tracing, SLOs, Alerting",
    outcome: "You can demo the full lifecycle: code commit → production with observability",
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
      transition: "all 0.2s ease",
      minWidth: 140,
      flex: "1 1 140px",
      maxWidth: 220,
      boxShadow: isSelected ? "0 0 0 2px #3b82f680" : "0 1px 2px rgba(0,0,0,0.04)",
    }}
  >
    <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 16 }}>{comp.icon}</span>
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
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 14,
    }}>
      ← Click any component to see WHY it exists, WHAT it does, and HOW to build it
    </div>
  );

  return (
    <div style={{
      background: "#0f172a",
      borderRadius: 12,
      padding: 20,
      color: "#e2e8f0",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.7,
      border: "1px solid #334155",
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: "#38bdf8", display: "flex", alignItems: "center", gap: 8 }}>
        <span>{comp.icon}</span> {comp.name}
      </div>
      <div style={{ marginBottom: 14 }}>
        <span style={{ color: "#22d3ee", fontWeight: 600 }}>WHAT: </span>
        <span style={{ color: "#cbd5e1" }}>{comp.desc}</span>
      </div>
      <div style={{ marginBottom: 14 }}>
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
        }}>
          <span style={{ color: "#4ade80", fontWeight: 600 }}>BUILD WITH: </span>
          <span style={{ color: "#86efac" }}>{comp.build}</span>
        </div>
      )}
    </div>
  );
};

export default function FinTechArchitecture() {
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
          background: "linear-gradient(135deg, #0f172a, #1e293b)",
          border: "1px solid #334155",
          borderRadius: 16,
          padding: "16px 32px",
        }}>
          <h1 style={{
            fontSize: 22,
            fontWeight: 800,
            margin: 0,
            background: "linear-gradient(135deg, #38bdf8, #818cf8, #c084fc)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.5px",
          }}>
            FinTech Payment Platform — GKE Architecture
          </h1>
          <p style={{ color: "#64748b", fontSize: 12, margin: "6px 0 0", fontFamily: "'JetBrains Mono', monospace" }}>
            Enterprise-Grade · PCI-DSS Ready · 9 Layers · Click any component to learn WHY
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
        {[
          { id: "architecture", label: "🏗️ Architecture" },
          { id: "roadmap", label: "🗓️ 4-Week Build Plan" },
          { id: "dataflow", label: "💳 Payment Flow" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: activeTab === tab.id ? "#3b82f6" : "#1e293b",
              color: activeTab === tab.id ? "#fff" : "#94a3b8",
              border: `1px solid ${activeTab === tab.id ? "#3b82f6" : "#334155"}`,
              borderRadius: 8,
              padding: "8px 16px",
              cursor: "pointer",
              fontSize: 13,
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
          {/* Left: Layers */}
          <div style={{ flex: "1 1 60%", minWidth: 0 }}>
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
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 4,
                      letterSpacing: "0.5px",
                      fontFamily: "monospace",
                    }}>
                      {layer.label}
                    </span>
                    {layer.week && (
                      <span style={{
                        background: "#1e293b",
                        color: "#38bdf8",
                        fontSize: 10,
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

          {/* Right: Detail Panel */}
          <div style={{ flex: "1 1 40%", minWidth: 280, position: "sticky", top: 16, alignSelf: "flex-start" }}>
            <DetailPanel comp={selectedComp} />
            {selectedComp && (
              <div style={{
                marginTop: 12,
                background: "#1e293b",
                borderRadius: 10,
                padding: 14,
                border: "1px solid #334155",
              }}>
                <div style={{ color: "#f472b6", fontWeight: 700, fontSize: 12, marginBottom: 6, fontFamily: "monospace" }}>
                  🧠 ARCHITECT'S QUESTION
                </div>
                <div style={{ color: "#e2e8f0", fontSize: 13, lineHeight: 1.6 }}>
                  {selectedComp.id === "vpc" && "What happens if a pod in your payment namespace can directly reach the internet without going through NAT? What's the attack vector?"}
                  {selectedComp.id === "subnets" && "You allocated /16 for pods. How many pods is that? What happens when you run out? Can you expand later?"}
                  {selectedComp.id === "firewall" && "A developer says 'just open 0.0.0.0/0 for testing.' What do you tell them and why?"}
                  {selectedComp.id === "cluster" && "Why is Dataplane V2 better than default kube-proxy for FinTech? Hint: think about network policy enforcement."}
                  {selectedComp.id === "netpol" && "If you have default-deny but forgot to allow DNS (port 53), what breaks? Everything. Can you explain why?"}
                  {selectedComp.id === "rbac" && "A senior dev says they need cluster-admin 'just for debugging.' What's the least-privilege alternative?"}
                  {selectedComp.id === "secretmgr" && "Why is K8s Secret (base64) not encryption? What tool would you need to actually encrypt etcd at rest?"}
                  {selectedComp.id === "kms" && "What's the difference between Google-managed encryption and CMEK? When would PCI auditor require CMEK?"}
                  {selectedComp.id === "paymentsvc" && "How would you design the payment service to be idempotent? What happens if Stripe webhook fires twice?"}
                  {selectedComp.id === "cloudsql" && "Why use Private Service Connect instead of just a private IP for Cloud SQL? What attack does PSC prevent?"}
                  {selectedComp.id === "argocd" && "Someone does 'kubectl edit' in production. What does ArgoCD do? Why is this critical for compliance?"}
                  {selectedComp.id === "monitoring" && "What's the difference between alerting on 'error rate > 5%' vs 'error budget burn rate > 10x'? Which is better for SRE?"}
                  {!["vpc","subnets","firewall","cluster","netpol","rbac","secretmgr","kms","paymentsvc","cloudsql","argocd","monitoring"].includes(selectedComp.id) && "Ask yourself: what breaks if this component is misconfigured? What's the blast radius? How would you detect the failure?"}
                </div>
              </div>
            )}
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
                  background: expandedWeek === w.week ? "#1e40af" : "#1e293b",
                  border: `1px solid ${expandedWeek === w.week ? "#3b82f6" : "#334155"}`,
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
                    background: "#3b82f6",
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
                    <span style={{ color: "#22d3ee", fontWeight: 600, fontFamily: "monospace", fontSize: 12 }}>FOCUS: </span>
                    <span style={{ color: "#cbd5e1", fontSize: 13 }}>{w.focus}</span>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ color: "#4ade80", fontWeight: 600, fontFamily: "monospace", fontSize: 12 }}>SUCCESS METRIC: </span>
                    <span style={{ color: "#86efac", fontSize: 13 }}>{w.outcome}</span>
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "monospace" }}>
                    Components to build:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {LAYERS.filter(l => l.week === w.week).flatMap(l => l.components).map(c => (
                      <span key={c.id} style={{
                        background: "#1e293b",
                        border: "1px solid #475569",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontSize: 12,
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
              🎯 END STATE
            </div>
            <div style={{ color: "#bbf7d0", fontSize: 13, lineHeight: 1.6 }}>
              A fully deployed FinTech payment platform on GKE with Terraform IaC, GitOps CD, mTLS between services, PCI-ready security controls, and SLO-based observability. You can explain every architectural decision and WHY you made it.
            </div>
          </div>
        </div>
      )}

      {/* Data Flow Tab */}
      {activeTab === "dataflow" && (
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 12,
            padding: 20,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13,
            lineHeight: 2.2,
          }}>
            <div style={{ color: "#f472b6", fontWeight: 700, marginBottom: 8, fontSize: 14 }}>
              💳 PAYMENT TRANSACTION FLOW — What happens when a user pays $50?
            </div>
            {[
              { step: "1", icon: "📱", text: "Client sends POST /api/v1/payments (HTTPS/TLS 1.3)", color: "#38bdf8" },
              { step: "2", icon: "🛡️", text: "Cloud Armor → WAF rules check → rate limit check → pass", color: "#f59e0b" },
              { step: "3", icon: "⚖️", text: "Global LB → TLS terminates → routes to GKE Ingress", color: "#f59e0b" },
              { step: "4", icon: "🚪", text: "API Gateway (Kong) → validates JWT → extracts user_id", color: "#22d3ee" },
              { step: "5", icon: "💳", text: "Payment Service → idempotency check in Redis → process", color: "#4ade80" },
              { step: "6", icon: "🏦", text: "Payment Service → mTLS call to Stripe API → charge card", color: "#c084fc" },
              { step: "7", icon: "🗄️", text: "Payment Service → write transaction to Cloud SQL (encrypted)", color: "#c084fc" },
              { step: "8", icon: "📨", text: "Payment Service → publish 'payment.completed' to Pub/Sub", color: "#fb923c" },
              { step: "9", icon: "🔔", text: "Notification Service → consumes event → sends receipt email", color: "#fb923c" },
              { step: "10", icon: "📈", text: "OpenTelemetry → trace spans to Cloud Trace → metrics to Prometheus", color: "#64748b" },
              { step: "11", icon: "📋", text: "Audit log → immutable entry in BigQuery (who, what, when)", color: "#64748b" },
            ].map(s => (
              <div key={s.step} style={{ display: "flex", alignItems: "flex-start", gap: 10, color: s.color }}>
                <span style={{
                  background: "#0f172a",
                  border: `1px solid ${s.color}40`,
                  borderRadius: 6,
                  padding: "0 6px",
                  fontSize: 11,
                  fontWeight: 700,
                  minWidth: 22,
                  textAlign: "center",
                  flexShrink: 0,
                  marginTop: 3,
                }}>
                  {s.step}
                </span>
                <span>{s.icon} {s.text}</span>
              </div>
            ))}
            <div style={{
              marginTop: 16,
              padding: "12px 16px",
              background: "#0f172a",
              borderRadius: 8,
              border: "1px solid #475569",
              color: "#94a3b8",
              fontSize: 12,
              lineHeight: 1.8,
            }}>
              <span style={{ color: "#f472b6", fontWeight: 700 }}>TOTAL SECURITY LAYERS CROSSED: </span>
              Cloud Armor (DDoS/WAF) → TLS termination → JWT validation → Network Policy (namespace isolation) → mTLS (service-to-service) → CMEK encryption (data at rest) → Audit logging (compliance)
              <br />
              <span style={{ color: "#4ade80", fontWeight: 700 }}>THIS is what you explain in interviews.</span>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        textAlign: "center",
        marginTop: 24,
        color: "#475569",
        fontSize: 11,
        fontFamily: "monospace",
      }}>
        Built for hands-on learning · Each component maps to your GKE Architecture Playbook · Click components to understand WHY before you BUILD
      </div>
    </div>
  );
}
