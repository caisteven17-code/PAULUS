import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../src/lib/backend-proxy';

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type');
  if (type === 'parish') {
    return proxyToBackend(req, { path: '/entities/parishes', preserveQuery: false });
  } else if (type === 'school') {
    return proxyToBackend(req, { path: '/entities/schools', preserveQuery: false });
  } else if (type === 'seminary') {
    return proxyToBackend(req, { path: '/entities/seminaries', preserveQuery: false });
  } else {
    return proxyToBackend(req, { path: '/entities/all', preserveQuery: false });
  }
}
