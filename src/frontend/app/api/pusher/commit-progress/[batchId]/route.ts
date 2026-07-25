export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { getFromPusher } from '../../_proxy';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  return getFromPusher(`/pusher/commit-progress/${encodeURIComponent(batchId)}`);
}
