export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../../src/lib/backend-proxy';

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyToBackend(req, { path: `/analytics/diagnostic/${path.join('/')}` });
}
