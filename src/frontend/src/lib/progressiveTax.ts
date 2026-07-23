export type ProgressiveTaxSchemeStatus = 'draft' | 'published' | 'superseded';

export interface ProgressiveTaxBracket {
  id: string;
  ordinal: number;
  minimumAmount: number;
  maximumAmount: number;
  rate: number;
}

export interface ProgressiveTaxScheme {
  id: string;
  version: number;
  name: string;
  effectiveFrom: string;
  status: ProgressiveTaxSchemeStatus;
  publishedAt?: string | null;
  brackets: ProgressiveTaxBracket[];
}

export interface ProgressiveTaxCalculation {
  status: 'matched' | 'zero' | 'missing_scheme' | 'out_of_range';
  massCollectionTotal: number;
  taxRate: number;
  taxAmount: number;
  scheme: ProgressiveTaxScheme | null;
  bracket: ProgressiveTaxBracket | null;
}

export interface ProgressiveTaxInput {
  reportingYear: number;
  reportingMonth: number;
  weekdayCollections: number;
  sundayCollections: number;
  saturdayCollections: number;
  scheme?: ProgressiveTaxScheme | null;
}

function money(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, value) * 100) / 100;
}

export function calculateProgressiveTax({
  weekdayCollections,
  sundayCollections,
  saturdayCollections,
  scheme,
}: ProgressiveTaxInput): ProgressiveTaxCalculation {
  const massCollectionTotal = money(money(weekdayCollections) + money(sundayCollections) + money(saturdayCollections));

  if (!scheme || scheme.status !== 'published') {
    return {
      status: 'missing_scheme',
      massCollectionTotal,
      taxRate: 0,
      taxAmount: 0,
      scheme: scheme ?? null,
      bracket: null,
    };
  }

  if (massCollectionTotal === 0) {
    return {
      status: 'zero',
      massCollectionTotal,
      taxRate: 0,
      taxAmount: 0,
      scheme,
      bracket: null,
    };
  }

  const bracket =
    [...scheme.brackets]
      .sort((a, b) => a.ordinal - b.ordinal)
      .find(
        (candidate) =>
          massCollectionTotal >= money(candidate.minimumAmount) &&
          massCollectionTotal <= money(candidate.maximumAmount),
      ) ?? null;

  if (!bracket) {
    return {
      status: 'out_of_range',
      massCollectionTotal,
      taxRate: 0,
      taxAmount: 0,
      scheme,
      bracket: null,
    };
  }

  const taxRate = Math.max(0, bracket.rate);
  return {
    status: 'matched',
    massCollectionTotal,
    taxRate,
    taxAmount: Math.round(Math.round(massCollectionTotal * 100) * taxRate) / 100,
    scheme,
    bracket,
  };
}
