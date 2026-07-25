export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { postToPusher } from '../_proxy';

export async function POST(req: NextRequest) {
  const body = await req.json();
  return postToPusher('/pusher/commit', body);
}
