export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import {
  getTaxationScheme,
  requireTaxationCaller,
  taxationAdmin,
  TaxationApiError,
  taxationErrorResponse,
  throwTaxationMutationError,
} from '../../../../../src/lib/server/taxationSchemes';

type RouteContext = { params: Promise<{ schemeId: string }> };

type DraftBody = {
  name?: string;
  effectiveMonth?: string;
  brackets?: Array<{ maximumAmount?: number; rate?: number }>;
};

function validatedBrackets(body: DraftBody) {
  if (
    !body.name?.trim() ||
    !/^\d{4}-\d{2}-01$/.test(body.effectiveMonth ?? '') ||
    !Array.isArray(body.brackets) ||
    body.brackets.length === 0
  ) {
    throw new TaxationApiError('Name, effective month, and at least one bracket are required.', 400);
  }
  let minimumAmount = 1;
  return body.brackets.map((bracket, index) => {
    const maximumAmount = Number(bracket.maximumAmount);
    const rate = Math.round((Number(bracket.rate) + Number.EPSILON) * 10000) / 10000;
    if (!Number.isFinite(maximumAmount) || maximumAmount < minimumAmount) {
      throw new TaxationApiError(`Bracket ${index + 1} must end at or above ${minimumAmount.toFixed(2)}.`, 400);
    }
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1) {
      throw new TaxationApiError(`Bracket ${index + 1} has an invalid tax rate.`, 400);
    }
    minimumAmount = Math.round((maximumAmount + 0.01) * 100) / 100;
    return { maximumAmount, rate };
  });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const caller = await requireTaxationCaller(req, 'manage_entities');
    const { schemeId } = await params;
    const body = (await req.json()) as DraftBody;
    const brackets = validatedBrackets(body);
    const { data, error } = await taxationAdmin.schema('diocese').rpc('save_progressive_tax_draft', {
      p_scheme_id: schemeId,
      p_name: body.name?.trim() ?? '',
      p_effective_month: body.effectiveMonth ?? '',
      p_brackets: brackets,
      p_actor_id: caller.profileId,
    });
    if (error || !data) {
      throwTaxationMutationError(error, 'Could not update the taxation scheme draft.');
    }
    return Response.json({ scheme: await getTaxationScheme(schemeId) });
  } catch (error) {
    return taxationErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    await requireTaxationCaller(req, 'manage_entities');
    const { schemeId } = await params;
    const { data, error } = await taxationAdmin
      .schema('diocese')
      .from('progressive_tax_schemes')
      .delete()
      .eq('id', schemeId)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new TaxationApiError('Draft taxation scheme was not found.', 404);
    return new Response(null, { status: 204 });
  } catch (error) {
    return taxationErrorResponse(error);
  }
}
