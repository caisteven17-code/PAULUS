/**
 * Supabase clients
 *
 * Two separate clients:
 *  - `supabaseBrowser`  — uses the anon key; safe to import in Client Components.
 *                         Subject to Row Level Security policies.
 *  - `supabaseServer`   — uses the service-role key; SERVER SIDE ONLY.
 *                         Bypasses RLS — never import this in browser/client code.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn(
    'Warning: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not supplied. Using placeholders for build-time resolution.',
  );
}

// ─── Browser / client-side ─────────────────────────────────────────────────
// Safe to use in React components and the API client (src/lib/api-client.ts).
export const supabaseBrowser = createClient(url, anon);

// ─── Server / service-role ─────────────────────────────────────────────────
// Use ONLY inside app/api/ route handlers (server-side Next.js).
// The service-role key bypasses RLS — treat it like a root database password.
export const supabaseServer = createClient(url, serviceRole ?? anon, {
  auth: { persistSession: false },
});
