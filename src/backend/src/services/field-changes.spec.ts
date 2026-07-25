import assert from 'node:assert/strict';
import { buildFieldChanges } from './field-changes';

// No changes when before/after are missing.
assert.deepEqual(buildFieldChanges(null, { a: 1 }, ['a']), []);
assert.deepEqual(buildFieldChanges({ a: 1 }, null, ['a']), []);

// Unchanged fields are omitted; only fields in the given list are considered.
assert.deepEqual(
  buildFieldChanges({ a: 1, b: 2, updated_at: 't0' }, { a: 1, b: 3, updated_at: 't1' }, ['a', 'b']),
  [{ field: 'B', from: '2', to: '3' }],
);

// snake_case fields get a human-readable label.
assert.deepEqual(buildFieldChanges({ start_date: null }, { start_date: '2026-01-15' }, ['start_date']), [
  { field: 'Start Date', from: null, to: 'Jan 15, 2026' },
]);

// booleans render as Yes/No.
assert.deepEqual(buildFieldChanges({ is_active: false }, { is_active: true }, ['is_active']), [
  { field: 'Is Active', from: 'No', to: 'Yes' },
]);

// empty string is normalized to null, same as missing.
assert.deepEqual(buildFieldChanges({ notes: '' }, { notes: 'hello' }, ['notes']), [
  { field: 'Notes', from: null, to: 'hello' },
]);
