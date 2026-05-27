import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../src/lib/backend-proxy';

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get('all');
  if (all === 'true') {
    return proxyToBackend(req, { path: '/financial/records/all', preserveQuery: false });
  }
  return proxyToBackend(req, { path: '/financial/records' });
}

export async function POST(req: NextRequest) {
  return proxyToBackend(req, { path: '/financial/records' });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return new Response(JSON.stringify({ error: 'id is required.' }), { status: 400 });
  }
  return proxyToBackend(req, { path: `/financial/records/${id}`, method: 'DELETE', preserveQuery: false });
}
