# Codex Agent Registry (CAPSTONE)

This folder contains the project-scoped Codex agents for the Diocese of San Pablo financial analytics system. These agents should stay project-local because they encode this repository's domain model, pipeline stages, and institutional workflows.

Global, reusable engineering agents live in `C:\Users\caist\.codex\agents`.

## Agent Index

| Name | Role |
|---|---|
| `analytics-data-science` | ML model training, evaluation, insight generation, and analytics layer specialist. |
| `audit-log-viewer` | Audit log querying, filtering, export, and compliance reporting specialist. |
| `chatbot-ai-assistant` | Conversational AI interface specialist. |
| `dashboard-analyst` | Data visualization and decision-support critic. |
| `data-engineer` | Data pipeline, ETL, and dataset quality specialist. |
| `digital-twin` | Digital Twin and sandbox simulation specialist. |
| `feature-engineer` | Feature engineering and feature store specialist. |
| `geospatial` | Geospatial data and bubblemap visualization specialist. |
| `health-tracker` | Entity health scoring, classification, trend monitoring, and health dashboard specialist. |
| `human-in-the-loop` | Human-in-the-Loop (HITL) integration specialist. |
| `human-review-approval` | Human Review and Approval Interface specialist. |
| `institution-management` | Institution master-data specialist. |
| `notification-announcements` | Notification delivery and in-app announcements specialist. |
| `pipeline-monitor` | Runtime monitoring, alerting, and observability specialist. |
| `pipeline-orchestrator` | Data pipeline scheduling, run sequencing, retry logic, and pipeline audit specialist. |
| `priest-assignment-management` | Priest assignment lifecycle specialist. |
| `project-donations-manager` | Project lifecycle, donation tracking, and expense management specialist. |
| `submission-workflow` | Financial data submission workflow specialist. |
| `what-if-analysis` | Institution-level what-if analysis specialist. |

## Domain Clusters

| Cluster | Agents |
|---|---|
| Pipeline orchestration and monitoring | `pipeline-orchestrator`, `pipeline-monitor` |
| Data ingestion and preparation | `data-engineer`, `feature-engineer` |
| ML and analytics | `analytics-data-science` |
| Master data | `institution-management`, `priest-assignment-management` |
| Submissions and financial operations | `submission-workflow`, `project-donations-manager` |
| Human oversight | `human-in-the-loop`, `human-review-approval` |
| Simulation | `digital-twin`, `what-if-analysis` |
| Consumption layer | `dashboard-analyst`, `chatbot-ai-assistant`, `geospatial`, `health-tracker`, `audit-log-viewer`, `notification-announcements` |

## Maintenance Rules

- Each agent file is TOML and must define `name`, `description`, and `developer_instructions`.
- The filename must match the `name` field exactly: `<name>.toml`.
- Project-domain agents belong here. Reusable engineering agents belong in the global Codex agent folder.
- If an agent repeats a detailed policy or contract that multiple agents need, extract it into a skill under `.agents/skills` instead of duplicating the text.
- The project audit logging contract is in `.agents/skills/audit-logging/SKILL.md`; keep `.claude/skills/audit-logging/SKILL.md` synchronized only if Claude compatibility is still needed.

## Skill Usage

Use the project `audit-logging` skill for every agent that creates or changes financial records, donations, expenses, submissions, approval decisions, role/permission assignments, security events, model promotion/rollback records, or pipeline events that need a user-facing audit trail.

When a project agent touches reusable engineering concerns, also use the matching global skill:

| Concern | Skill |
|---|---|
| API error response shape | `api-error-contract` |
| Retry-safe mutation or event handling | `idempotency-key` |
| API/request validation | `input-validation-boundary` |
| Role/permission enforcement | `rbac-access-control` |
| External API retries | `retry-backoff-policy` |
| New credentials or environment secrets | `secrets-management-pattern` |
