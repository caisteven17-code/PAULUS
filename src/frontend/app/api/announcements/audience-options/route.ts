export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../src/lib/backend-proxy';

export async function GET(req: NextRequest) {
  return proxyToBackend(req, { path: '/announcements/audience-options', preserveQuery: false });
}
