export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { postToPusher } from '../_proxy';

export async function POST(req: NextRequest) {
  const body = await req.json();
  return postToPusher('/pusher/canonical-account', body);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  return postToPusher('/pusher/canonical-account', body, 'PUT');
}

export async function DELETE(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('id');
  if (!accountId) {
    return Response.json({ error: 'Canonical account id is required.' }, { status: 400 });
  }
  return postToPusher(`/pusher/canonical-account/${encodeURIComponent(accountId)}`, {}, 'DELETE');
}
