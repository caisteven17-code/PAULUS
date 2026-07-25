import assert from 'node:assert/strict';
import { normalizeAccessRole } from './access';

// Display-name match (case/whitespace insensitive) — 'Bishop' is INITIAL_ROLES' display name for id 'bishop'.
assert.equal(normalizeAccessRole('Bishop'), 'bishop');
assert.equal(normalizeAccessRole('  bishop  '), 'bishop');

// Legacy alias remap.
assert.equal(normalizeAccessRole('admin'), 'diocesan_oeconomus');
assert.equal(normalizeAccessRole('priest'), 'parish_priest');

// Corrective alias — a role name that was mistakenly stored/displayed and must remap to the canonical id.
assert.equal(normalizeAccessRole('school_director'), 'finance_officer');
assert.equal(normalizeAccessRole('rector'), 'seminary_rector');

// Already-canonical id passes through unchanged.
assert.equal(normalizeAccessRole('parish_secretary'), 'parish_secretary');

// Default fallback when role is missing/empty.
assert.equal(normalizeAccessRole(undefined), 'parish_priest');
assert.equal(normalizeAccessRole(''), 'parish_priest');

// Unknown role normalizes (lowercase + underscored) but isn't remapped to anything else.
assert.equal(normalizeAccessRole('Some New Role'), 'some_new_role');
