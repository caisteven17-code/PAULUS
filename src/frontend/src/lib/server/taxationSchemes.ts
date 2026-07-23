import 'server-only';

import { NextRequest } from 'next/server';
import { supabaseServer } from '../supabase';

type SchemeRow = {
  id: string;
  version: number;
  name: string;
  effective_month: string;
  status: 'draft' | 'published' | 'superseded';
  created_by: string | null;
  published_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type BracketRow = {
  id: string;
  scheme_id: string;
  position: number;
  minimum_amount: number | string;
  maximum_amount: number | string;
  rate: number | string;
};

export type TaxationSchemeDto = {
  id: string;
  version: number;
  name: string;
  effectiveFrom: string;
  status: 'draft' | 'published' | 'superseded';
  createdBy: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  brackets: Array<{
    id: string;
    ordinal: number;
    minimumAmount: number;
    maximumAmount: number;
    rate: number;
  }>;
};

export class TaxationApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function requireTaxationCaller(req: NextRequest, permission?: 'manage_entities') {
  const token = req.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim();
  if (!token || token.startsWith('demo-')) {
    throw new TaxationApiError('Authentication is required.', 401);
  }

  const { data: authData, error: authError } = await supabaseServer.auth.getUser(token);
  if (authError || !authData.user) {
    throw new TaxationApiError('The authentication session is invalid or expired.', 401);
  }

  let profileResult = await supabaseServer
    .schema('diocese')
    .from('profiles')
    .select('id, role_id, is_active, deleted_at')
    .eq('external_auth_id', authData.user.id)
    .maybeSingle();

  if (!profileResult.data) {
    profileResult = await supabaseServer
      .schema('diocese')
      .from('profiles')
      .select('id, role_id, is_active, deleted_at')
      .eq('id', authData.user.id)
      .maybeSingle();
  }

  const profile = profileResult.data;
  if (profileResult.error || !profile || !profile.is_active || profile.deleted_at) {
    throw new TaxationApiError('An active diocesan profile is required.', 403);
  }

  if (permission) {
    const { data: rolePermission, error: permissionError } = await supabaseServer
      .schema('diocese')
      .from('role_permissions')
      .select('permission_id')
      .eq('role_id', profile.role_id)
      .eq('permission_id', permission)
      .eq('granted', true)
      .is('deleted_at', null)
      .maybeSingle();

    if (permissionError || !rolePermission) {
      throw new TaxationApiError(`Permission "${permission}" is required.`, 403);
    }
  }

  return { profileId: profile.id as string, roleId: profile.role_id as string };
}

function mapScheme(row: SchemeRow, brackets: BracketRow[]): TaxationSchemeDto {
  return {
    id: row.id,
    version: Number(row.version),
    name: row.name,
    effectiveFrom: row.effective_month,
    status: row.status,
    createdBy: row.created_by,
    publishedBy: row.published_by,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    brackets: brackets
      .filter((bracket) => bracket.scheme_id === row.id)
      .sort((left, right) => Number(left.position) - Number(right.position))
      .map((bracket) => ({
        id: bracket.id,
        ordinal: Number(bracket.position),
        minimumAmount: Number(bracket.minimum_amount),
        maximumAmount: Number(bracket.maximum_amount),
        rate: Number(bracket.rate),
      })),
  };
}

async function attachBrackets(rows: SchemeRow[]): Promise<TaxationSchemeDto[]> {
  if (rows.length === 0) return [];

  const { data: brackets, error } = await supabaseServer
    .schema('diocese')
    .from('progressive_tax_brackets')
    .select('id, scheme_id, position, minimum_amount, maximum_amount, rate')
    .in(
      'scheme_id',
      rows.map((row) => row.id),
    )
    .order('position', { ascending: true });
  if (error) throw new TaxationApiError(error.message, 500);

  return rows.map((row) => mapScheme(row, (brackets ?? []) as BracketRow[]));
}

export async function listTaxationSchemes(): Promise<TaxationSchemeDto[]> {
  const { data, error } = await supabaseServer
    .schema('diocese')
    .from('progressive_tax_schemes')
    .select('*')
    .order('effective_month', { ascending: false })
    .order('version', { ascending: false });
  if (error) throw new TaxationApiError(error.message, 500);
  return attachBrackets((data ?? []) as SchemeRow[]);
}

export async function getTaxationScheme(schemeId: string): Promise<TaxationSchemeDto | null> {
  const { data, error } = await supabaseServer
    .schema('diocese')
    .from('progressive_tax_schemes')
    .select('*')
    .eq('id', schemeId)
    .maybeSingle();
  if (error) throw new TaxationApiError(error.message, 500);
  if (!data) return null;
  return (await attachBrackets([data as SchemeRow]))[0] ?? null;
}

export async function getEffectiveTaxationScheme(
  reportingYear: number,
  reportingMonth: number,
): Promise<TaxationSchemeDto | null> {
  if (
    !Number.isInteger(reportingYear) ||
    reportingYear < 2000 ||
    reportingYear > 2100 ||
    !Number.isInteger(reportingMonth) ||
    reportingMonth < 1 ||
    reportingMonth > 12
  ) {
    throw new TaxationApiError('A valid reporting year and month are required.', 400);
  }

  const reportingDate = `${reportingYear}-${String(reportingMonth).padStart(2, '0')}-01`;
  const { data, error } = await supabaseServer
    .schema('diocese')
    .from('progressive_tax_schemes')
    .select('*')
    .eq('status', 'published')
    .lte('effective_month', reportingDate)
    .order('effective_month', { ascending: false })
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new TaxationApiError(error.message, 500);
  if (!data) return null;
  return (await attachBrackets([data as SchemeRow]))[0] ?? null;
}

export async function ensureTaxationPeriodAvailable(effectiveMonth: string) {
  const { data, error } = await supabaseServer
    .schema('diocese')
    .from('progressive_tax_schemes')
    .select('id')
    .eq('effective_month', effectiveMonth)
    .in('status', ['draft', 'published'])
    .limit(1);
  if (error) throw new TaxationApiError(error.message, 500);
  if ((data ?? []).length > 0) {
    throw new TaxationApiError(
      'A taxation scheme already exists for that effective year or month. Edit the published scheme or choose another effective period.',
      409,
    );
  }
}

export function taxationErrorResponse(error: unknown) {
  if (error instanceof TaxationApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Unexpected taxation scheme error.';
  console.error('[taxation-schemes]', message);
  return Response.json({ error: message }, { status: 500 });
}

export function throwTaxationMutationError(
  error: { code?: string | null; message?: string | null } | null,
  fallback: string,
): never {
  if (
    error?.code === '23505' ||
    error?.message?.includes('progressive_tax_schemes_effective_month_key') ||
    error?.message?.includes('uq_progressive_tax_schemes')
  ) {
    throw new TaxationApiError(
      'A taxation scheme already exists for that effective year or month. Edit the published scheme or choose another effective period.',
      409,
    );
  }
  throw new TaxationApiError(error?.message ?? fallback, 500);
}

export { supabaseServer as taxationAdmin };
