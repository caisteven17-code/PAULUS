# Audit Logging Implementation Reference

Use this reference after loading the `audit-logging` skill and before implementing a new sensitive mutation.

## Service-Level Pattern

Keep audit logging at the service boundary, close to the mutation. Controllers should pass request context; services should decide what actually changed and write the audit row.

```typescript
async function updateProject(projectId: string, input: UpdateProjectDto, actor: Actor, request: RequestContext) {
  const before = await projectRepository.getById(projectId);
  const after = await projectRepository.update(projectId, input);

  await auditLogService.record({
    user_id: actor.id,
    user_role: actor.role,
    action: 'PROJECT_UPDATED',
    entity_type: 'project',
    entity_id: projectId,
    entity_name: after.name,
    old_value: before,
    new_value: after,
    ip_address: request.ipAddress,
    session_id: request.sessionId,
    source_agent: 'project-donations-manager',
    severity: 'info',
  });

  return after;
}
```

## Transaction Rule

If the stack supports transactions, the domain mutation and audit row should commit or roll back together. If the audit insert fails, do not silently continue for financial, approval, role, permission, or security events.

```typescript
await db.transaction(async (tx) => {
  const donation = await tx.donations.insert(input);
  await tx.auditLogs.insert(buildDonationAuditRow(donation, actor, request));
  return donation;
});
```

## Action Selection

Use an existing action if the meaning already fits. Add a new action only when:

- The event changes how compliance reports should group records.
- The event needs different required fields.
- The event represents a distinct lifecycle step, not a UI wording variation.

Prefer `SUBMISSION_RESUBMITTED` over inventing `SUBMISSION_UPDATED_BY_USER`.

## Checks Before Finishing

- Confirm the mutation path cannot return success before the audit write completes.
- Confirm update events include both previous and new state.
- Confirm financial events include `amount`.
- Confirm system-generated events use `user_id = NULL` and a meaningful `source_agent`.
- Confirm errors from the audit write are logged server-side without leaking sensitive data to clients.
