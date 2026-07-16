export const dynamic = 'force-dynamic';

import { getFromPusher } from '../_proxy';

export async function GET() {
  return getFromPusher('/pusher/accounts');
}
