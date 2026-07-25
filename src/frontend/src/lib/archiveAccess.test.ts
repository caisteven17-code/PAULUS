import assert from 'node:assert/strict';
import { getArchiveAccess, hasAnyArchiveAccess } from './archiveAccess';

// Explicit deny wins even when the manage prerequisite is granted.
assert.equal(getArchiveAccess({ manage_entities: true, archive_entities: false }).entities, false);

// No explicit archive key (role predates archive permissions) => legacy default of "managers can access".
assert.equal(getArchiveAccess({ manage_events: true }).events, true);

// No manage prerequisite => archive is never reachable, regardless of the explicit key.
assert.equal(getArchiveAccess({ archive_users: true }).users, false);

// Manage + explicit allow => access granted.
assert.equal(getArchiveAccess({ manage_projects: true, archive_projects: true }).projects, true);

// Default (no permissions at all) => every feature denied.
const none = getArchiveAccess();
assert.deepEqual(none, { users: false, entities: false, events: false, announcements: false, projects: false });

// hasAnyArchiveAccess is true if at least one feature resolves true.
assert.equal(hasAnyArchiveAccess({ manage_announcements: true }), true);
assert.equal(hasAnyArchiveAccess({}), false);
assert.equal(hasAnyArchiveAccess({ create_users: true, archive_users: false }), false);
