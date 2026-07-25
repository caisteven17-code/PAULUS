---
name: audit-logging
description: Use when implementing any feature that mutates financial records, donations/expenses, submissions, approval decisions, role/permission changes, or other sensitive events in the Diocese of San Pablo system — defines the diocese.audit_logs row contract and the write rule. Consult before adding a new mutation type so every agent writes the same shape.
---

# Audit Logging

Canonical contract for `diocese.audit_logs` — the tamper-evident record of every sensitive event in the system. This consolidates a rule that was previously duplicated, in slightly different forms, across `backend-integration-specialist`, `security-compliance`, `project-donations-manager`, `submission-workflow`, `human-review-approval`, `payment-integration`, `data-privacy-compliance`, and `mlops-model-registry`.

## The rule

Every financial record mutation, donation/expense insert, submission event, approval decision, role/permission change, or security-relevant event MUST write one row to `diocese.audit_logs` at the time the action completes. No agent implements its own separate audit table for these events — they all write to this one table.

## Workflow

1. Identify whether the change mutates sensitive state.
2. Choose or extend an action from the catalogue below.
3. Write the domain mutation and audit row in the same service-level operation.
4. Include `old_value` and `new_value` for updates; include `amount` for financial events.
5. Run `scripts/check_audit_logging.py` with the changed files as arguments before finishing.

For implementation examples, read `references/implementation.md`.

## Row contract

```sql
log_id         UUID PRIMARY KEY
user_id        UUID REFERENCES diocese.profiles(id)
user_role      TEXT
action         TEXT NOT NULL  -- e.g. 'SUBMISSION_CREATED', 'DONATION_RECORDED', 'ROLE_CHANGED'
entity_type    TEXT  -- 'parish' | 'school' | 'seminary' | 'project' | 'user' | 'pipeline' | 'recommendation'
entity_id      UUID
entity_name    TEXT
amount         NUMERIC  -- for financial events only
old_value      JSONB  -- previous state, for update events
new_value      JSONB  -- new state, for update events
ip_address     TEXT
session_id     TEXT
source_agent   TEXT  -- which agent generated this row
severity       TEXT DEFAULT 'info'  -- 'info' | 'warning' | 'critical'
timestamp      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
checksum       TEXT  -- SHA-256 of row content, for tamper detection
```

**Required on every write**: `user_id` (or NULL for system-generated), `action`, `entity_type`, `entity_id`, `timestamp`, `source_agent`.
**Required when the event is a financial mutation**: `amount`.
**Required when the event is an update**: `old_value` and `new_value`.

## Action type catalogue (extend, don't replace)

```
AUTH:           LOGIN, LOGOUT, MFA_ENROLLED, PASSWORD_RESET, SUSPICIOUS_LOGIN
SUBMISSION:     SUBMISSION_CREATED, SUBMISSION_RESUBMITTED, SUBMISSION_ACCEPTED, SUBMISSION_REJECTED
FINANCIAL:      FINANCIAL_RECORD_CREATED, FINANCIAL_RECORD_UPDATED, FINANCIAL_RECORD_DELETED
PROJECT:        PROJECT_CREATED, PROJECT_UPDATED, DONATION_RECORDED, EXPENSE_LOGGED, PROJECT_CLOSED
RECOMMENDATION: RECOMMENDATION_CREATED, RECOMMENDATION_APPROVED, RECOMMENDATION_REJECTED, RECOMMENDATION_ESCALATED
ROLE:           ROLE_ASSIGNED, ROLE_REMOVED, PERMISSION_CHANGED
PIPELINE:       PIPELINE_STARTED, PIPELINE_COMPLETED, PIPELINE_FAILED, RETRAIN_TRIGGERED
SECURITY:       UNAUTHORIZED_ACCESS_ATTEMPT, DATA_EXPORT, BULK_OPERATION
PAYMENT:        PAYMENT_COMPLETED, PAYMENT_REFUNDED, PAYMENT_FAILED
PRIVACY:        DSR_RECEIVED, DSR_COMPLETED, BREACH_DETECTED, BREACH_NOTIFIED
MODEL:          MODEL_PROMOTED, MODEL_ROLLED_BACK
```

When a new mutation type is added, extend this catalogue rather than inventing an ad hoc `action` string.

## Not the same as the pipeline audit log

`diocese.pipeline_runs` / `diocese.pipeline_stage_events` (owned by `pipeline-orchestrator`) is a **separate** table for pipeline run/stage telemetry — not user-facing sensitive events. Don't conflate the two; a pipeline run starting is not a `diocese.audit_logs` row unless it's also a user-relevant security/financial event (e.g. a manual trigger by an admin).

## Who does what

- **Writes the rows**: `backend-integration-specialist` (and any agent performing the mutation, following this contract) — see its "Audit logging rule" section, which points here for the full contract.
- **Defines what must be logged / reviews access correctness**: `security-compliance`.
- **Builds the read-only query/filter/export UI over the rows**: `audit-log-viewer`.
- **Defines retention/archival schedule for this table**: `data-privacy-compliance` (3 years active, archive to cold storage per NPC IRR).

## Technical note

Codex can load this skill when a task matches its description. Agents should reference `audit-logging` by name instead of copying the row contract into their own instructions, keeping one canonical version instead of nine slightly-different copies.
