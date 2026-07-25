export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../../src/lib/backend-proxy';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(req, { path: `/scenarios/institution/${id}` });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(req, { path: `/scenarios/institution/${id}`, method: 'DELETE', preserveQuery: false });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const action = req.nextUrl.searchParams.get('action');
  if (action === 'archive') {
    return proxyToBackend(req, { path: `/scenarios/institution/${id}/archive`, method: 'PATCH', preserveQuery: false });
  }
  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
}
