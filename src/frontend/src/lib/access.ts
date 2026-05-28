import { INITIAL_ROLES } from '../constants';

export type AppRole = 'bishop' | 'admin' | 'parish_priest' | 'parish_secretary' | 'school' | 'seminary';

export type AccessRole =
  | 'bishop'
  | 'chancellor'
  | 'diocesan_oeconomus'
  | 'finance_staff'
  | 'parish_priest'
  | 'parish_secretary'
  | 'seminary_rector'
  | 'seminary_oeconomus'
  | 'school_superintendent'
  | 'finance_supervisor'
  | 'finance_officer'
  | 'school_principal';

export const ACCESS_ROLE_TO_APP_ROLE: Record<AccessRole, AppRole> = {
  bishop: 'bishop',
  chancellor: 'bishop',
  diocesan_oeconomus: 'admin',
  finance_staff: 'admin',
  parish_priest: 'parish_priest',
  parish_secretary: 'parish_secretary',
  seminary_rector: 'seminary',
  seminary_oeconomus: 'seminary',
  school_superintendent: 'admin',
  finance_supervisor: 'school',
  finance_officer: 'school',
  school_principal: 'school',
};

const roleNameToId = new Map(
  INITIAL_ROLES.map((role) => [role.name.toLowerCase(), role.id as AccessRole])
);

const legacyRoleToAccessRole: Record<string, AccessRole> = {
  bishop: 'bishop',
  chancellor: 'chancellor',
  diocesan_oeconomus: 'diocesan_oeconomus',
  finance_staff: 'finance_staff',
  parish_priest: 'parish_priest',
  parish_secretary: 'parish_secretary',
  seminary_rector: 'seminary_rector',
  seminary_oeconomus: 'seminary_oeconomus',
  school_superintendent: 'school_superintendent',
  finance_supervisor: 'finance_supervisor',
  finance_officer: 'finance_officer',
  school_principal: 'school_principal',
  
  // Legacy aliases
  admin: 'diocesan_oeconomus',
  diocese_admin: 'diocesan_oeconomus',
  priest: 'parish_priest',
  school: 'school_principal',
  seminary: 'seminary_rector',
  school_registrar: 'school_principal',
};

export function normalizeAccessRole(role?: string): string {
  if (!role) return 'parish_priest';

  const normalized = role.trim().toLowerCase().replace(/\s+/g, '_');
  const displayNameMatch = roleNameToId.get(role.trim().toLowerCase());

  return displayNameMatch || legacyRoleToAccessRole[normalized] || normalized;
}

export function getAppRole(role?: string): AppRole {
  const accessRole = normalizeAccessRole(role);
  const predefined = ACCESS_ROLE_TO_APP_ROLE[accessRole as AccessRole];
  if (predefined) return predefined;

  // Dynamic custom role lookup based on active viewing permissions
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('diocese_roles');
      if (stored) {
        const rolesList = JSON.parse(stored);
        const match = rolesList.find((r: any) => r.id === accessRole);
        if (match && match.permissions) {
          if (match.permissions.view_diocese) return 'bishop';
          if (match.permissions.view_parish) return 'parish_priest';
          if (match.permissions.view_seminary) return 'seminary';
          if (match.permissions.view_school || match.permissions.view_school_cluster || match.permissions.view_school_all) return 'school';
        }
      }
    } catch (e) {
      console.error('Error resolving custom AppRole:', e);
    }
  }

  return 'parish_priest';
}

export function getAccessRoleLabel(role?: string) {
  const accessRole = normalizeAccessRole(role);
  const matchedPredefined = INITIAL_ROLES.find((item) => item.id === accessRole);
  if (matchedPredefined) return matchedPredefined.name;

  // For custom roles, retrieve the display name from localStorage roles
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('diocese_roles');
      if (stored) {
        const rolesList = JSON.parse(stored);
        const match = rolesList.find((r: any) => r.id === accessRole);
        if (match && match.name) return match.name;
      }
    } catch {}
  }

  // Capitalize the first letter of custom role ID as a fallback label
  return accessRole.charAt(0).toUpperCase() + accessRole.slice(1).replace(/_/g, ' ');
}
