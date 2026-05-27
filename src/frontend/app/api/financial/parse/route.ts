import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../src/lib/backend-proxy';

export async function POST(req: NextRequest) {
  return proxyToBackend(req, { path: '/financial/parse' });
}
