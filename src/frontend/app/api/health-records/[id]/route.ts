export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../src/lib/backend-proxy';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return proxyToBackend(req, { path: `/entities/health-records/${params.id}`, preserveQuery: false });
}
