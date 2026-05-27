export const entityKey = (entityId: string, entityType: string) =>
  `${entityId}:${entityType}`;

/** Generate a short random ID (placeholder; swap for uuid in production) */
export const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
