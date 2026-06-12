export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../../src/lib/backend-proxy';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(req, { path: `/announcements/${id}/pin`, method: 'POST', preserveQuery: false });
}
