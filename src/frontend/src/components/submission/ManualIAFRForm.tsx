'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Check, ChevronDown, FilePenLine, Save, ScanLine, Send } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  iafrManualSections,
  iafrSacramentRows,
  iafrSpecialCollections2026,
  IAFRAmountField,
  IAFRSectionCode,
} from './iafrManualForm';

export interface ManualSubmissionEntry {
  fieldKey: string;
  sectionCode: IAFRSectionCode;
  subsectionCode?: string;
  canonicalAccountCode: string;
  sourceLabel: string;
  rawValue: string;
  cleanedAmount: number;
  sourceMetadata?: Record<string, unknown>;
}

export interface ManualIAFRFormProps {
  parishName: string;
  reportingMonth: number;
  reportingYear: number;
  disabled?: boolean;
  isSubmitting?: boolean;
  initialValues?: ManualIAFRValueMap;
  ocrReviewMetadata?: ManualIAFROcrReviewMetadata;
  onSubmit: (entries: ManualSubmissionEntry[]) => Promise<void>;
}

export type ManualIAFRValueMap = Record<string, string>;

type ValueMap = ManualIAFRValueMap;

export interface ManualIAFROcrFieldMetadata {
  confidence?: number;
  status?: 'mapped' | 'low_confidence' | 'needs_review' | 'unmatched';
  pageNumber?: number;
  sourceLabel?: string;
  snippet?: string;
  message?: string;
}

export interface ManualIAFROcrReviewMetadata {
  runId?: string;
  fileName?: string;
  confidence?: number;
  confidenceSummary?: {
    average?: number;
    mappedFieldCount?: number;
    lowConfidenceCount?: number;
    needsReviewCount?: number;
    unmatchedFieldCount?: number;
  };
  fields?: Record<string, ManualIAFROcrFieldMetadata>;
  issues?: string[];
}

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

