'use client';

import React from 'react';
import {
  AlertCircle,
  Calculator,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  FilePlus2,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { getApiRequestHeaders } from '../../lib/api-client';
import { calculateProgressiveTax } from '../../lib/progressiveTax';

type SchemeStatus = 'draft' | 'published' | 'superseded';

interface TaxBracket {
  id?: string;
  ordinal: number;
  minimumAmount: number;
  maximumAmount: number;
  rate: number;
}

interface TaxScheme {
  id: string;
  version: number;
  name: string;
  effectiveFrom: string;
  status: SchemeStatus;
  publishedAt?: string | null;
  createdAt?: string | null;
  brackets: TaxBracket[];
}

interface EditableBracket {
  id: string;
  maximumAmount: string;
  ratePercent: string;
}

interface DraftEditor {
  name: string;
  effectiveMode: 'year' | 'month';
  effectiveFrom: string;
  firstMinimum: number;
  brackets: EditableBracket[];
}

type EditorMode = 'existing' | 'create' | 'clone' | 'revision';

const API_PATH = '/api/admin/taxation-schemes';
const CENTAVO = 0.01;
const INITIAL_BRACKETS = [
  { maximumAmount: 25000, rate: 0.125 },
  { maximumAmount: 50000, rate: 0.15 },
  { maximumAmount: 80000, rate: 0.175 },
  { maximumAmount: 100000, rate: 0.2 },
  { maximumAmount: 120000, rate: 0.215 },
  { maximumAmount: 125000, rate: 0.225 },
  { maximumAmount: 150000, rate: 0.24 },
  { maximumAmount: 1000000, rate: 0.25 },
];

const moneyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
});

