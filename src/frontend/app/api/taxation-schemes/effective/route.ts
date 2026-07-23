export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import {
  getEffectiveTaxationScheme,
  requireTaxationCaller,
  taxationErrorResponse,
} from '../../../../src/lib/server/taxationSchemes';

export async function GET(req: NextRequest) {
  try {
    await requireTaxationCaller(req);
    const reportingYear = Number(req.nextUrl.searchParams.get('year'));
    const reportingMonth = Number(req.nextUrl.searchParams.get('month'));
    const scheme = await getEffectiveTaxationScheme(reportingYear, reportingMonth);
    if (!scheme) {
      return Response.json(
        { error: 'No published progressive taxation scheme covers this reporting month.' },
        { status: 404 },
      );
    }
    return Response.json({ scheme });
  } catch (error) {
    return taxationErrorResponse(error);
  }
}
