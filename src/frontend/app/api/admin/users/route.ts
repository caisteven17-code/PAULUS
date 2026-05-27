import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../src/lib/backend-proxy';

export async function GET(req: NextRequest) {
  return proxyToBackend(req, { path: '/admin/users' });
}

export async function POST(req: NextRequest) {
  return proxyToBackend(req, { path: '/admin/users' });
}

export async function PATCH(req: NextRequest) {
  return proxyToBackend(req, { path: '/admin/users' });
}

export async function DELETE(req: NextRequest) {
  return proxyToBackend(req, { path: '/admin/users' });
}