function numberValue(values: ValueMap, key: string) {
  const parsed = Number(values[key] ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function specialCollectionKey(date: string) {
  return `special_collection.${date}`;
}

function formatConfidence(confidence?: number) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  return `${Math.round(confidence * 100)}%`;
}

function isLowConfidence(metadata?: ManualIAFROcrFieldMetadata) {
  if (!metadata) return false;
  return metadata.status === 'low_confidence' || metadata.status === 'needs_review' || (typeof metadata.confidence === 'number' && metadata.confidence < 0.75);
}

function AmountInput({
  field,
  value,
  onChange,
  ocrMetadata,
}: {
  field: IAFRAmountField;
  value: string;
  onChange: (value: string) => void;
  ocrMetadata?: ManualIAFROcrFieldMetadata;
}) {
  const needsReview = isLowConfidence(ocrMetadata);
  const confidenceLabel = formatConfidence(ocrMetadata?.confidence);
  return (
    <label className="grid gap-2 border-t border-gray-100 px-4 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center sm:px-5">
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900">
          {field.label}
          {needsReview && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700">
              <AlertTriangle className="h-3 w-3" /> Review
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">
          {field.accountCode}
        </span>
        {ocrMetadata && (
          <span className="mt-1 block text-[11px] text-gray-500">
            OCR {confidenceLabel ? `${confidenceLabel} confidence` : 'mapped value'}
            {ocrMetadata.pageNumber ? ` - page ${ocrMetadata.pageNumber}` : ''}
            {ocrMetadata.message ? ` - ${ocrMetadata.message}` : ''}
          </span>
        )}
      </span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500">PHP</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0.00"
          className={`h-10 w-full rounded-md border bg-gold-50/50 pl-12 pr-3 text-right text-sm font-semibold text-gray-900 outline-none transition focus:ring-2 ${needsReview ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500/20' : 'border-gold-200 focus:border-gold-500 focus:ring-gold-500/20'}`}
        />
      </span>
    </label>
  );
}

export function ManualIAFRForm({
  parishName,
  reportingMonth,
  reportingYear,
  disabled = false,
  isSubmitting = false,
  initialValues,
  ocrReviewMetadata,
  onSubmit,
}: ManualIAFRFormProps) {
  const storageKey = `iafr-manual-draft:${parishName}:${reportingYear}:${reportingMonth}`;
  const [openSection, setOpenSection] = useState<IAFRSectionCode | null>('A');
  const [values, setValues] = useState<ValueMap>(initialValues ?? {});
  const [draftStatus, setDraftStatus] = useState('Draft not saved');
  const [validationMessage, setValidationMessage] = useState('');
  const isOcrReview = Boolean(ocrReviewMetadata);
  const specialCollections = reportingYear === 2026 ? (iafrSpecialCollections2026[reportingMonth] ?? []) : [];

  useEffect(() => {
    if (initialValues) {
      setValues(initialValues);
      setDraftStatus('OCR draft ready for review');
      return;
    }
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        setValues(JSON.parse(saved) as ValueMap);
        setDraftStatus('Draft restored on this device');
      }
    } catch {
      setDraftStatus('Draft could not be restored');
    }
  }, [initialValues, storageKey]);

  useEffect(() => {
    if (Object.keys(values).length === 0) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify(values));
      setDraftStatus('Draft saved on this device');
    }, 450);
    setDraftStatus('Saving draft...');
    return () => window.clearTimeout(timer);
  }, [storageKey, values]);

  const setValue = (key: string, value: string) => {
    if (value !== '' && Number(value) < 0) return;
    setValues((current) => ({ ...current, [key]: value }));
    setValidationMessage('');
  };

  const getOcrFieldMetadata = (key: string, entryFieldKey?: string) => {
    if (!ocrReviewMetadata?.fields) return undefined;
    return ocrReviewMetadata.fields[key] ?? (entryFieldKey ? ocrReviewMetadata.fields[entryFieldKey] : undefined);
  };

  const withSourceMetadata = (base: Record<string, unknown>, formValueKey: string, entryFieldKey?: string) => {
    if (!ocrReviewMetadata) return base;
    const fieldMetadata = getOcrFieldMetadata(formValueKey, entryFieldKey);
    return {
      ...base,
      originalInputKind: base.inputKind,
      inputKind: 'ocr_pdf',
      ocrRunId: ocrReviewMetadata.runId,
      ocrFileName: ocrReviewMetadata.fileName,
      ocrConfidence: ocrReviewMetadata.confidence ?? ocrReviewMetadata.confidenceSummary?.average,
      ocrFieldConfidence: fieldMetadata?.confidence,
      ocrFieldStatus: fieldMetadata?.status,
      ocrPageNumber: fieldMetadata?.pageNumber,
      ocrSourceLabel: fieldMetadata?.sourceLabel,
      ocrSnippet: fieldMetadata?.snippet,
      ocrReviewMessage: fieldMetadata?.message,
    };
  };

  const sectionTotals = useMemo(() => {
    const totals = Object.fromEntries(iafrManualSections.map((section) => [section.code, 0])) as Record<IAFRSectionCode, number>;
    for (const section of iafrManualSections) {
      totals[section.code] = section.fields.reduce((sum, field) => sum + numberValue(values, field.key), 0);
    }
    totals.A += iafrSacramentRows.reduce((sum, row) => {
      const prescribed = row.prescribedRate * numberValue(values, `${row.accountCode}.chargeable`);
      const overAbove = numberValue(values, `${row.accountCode}.overAboveRate`) * numberValue(values, `${row.accountCode}.chargeable`);
      return sum + prescribed + overAbove;
    }, 0);
    totals.F += specialCollections.reduce((sum, collection) => sum + numberValue(values, specialCollectionKey(collection.date)), 0);
    return totals;
  }, [specialCollections, values]);

  const completedBySection = useMemo(() => {
    const result = {} as Record<IAFRSectionCode, number>;
    for (const section of iafrManualSections) {
      result[section.code] = section.fields.filter((field) => numberValue(values, field.key) > 0).length;
      if (section.code === 'A') {
        result.A += iafrSacramentRows.filter((row) => numberValue(values, `${row.accountCode}.chargeable`) > 0).length;
      }
      if (section.code === 'F') {
        result.F += specialCollections.filter((collection) => numberValue(values, specialCollectionKey(collection.date)) > 0).length;
      }
    }
    return result;
  }, [specialCollections, values]);

  const buildEntries = () => {
    const entries: ManualSubmissionEntry[] = [];
    for (const section of iafrManualSections) {
      for (const field of section.fields) {
        const amount = numberValue(values, field.key);
        if (amount === 0) continue;
        entries.push({
          fieldKey: `${section.code}.${field.key}`,
          sectionCode: section.code,
          subsectionCode: field.subsection,
          canonicalAccountCode: field.accountCode,
          sourceLabel: field.label,
          rawValue: values[field.key] ?? '',
          cleanedAmount: Math.round(amount * 100) / 100,
          sourceMetadata: withSourceMetadata({ formVersion: 'iafr_2026_v1', inputKind: 'amount' }, field.key, `${section.code}.${field.key}`),
        });
      }
    }

    for (const row of iafrSacramentRows) {
      const rate = row.prescribedRate;
      const gratis = numberValue(values, `${row.accountCode}.gratis`);
      const chargeable = numberValue(values, `${row.accountCode}.chargeable`);
      const overAboveRate = numberValue(values, `${row.accountCode}.overAboveRate`);
      const metadata = { rate, gratis, chargeable, overAboveRate, formVersion: 'iafr_2026_v1' };
      const prescribed = Math.round(rate * chargeable * 100) / 100;
      const overAbove = Math.round(overAboveRate * chargeable * 100) / 100;

      if (prescribed > 0) {
        entries.push({
          fieldKey: `${row.accountCode}.prescribed_total`,
          sectionCode: 'A',
          subsectionCode: 'sacrament_breakdown',
          canonicalAccountCode: `${row.accountCode}.01`,
          sourceLabel: `${row.label} - Total Prescribed Amount`,
          rawValue: String(prescribed),
          cleanedAmount: prescribed,
          sourceMetadata: withSourceMetadata(metadata, `${row.accountCode}.chargeable`, `${row.accountCode}.prescribed_total`),
        });
      }
      if (overAbove > 0) {
        entries.push({
          fieldKey: `${row.accountCode}.over_above_total`,
          sectionCode: 'A',
          subsectionCode: 'sacrament_breakdown',
          canonicalAccountCode: `${row.accountCode}.02`,
          sourceLabel: `${row.label} - Total Over/Above Amount`,
          rawValue: String(overAbove),
          cleanedAmount: overAbove,
          sourceMetadata: withSourceMetadata(metadata, `${row.accountCode}.overAboveRate`, `${row.accountCode}.over_above_total`),
        });
      }
    }

    for (const collection of specialCollections) {
      const key = specialCollectionKey(collection.date);
      const amount = numberValue(values, key);
      if (amount === 0) continue;
      entries.push({
        fieldKey: `F.${key}`,
        sectionCode: 'F',
        subsectionCode: 'special_collections',
        canonicalAccountCode: 'F.3.01',
        sourceLabel: `${collection.displayDate} - ${collection.label}`,
        rawValue: values[key] ?? '',
        cleanedAmount: Math.round(amount * 100) / 100,
        sourceMetadata: withSourceMetadata({
          collectionDate: collection.date,
          collectionName: collection.label,
          formVersion: 'iafr_2026_v1',
          inputKind: 'scheduled_special_collection',
        }, key, `F.${key}`),
      });
    }

    const intentionTotal = numberValue(values, 'mass_intentions_total');
    const intentionClaimed = numberValue(values, 'mass_intentions_claimed');
    if (intentionTotal >= intentionClaimed && intentionTotal - intentionClaimed > 0) {
      entries.push({
        fieldKey: 'A.mass_intentions_unclaimed',
        sectionCode: 'A',
        subsectionCode: 'mass_intentions',
        canonicalAccountCode: 'A.3.03',
        sourceLabel: 'Mass Intentions - Unclaimed',
        rawValue: String(intentionTotal - intentionClaimed),
        cleanedAmount: Math.round((intentionTotal - intentionClaimed) * 100) / 100,
        sourceMetadata: withSourceMetadata({ derivedFrom: ['A.3.01', 'A.3.02'], formVersion: 'iafr_2026_v1' }, 'mass_intentions_total', 'A.mass_intentions_unclaimed'),
      });
    }
    return entries;
  };

  const ocrConfidenceLabel = formatConfidence(ocrReviewMetadata?.confidence ?? ocrReviewMetadata?.confidenceSummary?.average);
  const ocrNeedsReviewCount =
    (ocrReviewMetadata?.confidenceSummary?.lowConfidenceCount ?? 0)
    + (ocrReviewMetadata?.confidenceSummary?.needsReviewCount ?? 0)
    + (ocrReviewMetadata?.confidenceSummary?.unmatchedFieldCount ?? 0);

  const submit = async () => {
    const intentionTotal = numberValue(values, 'mass_intentions_total');
    const intentionClaimed = numberValue(values, 'mass_intentions_claimed');
    if (intentionClaimed > intentionTotal) {
      setOpenSection('A');
      setValidationMessage('Mass intentions claimed cannot be greater than total Mass intention receipts.');
      return;
    }
    const entries = buildEntries();
    if (entries.length === 0) {
      setValidationMessage('Enter at least one amount before submitting the test report.');
      return;
    }
    await onSubmit(entries);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black text-gold-400">
            <FilePenLine className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-serif text-xl font-bold text-black">Manual IAFR entry</h2>
            <p className="mt-1 text-sm text-gray-500">2026 form structure - one section at a time</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-500">
          <Save className="h-4 w-4" /> {draftStatus}
        </span>
      </div>

      {isOcrReview && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-amber-700 ring-1 ring-amber-200">
                <ScanLine className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-amber-950">OCR review required</h3>
                <p className="mt-1 max-w-3xl text-sm text-amber-900">
                  Scanned PDF values were mapped into this manual form. Please check every highlighted field and edit anything that does not match the document before submitting.
                </p>
                {ocrReviewMetadata?.issues && ocrReviewMetadata.issues.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs font-medium text-amber-800">
                    {ocrReviewMetadata.issues.slice(0, 3).map((issue) => (
                      <li key={issue}>- {issue}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {ocrReviewMetadata?.fileName && (
                <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-900">{ocrReviewMetadata.fileName}</span>
              )}
              {ocrConfidenceLabel && (
                <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-900">{ocrConfidenceLabel} confidence</span>
              )}
              {ocrNeedsReviewCount > 0 && (
                <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">{ocrNeedsReviewCount} need review</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-200">
        {iafrManualSections.map((section) => {
          const isOpen = openSection === section.code;
          const available = section.fields.length
            + (section.code === 'A' ? iafrSacramentRows.length : 0)
            + (section.code === 'F' ? specialCollections.length : 0);
          return (
            <section key={section.code}>
              <button
                type="button"
                onClick={() => setOpenSection((current) => (current === section.code ? null : section.code))}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-gray-50 sm:px-6"
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold ${isOpen ? 'bg-gold-500 text-black' : 'bg-gray-100 text-gray-700'}`}>
                  {section.code}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-black">{section.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500">{section.description}</span>
                </span>
                <span className="hidden text-right sm:block">
                  <span className="block text-sm font-semibold text-black">{money.format(sectionTotals[section.code])}</span>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-gray-400">{completedBySection[section.code]} of {available} entered</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key={`${section.code}-content`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ height: { duration: 0.28, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.18 } }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-gray-200 bg-[#fafafa] px-4 py-4 sm:px-6">
                  {section.code === 'A' && (
                    <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
                      <div className="min-w-[1180px]">
                        <div className="grid grid-cols-[minmax(220px,1fr)_120px_90px_100px_145px_135px_155px_135px] gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
                          <span>Sacrament</span>
                          <span>Prescribed rate</span>
                          <span>Gratis</span>
                          <span>Chargeable</span>
                          <span>Total amount as prescribed</span>
                          <span>Charge over/above</span>
                          <span>Total amount as over/above</span>
                          <span>Total amount</span>
                        </div>
                        {iafrSacramentRows.map((row) => {
                          const rate = row.prescribedRate;
                          const chargeable = numberValue(values, `${row.accountCode}.chargeable`);
                          const overAbove = numberValue(values, `${row.accountCode}.overAboveRate`);
                          const prescribedTotal = rate * chargeable;
                          const overAboveTotal = overAbove * chargeable;
                          const total = prescribedTotal + overAboveTotal;
                          return (
                            <div key={row.accountCode} className="grid grid-cols-[minmax(220px,1fr)_120px_90px_100px_145px_135px_155px_135px] items-center gap-2 border-b border-gray-100 px-4 py-2.5 last:border-b-0">
                              <span><span className="block text-sm font-medium text-gray-900">{row.label}</span><span className="text-[10px] font-semibold text-gray-400">{row.accountCode}</span></span>
                              <span
                                title="Fixed prescribed rate from the approved IAFR template"
                                className="flex h-9 items-center justify-end rounded-md border border-gray-200 bg-gray-100 px-3 text-sm font-semibold text-gray-800"
                              >
                                {money.format(rate)}
                              </span>
                              {['gratis', 'chargeable'].map((part) => (
                                <span key={part} className="relative block">
                                  <input
                                    type="number"
                                    min="0"
                                    step={part === 'gratis' || part === 'chargeable' ? '1' : '0.01'}
                                    value={values[`${row.accountCode}.${part}`] ?? ''}
                                    onChange={(event) => setValue(`${row.accountCode}.${part}`, event.target.value)}
                                    placeholder="0"
                                    title={getOcrFieldMetadata(`${row.accountCode}.${part}`)?.message}
                                    className={`h-9 w-full rounded-md border bg-gold-50/50 px-2 text-right text-xs font-semibold outline-none focus:ring-2 ${isLowConfidence(getOcrFieldMetadata(`${row.accountCode}.${part}`)) ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500/20' : 'border-gold-200 focus:border-gold-500 focus:ring-gold-500/20'}`}
                                  />
                                  {isLowConfidence(getOcrFieldMetadata(`${row.accountCode}.${part}`)) && (
                                    <AlertTriangle className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-amber-600" />
                                  )}
                                </span>
                              ))}
                              <span className="flex h-9 items-center justify-end rounded-md bg-gray-100 px-3 text-sm font-semibold text-gray-800">{money.format(prescribedTotal)}</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={values[`${row.accountCode}.overAboveRate`] ?? ''}
                                onChange={(event) => setValue(`${row.accountCode}.overAboveRate`, event.target.value)}
                                placeholder="0.00"
                                title={getOcrFieldMetadata(`${row.accountCode}.overAboveRate`)?.message}
                                className={`h-9 w-full rounded-md border bg-gold-50/50 px-2 text-right text-xs font-semibold outline-none focus:ring-2 ${isLowConfidence(getOcrFieldMetadata(`${row.accountCode}.overAboveRate`)) ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500/20' : 'border-gold-200 focus:border-gold-500 focus:ring-gold-500/20'}`}
                              />
                              <span className="flex h-9 items-center justify-end rounded-md bg-gray-100 px-3 text-sm font-semibold text-gray-800">{money.format(overAboveTotal)}</span>
                              <span className="flex h-9 items-center justify-end rounded-md bg-gray-900 px-3 text-sm font-semibold text-white">{money.format(total)}</span>
                            </div>
                          );
                        })}
                        <div className="grid grid-cols-[minmax(220px,1fr)_120px_90px_100px_145px_135px_155px_135px] items-center gap-2 border-t-2 border-gray-300 bg-gray-50 px-4 py-3">
                          <strong className="text-sm uppercase tracking-[0.08em] text-black">Total</strong>
                          <span />
                          <span />
                          <strong className="text-right text-sm text-gray-700">
                            {iafrSacramentRows.reduce((sum, row) => sum + numberValue(values, `${row.accountCode}.chargeable`), 0)}
                          </strong>
                          <strong className="text-right text-sm text-gray-900">
                            {money.format(iafrSacramentRows.reduce((sum, row) => sum + row.prescribedRate * numberValue(values, `${row.accountCode}.chargeable`), 0))}
                          </strong>
                          <span />
                          <strong className="text-right text-sm text-gray-900">
                            {money.format(iafrSacramentRows.reduce((sum, row) => sum + numberValue(values, `${row.accountCode}.overAboveRate`) * numberValue(values, `${row.accountCode}.chargeable`), 0))}
                          </strong>
                          <strong className="text-right text-sm text-black">{money.format(sectionTotals.A - section.fields.reduce((sum, field) => sum + numberValue(values, field.key), 0))}</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {section.code === 'F' && (
                    <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
                      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 sm:px-5">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">Scheduled special collections</h3>
                            <p className="mt-0.5 text-xs text-gray-500">Dates and collection names from the approved 2026 IAFR template.</p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-gray-500">F.3.01</span>
                        </div>
                      </div>
                      {specialCollections.length > 0 ? (
                        <>
                          {specialCollections.map((collection) => {
                            const key = specialCollectionKey(collection.date);
                            return (
                              <label key={collection.date} className="grid gap-2 border-t border-gray-100 px-4 py-3 first:border-t-0 sm:grid-cols-[140px_minmax(0,1fr)_180px] sm:items-center sm:px-5">
                                <span className="text-xs font-semibold text-gold-800">{collection.displayDate}</span>
                                <span className="text-sm font-medium text-gray-900">{collection.label}</span>
                                <span className="relative block">
                                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500">PHP</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={values[key] ?? ''}
                                    onChange={(event) => setValue(key, event.target.value)}
                                    placeholder="0.00"
                                    title={getOcrFieldMetadata(key, `F.${key}`)?.message}
                                    className={`h-10 w-full rounded-md border bg-gold-50/50 pl-12 pr-3 text-right text-sm font-semibold text-gray-900 outline-none transition focus:ring-2 ${isLowConfidence(getOcrFieldMetadata(key, `F.${key}`)) ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500/20' : 'border-gold-200 focus:border-gold-500 focus:ring-gold-500/20'}`}
                                  />
                                  {isLowConfidence(getOcrFieldMetadata(key, `F.${key}`)) && (
                                    <AlertTriangle className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-amber-600" />
                                  )}
                                </span>
                              </label>
                            );
                          })}
                          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-5">
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Scheduled collections total</span>
                            <strong className="text-sm text-gray-900">
                              {money.format(specialCollections.reduce((sum, collection) => sum + numberValue(values, specialCollectionKey(collection.date)), 0))}
                            </strong>
                          </div>
                        </>
                      ) : (
                        <p className="px-5 py-4 text-sm text-gray-500">No dated special-collection schedule is configured for this reporting period.</p>
                      )}
                    </div>
                  )}

                  <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                    {section.fields.map((field) => (
                      <AmountInput
                        key={field.key}
                        field={field}
                        value={values[field.key] ?? ''}
                        onChange={(value) => setValue(field.key, value)}
                        ocrMetadata={getOcrFieldMetadata(field.key, `${section.code}.${field.key}`)}
                      />
                    ))}
                  </div>

                  <div className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex items-center gap-2 text-xs font-medium text-gray-500"><Calculator className="h-4 w-4 text-gold-700" /> Calculated section subtotal</span>
                    <strong className="text-base text-black">{money.format(sectionTotals[section.code])}</strong>
                  </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })}
      </div>

      <div className="border-t border-gray-200 bg-gray-50 px-5 py-4 sm:px-6">
        {validationMessage && <p className="mb-3 text-sm font-medium text-red-700">{validationMessage}</p>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-xs text-gray-500"><Check className="h-4 w-4 text-emerald-600" /> Entries will be written only to the parish submission sandbox.</p>
          <button
            type="button"
            onClick={submit}
            disabled={disabled || isSubmitting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-black px-5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4 text-gold-400" /> {isSubmitting ? 'Submitting test...' : 'Review and submit test'}
          </button>
        </div>
      </div>
    </div>
  );
}