const monthFormatter = new Intl.DateTimeFormat('en-PH', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const monthValue = (value?: string | null) => {
  if (!value) return '';
  return value.slice(0, 7);
};

const currentMonth = () => new Date().toISOString().slice(0, 7);
const currentYear = () => new Date().getFullYear().toString();

const effectiveModeFromValue = (value?: string | null): DraftEditor['effectiveMode'] =>
  monthValue(value).endsWith('-01') ? 'year' : 'month';

const displayMonth = (value: string) => {
  const normalized = monthValue(value);
  if (!normalized) return 'Not scheduled';
  return monthFormatter.format(new Date(`${normalized}-01T00:00:00Z`));
};

const displayEffectivePeriod = (scheme: TaxScheme) =>
  effectiveModeFromValue(scheme.effectiveFrom) === 'year'
    ? `Effective ${scheme.effectiveFrom.slice(0, 4)}`
    : `Effective ${displayMonth(scheme.effectiveFrom)}`;

const nextAvailableAnnualYear = (schemes: TaxScheme[]) => {
  const usedJanuaryDates = new Set(
    schemes.map((scheme) => monthValue(scheme.effectiveFrom)).filter((value) => value.endsWith('-01')),
  );
  let year = Number(currentYear());
  while (usedJanuaryDates.has(`${year}-01`)) year += 1;
  return String(year);
};

const normalizeBracket = (raw: any, index: number): TaxBracket => ({
  id: raw?.id ? String(raw.id) : undefined,
  ordinal: asNumber(raw?.ordinal ?? raw?.position ?? raw?.sort_order ?? raw?.sortOrder, index + 1),
  minimumAmount: asNumber(raw?.minimumAmount ?? raw?.minimum_amount ?? raw?.minAmount ?? raw?.min_amount),
  maximumAmount: asNumber(raw?.maximumAmount ?? raw?.maximum_amount ?? raw?.maxAmount ?? raw?.max_amount),
  rate: asNumber(raw?.rate ?? raw?.tax_rate ?? raw?.taxRate),
});

const normalizeScheme = (raw: any): TaxScheme => {
  const bracketSource = raw?.brackets ?? raw?.progressive_tax_brackets ?? raw?.taxBrackets ?? [];
  return {
    id: String(raw?.id ?? ''),
    version: asNumber(raw?.version, 1),
    name: String(raw?.name ?? raw?.scheme_name ?? 'Progressive Tax Scheme'),
    effectiveFrom: String(
      raw?.effectiveFrom ?? raw?.effective_from ?? raw?.effectiveMonth ?? raw?.effective_month ?? '',
    ),
    status: raw?.status === 'published' ? 'published' : raw?.status === 'superseded' ? 'superseded' : 'draft',
    publishedAt: raw?.publishedAt ?? raw?.published_at ?? null,
    createdAt: raw?.createdAt ?? raw?.created_at ?? null,
    brackets: Array.isArray(bracketSource)
      ? bracketSource.map(normalizeBracket).sort((a: TaxBracket, b: TaxBracket) => a.ordinal - b.ordinal)
      : [],
  };
};

const normalizeSchemes = (body: any): TaxScheme[] => {
  const source = Array.isArray(body) ? body : (body?.schemes ?? body?.data ?? []);
  if (!Array.isArray(source)) return [];
  return source
    .map(normalizeScheme)
    .filter((scheme) => scheme.id)
    .sort((a, b) => {
      const statusOrder: Record<SchemeStatus, number> = { draft: 0, published: 1, superseded: 2 };
      if (a.status !== b.status) return statusOrder[a.status] - statusOrder[b.status];
      return b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version - a.version;
    });
};

const editorFromScheme = (scheme: TaxScheme): DraftEditor => ({
  name: scheme.name,
  effectiveMode: effectiveModeFromValue(scheme.effectiveFrom),
  effectiveFrom: monthValue(scheme.effectiveFrom),
  firstMinimum: scheme.brackets[0]?.minimumAmount || 1,
  brackets: scheme.brackets.map((bracket, index) => ({
    id: bracket.id || `bracket-${index}`,
    maximumAmount: bracket.maximumAmount.toFixed(2),
    ratePercent: (bracket.rate * 100).toString(),
  })),
});

const initialEditor = (year = currentYear()): DraftEditor => ({
  name: 'Progressive Taxation Scheme',
  effectiveMode: 'year',
  effectiveFrom: `${year}-01`,
  firstMinimum: 1,
  brackets: INITIAL_BRACKETS.map((bracket, index) => ({
    id: `new-bracket-${index}`,
    maximumAmount: bracket.maximumAmount.toFixed(2),
    ratePercent: (bracket.rate * 100).toString(),
  })),
});

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await getApiRequestHeaders(init.body !== undefined);
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { ...headers, ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.message ?? body?.error ?? `Request failed (${response.status})`;
    throw new Error(Array.isArray(detail) ? detail.join(', ') : String(detail));
  }
  return body as T;
}

function editorValidation(
  editor: DraftEditor,
  schemes: TaxScheme[],
  selectedSchemeId?: string,
  allowPublishedConflict = false,
) {
  const errors: string[] = [];
  if (!editor.name.trim()) errors.push('Scheme name is required.');
  if (!/^\d{4}-\d{2}$/.test(editor.effectiveFrom)) {
    errors.push(editor.effectiveMode === 'year' ? 'Effective year is required.' : 'Effective month is required.');
  }
  if (editor.effectiveMode === 'year' && !editor.effectiveFrom.endsWith('-01')) {
    errors.push('Whole-year schemes must begin in January.');
  }
  const periodConflicts = schemes.filter(
    (scheme) => scheme.id !== selectedSchemeId && monthValue(scheme.effectiveFrom) === editor.effectiveFrom,
  );
  if (
    periodConflicts.length > 0 &&
    !(allowPublishedConflict && periodConflicts.every((scheme) => scheme.status === 'published'))
  ) {
    errors.push(
      editor.effectiveMode === 'year'
        ? `A taxation scheme is already effective for ${editor.effectiveFrom.slice(0, 4)}.`
        : `A taxation scheme is already effective for ${displayMonth(editor.effectiveFrom)}.`,
    );
  }
  if (editor.brackets.length === 0) errors.push('At least one bracket is required.');

  let minimum = roundMoney(editor.firstMinimum);
  editor.brackets.forEach((bracket, index) => {
    const maximum = Number(bracket.maximumAmount);
    const rate = Number(bracket.ratePercent);
    if (!Number.isFinite(maximum) || maximum < minimum) {
      errors.push(`Bracket ${index + 1} must end at or above ${moneyFormatter.format(minimum)}.`);
    }
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      errors.push(`Bracket ${index + 1} rate must be greater than 0% and no more than 100%.`);
    }
    minimum = roundMoney(maximum + CENTAVO);
  });
  return errors;
}

