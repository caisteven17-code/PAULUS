/**
 * Archive access resolution.
 *
 * A role may only reach a feature's archive when it can *manage* that feature.
 * The explicit `archive_<feature>` permission (configured in User Role Control)
 * is the switch; the `manage_<feature>` permission is the prerequisite that
 * unlocks the switch. Roles created before archive permissions existed fall
 * back to "managers can access archives" so nothing silently disappears.
 */

export type ArchiveFeature = 'users' | 'entities' | 'events' | 'announcements' | 'projects';

export interface ArchiveAccess {
  users: boolean;
  entities: boolean;
  events: boolean;
  announcements: boolean;
  projects: boolean;
}

/** The manage-permission that gates each archive feature. */
export const ARCHIVE_PREREQUISITE: Record<ArchiveFeature, string> = {
  users: 'create_users',
  entities: 'manage_entities',
  events: 'manage_events',
  announcements: 'manage_announcements',
  projects: 'manage_projects',
};

/** The stored permission key that toggles each archive feature. */
export const ARCHIVE_PERMISSION: Record<ArchiveFeature, string> = {
  users: 'archive_users',
  entities: 'archive_entities',
  events: 'archive_events',
  announcements: 'archive_announcements',
  projects: 'archive_projects',
};

function resolve(p: Record<string, any>, feature: ArchiveFeature): boolean {
  const manageOk = p[ARCHIVE_PREREQUISITE[feature]] === true;
  if (!manageOk) return false; // never reachable without the manage prerequisite
  const explicit = p[ARCHIVE_PERMISSION[feature]];
  // If the role predates archive permissions, default managers to "allowed".
  return typeof explicit === 'boolean' ? explicit : true;
}

export function getArchiveAccess(permissions: Record<string, any> = {}): ArchiveAccess {
  return {
    users: resolve(permissions, 'users'),
    entities: resolve(permissions, 'entities'),
    events: resolve(permissions, 'events'),
    announcements: resolve(permissions, 'announcements'),
    projects: resolve(permissions, 'projects'),
  };
}

/** True when the role can reach at least one archive — used to show the nav item. */
export function hasAnyArchiveAccess(permissions: Record<string, any> = {}): boolean {
  const a = getArchiveAccess(permissions);
  return a.users || a.entities || a.events || a.announcements || a.projects;
}
