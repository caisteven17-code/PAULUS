'use client';

import { useState, useEffect, useMemo } from 'react';
import { auth, useAuth, AuthUser } from '../firebase';
import { INITIAL_ROLES } from '../constants';
import { normalizeAccessRole } from '../lib/access';

export function usePermissions() {
  const { user, loading: authLoading } = useAuth();
  const [customRoles, setCustomRoles] = useState<any[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => {
    const loadRoles = async () => {
      try {
        const res = await fetch('/api/admin/roles');
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (Array.isArray(data)) setCustomRoles(data);
      } catch {
        const stored = localStorage.getItem('diocese_roles');
        if (stored) setCustomRoles(JSON.parse(stored));
      } finally {
        setRolesLoading(false);
      }
    };
    loadRoles();
  }, []);

  const permissions = useMemo(() => {
    // Resolve exact role ID for custom or predefined mapping
    const userRole = user?.role || auth.currentUser?.role || 'bishop';
    const normalizedRole = normalizeAccessRole(userRole);

    // 1. Look in custom roles list
    let matchingRole = customRoles.find((r) => r.id === normalizedRole);

    // 2. Fall back to predefined roles list
    if (!matchingRole) {
      matchingRole = INITIAL_ROLES.find((r) => r.id === normalizedRole);
    }

    if (matchingRole) {
      return matchingRole.permissions || {};
    }

    // 3. Fallback default permission maps if role isn't recognized
    const hasDioceseAccess = normalizedRole === 'bishop' || normalizedRole === 'admin';
    return {
      view_diocese: hasDioceseAccess,
      view_parish: hasDioceseAccess || normalizedRole === 'priest' || normalizedRole === 'parish_priest' || normalizedRole === 'parish_secretary',
      view_seminary: hasDioceseAccess || normalizedRole === 'seminary' || normalizedRole === 'seminary_rector' || normalizedRole === 'seminary_oeconomus',
      view_school: hasDioceseAccess || normalizedRole === 'school' || normalizedRole === 'school_superintendent' || normalizedRole === 'finance_supervisor' || normalizedRole === 'finance_officer' || normalizedRole === 'school_principal',
      view_projects: hasDioceseAccess,
      view_parish_dashboard: hasDioceseAccess || normalizedRole === 'priest' || normalizedRole === 'parish_priest' || normalizedRole === 'parish_secretary',
      view_seminary_dashboard: hasDioceseAccess || normalizedRole === 'seminary' || normalizedRole === 'seminary_rector' || normalizedRole === 'seminary_oeconomus',
      view_school_dashboard: hasDioceseAccess || normalizedRole === 'school' || normalizedRole === 'school_superintendent' || normalizedRole === 'finance_supervisor' || normalizedRole === 'finance_officer' || normalizedRole === 'school_principal',
    };
  }, [customRoles, user]);

  return {
    permissions,
    user,
    loading: authLoading || rolesLoading,
  };
}