export function TaxationSchemeControl() {
  const [schemes, setSchemes] = React.useState<TaxScheme[]>([]);
  const [selectedId, setSelectedId] = React.useState('');
  const [editor, setEditor] = React.useState<DraftEditor | null>(null);
  const [editorMode, setEditorMode] = React.useState<EditorMode>('existing');
  const [cloneSourceId, setCloneSourceId] = React.useState('');
  const [previewAmount, setPreviewAmount] = React.useState('50000');
  const [loading, setLoading] = React.useState(true);
  const [busyAction, setBusyAction] = React.useState('');
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [confirmation, setConfirmation] = React.useState<'publish' | 'delete' | null>(null);

  const selectedScheme = schemes.find((scheme) => scheme.id === selectedId) ?? null;
  const validationErrors = editor
    ? editorValidation(
        editor,
        schemes,
        editorMode === 'existing' ? selectedScheme?.id : undefined,
        editorMode === 'revision' || selectedScheme?.status === 'draft',
      )
    : [];

  const loadSchemes = React.useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError('');
    try {
      const body = await apiRequest<any>(API_PATH);
      const normalized = normalizeSchemes(body);
      setSchemes(normalized);
      setSelectedId((current) => {
        if (preferredId && normalized.some((scheme) => scheme.id === preferredId)) return preferredId;
        if (current && normalized.some((scheme) => scheme.id === current)) return current;
        return normalized[0]?.id ?? '';
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load taxation schemes.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSchemes();
  }, [loadSchemes]);

  React.useEffect(() => {
    if (editorMode !== 'existing' || !selectedScheme) return;
    setEditor(editorFromScheme(selectedScheme));
  }, [editorMode, selectedScheme]);

  React.useEffect(() => {
    if (!success) return;
    const timeout = window.setTimeout(() => setSuccess(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [success]);

  const lowerBoundAt = (index: number) => {
    if (!editor) return 0;
    if (index === 0) return editor.firstMinimum;
    return roundMoney(Number(editor.brackets[index - 1].maximumAmount) + CENTAVO);
  };

  const updateBracket = (index: number, field: 'maximumAmount' | 'ratePercent', value: string) => {
    setEditor((current) => {
      if (!current) return current;
      const brackets = current.brackets.map((bracket, bracketIndex) =>
        bracketIndex === index ? { ...bracket, [field]: value } : bracket,
      );
      return { ...current, brackets };
    });
  };

  const addBracket = () => {
    setEditor((current) => {
      if (!current) return current;
      const previousMaximum = Number(current.brackets.at(-1)?.maximumAmount || 0);
      const nextMaximum = roundMoney(previousMaximum + 25000);
      return {
        ...current,
        brackets: [
          ...current.brackets,
          {
            id: `local-${Date.now()}`,
            maximumAmount: nextMaximum.toFixed(2),
            ratePercent: current.brackets.at(-1)?.ratePercent || '25',
          },
        ],
      };
    });
  };

  const removeBracket = (index: number) => {
    setEditor((current) => {
      if (!current || current.brackets.length <= 1) return current;
      return { ...current, brackets: current.brackets.filter((_, bracketIndex) => bracketIndex !== index) };
    });
  };

  const startCreate = () => {
    setSelectedId('');
    setCloneSourceId('');
    setEditorMode('create');
    setEditor(initialEditor(nextAvailableAnnualYear(schemes)));
    setError('');
  };

  const startClone = () => {
    if (!selectedScheme) return;
    const cloned = editorFromScheme(selectedScheme);
    setCloneSourceId(selectedScheme.id);
    setSelectedId('');
    setEditorMode('clone');
    setEditor({
      ...cloned,
      name: `${selectedScheme.name} - New Version`,
      effectiveMode: 'year',
      effectiveFrom: `${nextAvailableAnnualYear(schemes)}-01`,
      brackets: cloned.brackets.map((bracket, index) => ({ ...bracket, id: `clone-${index}` })),
    });
    setError('');
  };

  const startRevision = () => {
    if (!selectedScheme || selectedScheme.status !== 'published') return;
    const revision = editorFromScheme(selectedScheme);
    setCloneSourceId(selectedScheme.id);
    setSelectedId('');
    setEditorMode('revision');
    setEditor({
      ...revision,
      name: selectedScheme.name,
      brackets: revision.brackets.map((bracket, index) => ({ ...bracket, id: `revision-${index}` })),
    });
    setError('');
  };

  const selectScheme = (scheme: TaxScheme) => {
    setEditorMode('existing');
    setCloneSourceId('');
    setSelectedId(scheme.id);
    setEditor(editorFromScheme(scheme));
    setError('');
  };

  const payloadFromEditor = (value: DraftEditor) => {
    let minimum = roundMoney(value.firstMinimum);
    const brackets = value.brackets.map((bracket, index) => {
      const maximum = roundMoney(Number(bracket.maximumAmount));
      const result = {
        ordinal: index + 1,
        minimumAmount: minimum,
        maximumAmount: maximum,
        rate: Number(bracket.ratePercent) / 100,
      };
      minimum = roundMoney(maximum + CENTAVO);
      return result;
    });
    return {
      name: value.name.trim(),
      effectiveMonth: `${value.effectiveFrom}-01`,
      brackets,
    };
  };

  const saveDraft = async () => {
    if (!editor || validationErrors.length > 0) return;
    setBusyAction('save');
    setError('');
    try {
      const payload = payloadFromEditor(editor);
      let body: any;
      if (editorMode === 'create') {
        body = await apiRequest<any>(API_PATH, { method: 'POST', body: JSON.stringify(payload) });
      } else if (editorMode === 'clone' || editorMode === 'revision') {
        body = await apiRequest<any>(`${API_PATH}/${encodeURIComponent(cloneSourceId)}/clone`, {
          method: 'POST',
          body: JSON.stringify({
            name: payload.name,
            effectiveMonth: payload.effectiveMonth,
            mode: editorMode,
          }),
        });
        const clonedId = String(body?.scheme?.id ?? body?.id ?? '');
        if (!clonedId) throw new Error('The cloned taxation scheme did not return an ID.');
        body = await apiRequest<any>(`${API_PATH}/${encodeURIComponent(clonedId)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else if (selectedScheme?.status === 'draft') {
        body = await apiRequest<any>(`${API_PATH}/${encodeURIComponent(selectedScheme.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }
      const savedId = String(body?.scheme?.id ?? body?.id ?? selectedScheme?.id ?? '');
      setEditorMode('existing');
      setCloneSourceId('');
      setSuccess('Draft saved.');
      await loadSchemes(savedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the draft.');
    } finally {
      setBusyAction('');
    }
  };

  const publishDraft = async () => {
    if (!selectedScheme || selectedScheme.status !== 'draft') return;
    setBusyAction('publish');
    setError('');
    try {
      await apiRequest(`${API_PATH}/${encodeURIComponent(selectedScheme.id)}/publish`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setConfirmation(null);
      setSuccess('Taxation scheme published.');
      await loadSchemes(selectedScheme.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish the scheme.');
    } finally {
      setBusyAction('');
    }
  };

  const deleteDraft = async () => {
    if (!selectedScheme || selectedScheme.status !== 'draft') return;
    setBusyAction('delete');
    setError('');
    try {
      await apiRequest(`${API_PATH}/${encodeURIComponent(selectedScheme.id)}`, { method: 'DELETE' });
      setConfirmation(null);
      setSelectedId('');
      setSuccess('Draft deleted.');
      await loadSchemes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete the draft.');
    } finally {
      setBusyAction('');
    }
  };

  const preview = React.useMemo(() => {
    if (!editor || validationErrors.length > 0) return null;
    const amount = roundMoney(Number(previewAmount));
    if (!Number.isFinite(amount) || amount < 0) return null;
    let minimum = editor.firstMinimum;
    const brackets = editor.brackets.map((bracket, index) => {
      const maximum = Number(bracket.maximumAmount);
      const normalized = {
        id: bracket.id,
        ordinal: index + 1,
        minimumAmount: minimum,
        maximumAmount: maximum,
        rate: Number(bracket.ratePercent) / 100,
      };
      minimum = roundMoney(maximum + CENTAVO);
      return normalized;
    });
    const calculation = calculateProgressiveTax({
      reportingYear: Number(editor.effectiveFrom.slice(0, 4)) || new Date().getFullYear(),
      reportingMonth: Number(editor.effectiveFrom.slice(5, 7)) || 1,
      weekdayCollections: amount,
      sundayCollections: 0,
      saturdayCollections: 0,
      scheme: {
        id: selectedScheme?.id ?? 'preview',
        version: selectedScheme?.version ?? 0,
        name: editor.name,
        effectiveFrom: `${editor.effectiveFrom}-01`,
        status: 'published',
        brackets,
      },
    });
    return {
      amount,
      rate: calculation.taxRate,
      tax: calculation.taxAmount,
      matched: calculation.status === 'matched' || calculation.status === 'zero',
    };
  }, [editor, previewAmount, selectedScheme, validationErrors.length]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-amber-700">Administration</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Taxation Scheme</h2>
          <p className="mt-1 text-sm text-slate-500">Effective-dated progressive rates for Mass Collections.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadSchemes()}
            disabled={loading || Boolean(busyAction)}
            title="Refresh taxation schemes"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={startCreate}
            disabled={Boolean(busyAction)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            <FilePlus2 className="h-4 w-4" />
            Create Draft
          </button>
        </div>
      </header>

      {(error || success) && (
        <div
          role="status"
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${
            error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {error ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{error || success}</span>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="min-w-0 border-r-0 border-slate-200 xl:border-r xl:pr-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Scheme History</h3>
            <span className="text-xs font-semibold text-slate-400">{schemes.length}</span>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : schemes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center">
              <p className="text-sm font-bold text-slate-700">No taxation schemes</p>
              <p className="mt-1 text-xs text-slate-500">Create the first draft to begin.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {schemes.map((scheme) => {
                const active = selectedId === scheme.id;
                return (
                  <button
                    key={scheme.id}
                    type="button"
                    onClick={() => selectScheme(scheme)}
                    className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                      active
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900">{scheme.name}</span>
                        <span className="mt-1 block text-xs font-medium text-slate-500">
                          v{scheme.version} - {displayEffectivePeriod(scheme)}
                        </span>
                      </span>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[10px] font-bold uppercase ${
                          scheme.status === 'published'
                            ? 'bg-emerald-100 text-emerald-700'
                            : scheme.status === 'superseded'
                              ? 'bg-slate-200 text-slate-500'
                              : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {scheme.status === 'published' && <Check className="h-3 w-3" />}
                        {scheme.status}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="min-w-0">
          {!editor ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white">
              <div className="text-center">
                <CalendarDays className="mx-auto h-7 w-7 text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-700">Select or create a scheme</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_minmax(220px,1fr)_minmax(180px,1fr)]">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-slate-600">Scheme Name</span>
                    <input
                      type="text"
                      value={editor.name}
                      disabled={Boolean(selectedScheme && selectedScheme.status !== 'draft')}
                      onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                      className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-amber-500 disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </label>
                  <fieldset className="block">
                    <legend className="mb-1.5 block text-xs font-bold text-slate-600">Effective Period</legend>
                    <div className="grid h-11 grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
                      {[
                        { value: 'year' as const, label: 'Whole year' },
                        { value: 'month' as const, label: 'Specific month' },
                      ].map((option) => {
                        const active = editor.effectiveMode === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            disabled={Boolean(selectedScheme && selectedScheme.status !== 'draft')}
                            aria-pressed={active}
                            onClick={() => {
                              setError('');
                              setEditor({
                                ...editor,
                                effectiveMode: option.value,
                                effectiveFrom:
                                  option.value === 'year'
                                    ? `${editor.effectiveFrom.slice(0, 4) || currentYear()}-01`
                                    : editor.effectiveFrom || currentMonth(),
                              });
                            }}
                            className={`rounded-md px-2 text-xs font-bold transition-colors ${
                              active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            } disabled:cursor-not-allowed disabled:opacity-70`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-slate-600">
                      {editor.effectiveMode === 'year' ? 'Effective Year' : 'Effective Month'}
                    </span>
                    {editor.effectiveMode === 'year' ? (
                      <input
                        type="number"
                        min="2000"
                        max="2100"
                        step="1"
                        value={editor.effectiveFrom.slice(0, 4)}
                        disabled={Boolean(selectedScheme && selectedScheme.status !== 'draft')}
                        onChange={(event) => {
                          setError('');
                          setEditor({ ...editor, effectiveFrom: `${event.target.value}-01` });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-amber-500 disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    ) : (
                      <input
                        type="month"
                        value={editor.effectiveFrom}
                        disabled={Boolean(selectedScheme && selectedScheme.status !== 'draft')}
                        onChange={(event) => {
                          setError('');
                          setEditor({ ...editor, effectiveFrom: event.target.value });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-amber-500 disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    )}
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedScheme?.status === 'published' && (
                    <button
                      type="button"
                      onClick={startRevision}
                      disabled={Boolean(busyAction)}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit Scheme
                    </button>
                  )}
                  {selectedScheme && (
                    <button
                      type="button"
                      onClick={startClone}
                      disabled={Boolean(busyAction)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Copy className="h-4 w-4" />
                      Clone
                    </button>
                  )}
                  {selectedScheme?.status === 'draft' && editorMode === 'existing' && (
                    <button
                      type="button"
                      onClick={() => setConfirmation('delete')}
                      disabled={Boolean(busyAction)}
                      title="Delete draft"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {selectedScheme && selectedScheme.status !== 'draft' && (
                <div className="flex items-center gap-2 border-y border-slate-200 py-3 text-sm font-semibold text-slate-600">
                  <LockKeyhole className="h-4 w-4 text-slate-400" />
                  {selectedScheme.status === 'published'
                    ? 'Published version - Use Edit Scheme to create a revision'
                    : 'Superseded version - Read only'}
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full min-w-[620px] border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="w-16 px-4 py-3">#</th>
                      <th className="px-4 py-3">Minimum</th>
                      <th className="px-4 py-3">Maximum</th>
                      <th className="px-4 py-3">Tax Rate</th>
                      <th className="w-16 px-4 py-3" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {editor.brackets.map((bracket, index) => {
                      const locked = Boolean(selectedScheme && selectedScheme.status !== 'draft');
                      return (
                        <tr key={bracket.id}>
                          <td className="px-4 py-3 font-bold text-slate-400">{index + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex h-10 items-center rounded-lg border border-slate-100 bg-slate-50 px-3 font-semibold text-slate-500">
                              {moneyFormatter.format(lowerBoundAt(index))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                                PHP
                              </span>
                              <input
                                type="number"
                                min={lowerBoundAt(index)}
                                step="0.01"
                                value={bracket.maximumAmount}
                                disabled={locked}
                                onChange={(event) => updateBracket(index, 'maximumAmount', event.target.value)}
                                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-12 pr-3 text-right font-semibold text-slate-900 outline-none focus:border-amber-500 disabled:bg-slate-50 disabled:text-slate-500"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="relative">
                              <input
                                type="number"
                                min="0.01"
                                max="100"
                                step="0.01"
                                value={bracket.ratePercent}
                                disabled={locked}
                                onChange={(event) => updateBracket(index, 'ratePercent', event.target.value)}
                                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 pr-8 text-right font-semibold text-slate-900 outline-none focus:border-amber-500 disabled:bg-slate-50 disabled:text-slate-500"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">
                                %
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!locked && (
                              <button
                                type="button"
                                onClick={() => removeBracket(index)}
                                disabled={editor.brackets.length <= 1}
                                title="Remove bracket"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(!selectedScheme || selectedScheme.status === 'draft') && (
                  <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
                    <button
                      type="button"
                      onClick={addBracket}
                      className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-slate-950"
                    >
                      <Plus className="h-4 w-4" />
                      Add Bracket
                    </button>
                  </div>
                )}
              </div>

              {validationErrors.length > 0 && (!selectedScheme || selectedScheme.status === 'draft') && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  {validationErrors.map((message) => (
                    <p key={message} className="text-xs font-semibold text-amber-800">
                      {message}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid gap-5 border-t border-slate-200 pt-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-slate-500" />
                    <h3 className="text-sm font-bold text-slate-900">Calculation Preview</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-500">Mass Collections</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={previewAmount}
                        onChange={(event) => setPreviewAmount(event.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-amber-500"
                      />
                    </label>
                    <div>
                      <span className="mb-1 block text-xs font-semibold text-slate-500">Matched Rate</span>
                      <div className="flex h-10 items-center rounded-lg bg-slate-100 px-3 text-sm font-bold text-slate-800">
                        {preview?.matched ? `${(preview.rate * 100).toFixed(2)}%` : 'Out of range'}
                      </div>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs font-semibold text-slate-500">Diocese Share</span>
                      <div className="flex h-10 items-center rounded-lg bg-slate-100 px-3 text-sm font-bold text-slate-800">
                        {preview?.matched ? moneyFormatter.format(preview.tax) : '-'}
                      </div>
                    </div>
                  </div>
                </div>

                {(!selectedScheme || selectedScheme.status === 'draft') && (
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void saveDraft()}
                      disabled={Boolean(busyAction) || validationErrors.length > 0}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busyAction === 'save' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save Draft
                    </button>
                    {editorMode === 'existing' && selectedScheme?.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => setConfirmation('publish')}
                        disabled={Boolean(busyAction) || validationErrors.length > 0}
                        className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />
                        Publish
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {confirmation && selectedScheme && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-lg bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    confirmation === 'publish' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {confirmation === 'publish' ? <Send className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-950">
                    {confirmation === 'publish' ? 'Publish Taxation Scheme' : 'Delete Draft'}
                  </h3>
                  <p className="text-sm text-slate-500">{selectedScheme.name}</p>
                </div>
              </div>
            </div>
            <p className="px-6 py-5 text-sm leading-6 text-slate-600">
              {confirmation === 'publish'
                ? 'Published schemes are read-only and remain available for historical reports.'
                : 'This unused draft and its brackets will be permanently removed.'}
            </p>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                disabled={Boolean(busyAction)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void (confirmation === 'publish' ? publishDraft() : deleteDraft())}
                disabled={Boolean(busyAction)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold ${
                  confirmation === 'publish'
                    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {busyAction ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {confirmation === 'publish' ? 'Publish' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
