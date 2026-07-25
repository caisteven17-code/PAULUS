// Shared helper for building human-readable before -> after diffs for audit logs.
// Used by edit/update flows so the Audit Log "Details" panel can show exactly
// which fields changed and what their old/new values were.

export interface FieldChange {
  field: string; // human label, e.g. "Start Date"
  from: string | null;
  to: string | null;
}

const DATE_FIELD = /(_date|_at|birthday)$/i;

/** "event_name" -> "Event Name" */
function prettyLabel(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bId\b/, 'ID');
}

/** Format a raw column value for display (dates, booleans, empty -> null). */
function formatValue(field: string, value: any): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (DATE_FIELD.test(field)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/**
 * Compare two rows over the given fields and return only the ones that changed.
 * Pass the list of columns that were actually part of the update so unrelated
 * fields (updated_at, etc.) are never reported.
 */
export function buildFieldChanges(before: any, after: any, fields: string[]): FieldChange[] {
  if (!before || !after) return [];
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const fromRaw = before[field] ?? null;
    const toRaw = after[field] ?? null;
    if (JSON.stringify(fromRaw) === JSON.stringify(toRaw)) continue;
    changes.push({
      field: prettyLabel(field),
      from: formatValue(field, fromRaw),
      to: formatValue(field, toRaw),
    });
  }
  return changes;
}
