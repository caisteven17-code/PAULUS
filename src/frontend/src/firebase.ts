'use client';

/**
 * Auth layer for the Diocese of San Pablo Financial System.
 *
 * Tries Supabase Auth first; falls back to localStorage-based demo session
 * so offline / prototype demos still work without a live Supabase project.
 *
 * Supabase users are created in:
 *   Supabase Dashboard → Authentication → Users → Add user
 * Each user needs user_metadata:
 *   { "role": "bishop", "entityId": "...", "entityName": "...", "entityType": "..." }
 */

import { useState, useEffect } from 'react';
import { supabaseBrowser } from './lib/supabase';
import type { AppRole } from './lib/access';
import { auditIdentity, logAuditEvent } from './lib/audit';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id?: string;
  uid?: string;
  email?: string;
  role?: AppRole;
  accessRole?: string;
  roleId?: string;
  entityName?: string;
  entityType?: string;
  entityId?: string;
  displayName?: string;
  name?: string;
  status?: string;
  firstName?: string;
  lastName?: string;
  nickName?: string;
  contactNumber?: string;
  address?: string;
  position?: string;
  roleLabel?: string;
  emergencyContact?: string;
  notes?: string;
  birthday?: string;
  avatarUrl?: string;
  photoURL?: string;
}

type AuthStateCallback = (user: AuthUser | null) => void;
type Unsubscriber = () => void;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSupabaseUser(supabaseUser: any): AuthUser {
  const meta = supabaseUser.user_metadata ?? supabaseUser.raw_user_meta_data ?? {};

  // Keep a just-uploaded avatar if it isn't in the auth metadata yet.
  let priorAvatar: string | undefined;
  try {
    const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    priorAvatar = prev?.avatarUrl || prev?.photoURL || undefined;
  } catch {
    /* ignore */
  }
  const avatarUrl = meta.avatarUrl ?? meta.avatar_url ?? priorAvatar ?? undefined;

  return {
    id: supabaseUser.id,
    uid: supabaseUser.id,
    email: supabaseUser.email ?? '',
    role: (meta.role as AppRole) ?? 'bishop',
    accessRole: meta.role,
    roleId: meta.role,
    entityId: meta.entityId ?? meta.entity_id ?? undefined,
    entityName: meta.entityName ?? meta.entity_name ?? undefined,
    entityType: meta.entityType ?? meta.entity_type ?? undefined,
    displayName: meta.displayName ?? meta.display_name ?? supabaseUser.email ?? '',
    birthday: meta.birthday ?? meta.birth_date ?? undefined,
    avatarUrl,
    photoURL: avatarUrl,
    status: 'active',
  };
}

const STORAGE_KEY = 'currentUser';

// ─── Mock DB (kept for Settings → User Management which still uses localStorage) ──
export const db = {
  collection: () => ({}),
  doc: () => ({}),
};

// ─── Auth object ──────────────────────────────────────────────────────────────
export const auth = {
  get currentUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  },

  onAuthStateChanged: (callback: AuthStateCallback): Unsubscriber => {
    if (typeof window === 'undefined') {
      callback(null);
      return () => {};
    }

    // ── 1. Check for live Supabase session first ──────────────────────────────
    supabaseBrowser.auth
      .getSession()
      .then(({ data }) => {
        if (data.session?.user) {
          const user = mapSupabaseUser(data.session.user);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
          callback(user);
          return;
        }
        // ── 2. Fall back to localStorage demo session ─────────────────────────
        const stored = localStorage.getItem(STORAGE_KEY);
        callback(stored ? (JSON.parse(stored) as AuthUser) : null);
      })
      .catch(() => {
        // Supabase unreachable — use localStorage fallback silently
        const stored = localStorage.getItem(STORAGE_KEY);
        callback(stored ? (JSON.parse(stored) as AuthUser) : null);
      });

    // ── 3. Subscribe to real-time Supabase auth changes ──────────────────────
    const {
      data: { subscription },
    } = supabaseBrowser.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const user = mapSupabaseUser(session.user);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        callback(user);
      } else if (_event === 'SIGNED_OUT') {
        localStorage.removeItem(STORAGE_KEY);
        callback(null);
      }
    });

    return () => subscription.unsubscribe();
  },

  signOut: async (options?: { skipAudit?: boolean }): Promise<void> => {
    const currentUser = auth.currentUser;
    if (options?.skipAudit !== true) {
      await logAuditEvent({
        ...auditIdentity(currentUser),
        category: 'auth',
        severity: 'info',
        action: 'Logout',
        detail: `${currentUser?.displayName || currentUser?.email || 'User'} signed out`,
      });
    }
    localStorage.removeItem(STORAGE_KEY);
    // Sign out of Supabase (ignore errors — may not have a live session)
    await supabaseBrowser.auth.signOut().catch(() => {});
  },
};

// ─── useAuth hook ─────────────────────────────────────────────────────────────
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((authUser) => {
      setUser(authUser);
      setLoading(false);
    });
    return () => unsubscribe?.();
  }, []);

  return { user, loading };
}
