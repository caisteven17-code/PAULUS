/**
 * Auth Service — delegates authentication to Supabase Auth.
 *
 * Login  → supabase.auth.signInWithPassword()
 * Logout → supabase.auth.signOut()
 * Session → supabase.auth.getUser(token)
 *
 * User accounts must be created in the Supabase Dashboard:
 *   Authentication → Users → Invite / Add user
 *
 * Recommended test accounts (create these in Supabase):
 *   bishop@diocese-sanpablo.ph    role: bishop
 *   admin@diocese-sanpablo.ph     role: admin
 *   priest@diocese-sanpablo.ph    role: parish_priest
 *   school@diocese-sanpablo.ph    role: school
 *   seminary@diocese-sanpablo.ph  role: seminary
 *
 * Set user metadata in Supabase → Auth → Users → Edit user:
 *   { "role": "bishop", "entityId": "...", "entityName": "...", "entityType": "..." }
 */

import type { AppRole } from '../lib/access';
import { supabaseBrowser, supabaseServer } from '../lib/supabase';

export interface AuthUser {
  id: string;
  email: string;
  role: AppRole;
  entityId?: string;
  entityName?: string;
  entityType?: string;
  displayName?: string;
}

function mapSupabaseUser(supabaseUser: any): AuthUser {
  const meta = supabaseUser.user_metadata ?? supabaseUser.raw_user_meta_data ?? {};
  return {
    id:          supabaseUser.id,
    email:       supabaseUser.email ?? '',
    role:        (meta.role ?? 'bishop') as AppRole,
    entityId:    meta.entityId    ?? meta.entity_id    ?? undefined,
    entityName:  meta.entityName  ?? meta.entity_name  ?? undefined,
    entityType:  meta.entityType  ?? meta.entity_type  ?? undefined,
    displayName: meta.displayName ?? meta.display_name ?? supabaseUser.email ?? '',
  };
}

export const authService = {
  /**
   * Sign in with email + password via Supabase Auth.
   * Returns the access token (JWT) and user profile, or null on failure.
   */
  async login(email: string, password: string): Promise<{ token: string; user: AuthUser } | null> {
    const { data, error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    if (error || !data.session) return null;
    return {
      token: data.session.access_token,
      user:  mapSupabaseUser(data.user),
    };
  },

  /**
   * Sign out the current session.
   */
  async logout(token: string): Promise<void> {
    // Create a temporary client with the user's token to sign out correctly
    const { error } = await supabaseBrowser.auth.signOut();
    if (error) console.error('[auth.service] logout:', error.message);
  },

  /**
   * Verify a JWT access token server-side and return the associated user.
   */
  async getSession(token: string): Promise<AuthUser | null> {
    const { data, error } = await supabaseServer.auth.getUser(token);
    if (error || !data.user) return null;
    return mapSupabaseUser(data.user);
  },
};
