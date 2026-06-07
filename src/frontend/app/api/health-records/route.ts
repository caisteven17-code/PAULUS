export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../../../src/lib/backend-proxy';

export async function GET(req: NextRequest) {
  return proxyToBackend(req, { path: '/entities/health-records', preserveQuery: false });
}

export async function POST(req: NextRequest) {
  return proxyToBackend(req, { path: '/entities/health-records', preserveQuery: false });
}
