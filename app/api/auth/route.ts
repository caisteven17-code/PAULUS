/**
 * Auth API Route — /api/auth
 *
 * POST   /api/auth   Login  → returns user profile (token stored in Supabase session)
 * DELETE /api/auth   Logout
 * GET    /api/auth   Verify token from Authorization header, return user
 */

import { NextRequest, NextResponse } from 'next/server';
import { authService } from '../../../src/microservices/auth.service';

// ── POST /api/auth — Login ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const result = await authService.login(email, password);
    if (!result) {
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
    }

    // Return the token so the client can store it (e.g. in localStorage / memory)
    return NextResponse.json({ token: result.token, user: result.user }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
}

// ── DELETE /api/auth — Logout ───────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  await authService.logout(token);
  return NextResponse.json({ ok: true });
}

// ── GET /api/auth — Get session user ───────────────────────────────────────
export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  if (!token) return NextResponse.json({ user: null }, { status: 200 });

  const user = await authService.getSession(token);
  return NextResponse.json({ user: user ?? null }, { status: 200 });
}
