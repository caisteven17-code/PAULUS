export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import {
  ensureTaxationPeriodAvailable,
  getTaxationScheme,
  listTaxationSchemes,
  requireTaxationCaller,
  taxationAdmin,
  TaxationApiError,
  taxationErrorResponse,
  throwTaxationMutationError,
} from '../../../../src/lib/server/taxationSchemes';

type DraftBody = {
  name?: string;
  effectiveMonth?: string;
  brackets?: Array<{ maximumAmount?: number; rate?: number }>;
};

function validateDraftBody(body: DraftBody) {
  if (
    !body.name?.trim() ||
    !/^\d{4}-\d{2}-01$/.test(body.effectiveMonth ?? '') ||
    !Array.isArray(body.brackets) ||
    body.brackets.length === 0
  ) {
    throw new TaxationApiError('Name, effective month, and at least one bracket are required.', 400);
  }
  let minimumAmount = 1;
  const brackets = body.brackets.map((bracket, index) => {
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
  return {
    name: body.name.trim(),
    effectiveMonth: body.effectiveMonth as string,
    brackets,
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireTaxationCaller(req, 'manage_entities');
    return Response.json({ schemes: await listTaxationSchemes() });
  } catch (error) {
    return taxationErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireTaxationCaller(req, 'manage_entities');
    const draft = validateDraftBody((await req.json()) as DraftBody);
    await ensureTaxationPeriodAvailable(draft.effectiveMonth);
    const { data: schemeId, error } = await taxationAdmin.schema('diocese').rpc('save_progressive_tax_draft', {
      p_scheme_id: null,
      p_name: draft.name,
      p_effective_month: draft.effectiveMonth,
      p_brackets: draft.brackets,
      p_actor_id: caller.profileId,
    });
    if (error || !schemeId) {
      throwTaxationMutationError(error, 'Could not create the taxation scheme draft.');
    }
    return Response.json({ scheme: await getTaxationScheme(schemeId as string) }, { status: 201 });
  } catch (error) {
    return taxationErrorResponse(error);
  }
}
