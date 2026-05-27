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

export function normalizeAccessRole(role?: string): AccessRole {
  if (!role) return 'parish_priest';

  const normalized = role.trim().toLowerCase().replace(/\s+/g, '_');
  const displayNameMatch = roleNameToId.get(role.trim().toLowerCase());

  return displayNameMatch || legacyRoleToAccessRole[normalized] || 'parish_priest';
}

export function getAppRole(role?: string): AppRole {
  return ACCESS_ROLE_TO_APP_ROLE[normalizeAccessRole(role)];
}

export function getAccessRoleLabel(role?: string) {
  const accessRole = normalizeAccessRole(role);
  return INITIAL_ROLES.find((item) => item.id === accessRole)?.name || 'Parish Priest';
}
