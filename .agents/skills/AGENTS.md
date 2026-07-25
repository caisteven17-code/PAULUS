# Project Codex Skill Registry

This folder contains project-scoped Codex skills for CAPSTONE. Use project skills for Diocese-specific contracts that should not apply globally.

## Skills

| Name | Purpose | Resources |
|---|---|---|
| `audit-logging` | Canonical `diocese.audit_logs` row contract and write rule for sensitive mutations. | `references/implementation.md`, `scripts/check_audit_logging.py` |

## Maintenance Rules

- Keep `SKILL.md` concise and put detailed examples in `references/`.
- Add scripts when a contract can be checked mechanically.
- Prefer this project folder for Diocese-specific policies.
- Keep `.claude/skills` synchronized only for Claude compatibility; Codex should treat this folder as canonical.
