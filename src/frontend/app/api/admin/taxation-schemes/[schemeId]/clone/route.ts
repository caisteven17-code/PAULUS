export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import {
  getTaxationScheme,
  requireTaxationCaller,
  taxationAdmin,
  TaxationApiError,
  taxationErrorResponse,
  throwTaxationMutationError,
} from '../../../../../../src/lib/server/taxationSchemes';

export async function POST(req: NextRequest, { params }: { params: Promise<{ schemeId: string }> }) {
  try {
    const caller = await requireTaxationCaller(req, 'manage_entities');
    const { schemeId } = await params;
    const body = (await req.json()) as { name?: string; effectiveMonth?: string };
    if (!/^\d{4}-\d{2}-01$/.test(body.effectiveMonth ?? '')) {
      throw new TaxationApiError('A first-of-month effective date is required.', 400);
    }

    const { data: newSchemeId, error } = await taxationAdmin.schema('diocese').rpc('clone_progressive_tax_scheme', {
      p_source_scheme_id: schemeId,
      p_name: body.name?.trim() || null,
      p_effective_month: body.effectiveMonth,
      p_actor_id: caller.profileId,
    });
    if (error || !newSchemeId) {
      throwTaxationMutationError(error, 'Could not clone the taxation scheme.');
    }
    return Response.json({ scheme: await getTaxationScheme(newSchemeId as string) }, { status: 201 });
  } catch (error) {
    return taxationErrorResponse(error);
  }
}
