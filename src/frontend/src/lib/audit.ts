'use client';

import type { AuthUser } from '../firebase';

type AuditSeverity = 'info' | 'warning' | 'error' | 'success';
type AuditCategory =
  | 'auth'
  | 'users'
  | 'projects'
  | 'finance'
  | 'data'
  | 'events'
  | 'announcements'
  | 'calendar'
  | 'analytics'
  | 'system';

type AuditEvent = {
  userId?: string;
  userName?: string;
  userRole?: string;
  category: AuditCategory;
  severity: AuditSeverity;
  action: string;
  detail: string;
  entity?: string;
  metadata?: Record<string, unknown>;
};

export function auditUserFromStorage(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('currentUser') || 'null');
  } catch {
    return null;
  }
}

export function auditIdentity(user: AuthUser | null | undefined) {
  return {
    userId: user?.id ?? user?.uid,
    userName: user?.displayName ?? user?.name ?? user?.email ?? 'Unknown',
    userRole: user?.roleId ?? user?.accessRole ?? user?.role ?? 'Unknown',
  };
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const storedUser = auditUserFromStorage();
    const metadata = {
      email: storedUser?.email,
      role: storedUser?.roleId ?? storedUser?.accessRole ?? storedUser?.role,
      entityId: storedUser?.entityId,
      entityName: storedUser?.entityName,
      entityType: storedUser?.entityType,
      ...event.metadata,
    };

    await fetch('/api/audit-log', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...event,
        entity: event.entity ?? storedUser?.entityName,
        metadata,
      }),
    });
  } catch {
    // Auditing should not block the user action if the backend is offline.
  }
}
