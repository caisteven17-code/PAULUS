export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { getFromPusher } from '../../_proxy';

export async function GET(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const status = req.nextUrl.searchParams.get('status');
  const limit = req.nextUrl.searchParams.get('limit');
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (limit) query.set('limit', limit);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return getFromPusher(`/pusher/batch-rows/${encodeURIComponent(batchId)}${suffix}`);
}
