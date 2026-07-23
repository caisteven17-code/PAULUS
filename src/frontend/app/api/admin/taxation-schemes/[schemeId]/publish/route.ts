export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import {
  getTaxationScheme,
  requireTaxationCaller,
  taxationAdmin,
  taxationErrorResponse,
} from '../../../../../../src/lib/server/taxationSchemes';

export async function POST(req: NextRequest, { params }: { params: Promise<{ schemeId: string }> }) {
  try {
    const caller = await requireTaxationCaller(req, 'manage_entities');
    const { schemeId } = await params;
    const { data, error } = await taxationAdmin.schema('diocese').rpc('publish_progressive_tax_scheme', {
      p_scheme_id: schemeId,
      p_actor_id: caller.profileId,
    });
    if (error || !data) throw new Error(error?.message ?? 'Could not publish the taxation scheme.');
    return Response.json({ scheme: await getTaxationScheme(schemeId) });
  } catch (error) {
    return taxationErrorResponse(error);
  }
}
