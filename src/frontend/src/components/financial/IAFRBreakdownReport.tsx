'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/format';
import type { IAFRBreakdownReport as IAFRBreakdownReportData } from '../../types';

interface IAFRBreakdownReportProps {
  institutionId: string;
  institutionName: string;
  year: number | null;
  vicariates?: string[];
  institutionIds?: string[];
  // No outer Card here — this renders bare header + table so callers can
  // embed it inside their own Card (e.g. sharing the drill-down chart's box
  // on the Bishop Dashboard) instead of always getting its own boxed card.
  className?: string;
  // Skip the built-in "IAFR Report — {name}" heading when the caller's own
  // surrounding UI already introduces it (e.g. the Bishop Dashboard's card
  // title already says "IAFR Report for {name}" right above this).
  hideHeader?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 flex-shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m9 18 6-6-6-6" />
    </svg>
  );
}

function NetAmount({ value }: { value: number }) {
  if (value === 0) return <span className="text-gray-400">—</span>;
  const positive = value > 0;
  return (
    <span className={positive ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
      {positive ? '+' : ''}
      {formatCurrency(value)}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'green' | 'red' | 'blue';
}) {
  const colors = {
    green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    red:   'bg-rose-50   border-rose-200   text-rose-700',
    blue:  'bg-sky-50    border-sky-200    text-sky-700',
  };
  const valueColors = {
    green: 'text-emerald-700',
    red:   value < 0 ? 'text-rose-600' : 'text-rose-700',
    blue:  value >= 0 ? 'text-emerald-600' : 'text-rose-600',
  };
  return (
    <div className={`rounded-xl border px-5 py-4 flex flex-col gap-1 ${colors[accent]}`}>
      <span className="text-[11px] font-semibold uppercase tracking-widest opacity-70">{label}</span>
      <span className={`text-xl font-extrabold tabular-nums ${valueColors[accent]}`}>
        {accent === 'blue' && value > 0 ? '+' : ''}
        {formatCurrency(value)}
      </span>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function IAFRBreakdownReport({
  institutionId,
  institutionName,
  year,
  vicariates,
  institutionIds,
  className,
  hideHeader,
}: IAFRBreakdownReportProps) {
  const [report, setReport] = useState<IAFRBreakdownReportData | null | undefined>(undefined);
  // null = Full Year (the default — aggregates every month in `year`, same
  // as before this control existed); 1-12 narrows to one calendar month.
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  // Collapsed by default — a full report can be 100+ account lines across 6
  // sections, so starting expanded makes every parish look overwhelming at
  // a glance. Reset alongside the report itself so switching institutions
  // doesn't carry over a stale expand state.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const toggleSection = (code: string) =>
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  useEffect(() => {
    setSelectedMonth(null);
  }, [institutionId]);

  useEffect(() => {
    if (!institutionId) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setReport(undefined);
    setExpandedSections(new Set());
    apiClient
      .getFinancialBreakdownReport(institutionId, { year, month: selectedMonth, vicariates, institutionIds })
      .then((res) => {
        if (cancelled) return;
        setReport(res?.data_sufficient && Array.isArray(res.sections) && res.sections.length > 0 ? res : null);
      })
      .catch(() => {
        if (!cancelled) setReport(null);
      });
    return () => {
      cancelled = true;
    };
  }, [institutionId, year, selectedMonth, vicariates, institutionIds]);

  // ── loading / empty states ─────────────────────────────────────────────────
  if (report === undefined) {
    return (
      <div className={className}>
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 border-[3px] border-church-green border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading IAFR report…</p>
        </div>
      </div>
    );
  }

  if (report === null) {
    return (
      <div className={className}>
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
          <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm font-medium">No IAFR breakdown records for this selection.</p>
        </div>
      </div>
    );
  }

  const net = report.grand_total.receipts - report.grand_total.expenses;

  // ── report ─────────────────────────────────────────────────────────────────
  return (
    <div className={className}>

      {/* ── branded header ── */}
      <div className="mb-6 pb-5 border-b border-gray-100">
        {!hideHeader && (
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
            <div>
              {/* diocese badge */}
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-church-green/70 mb-2">
                <span className="inline-block w-3 h-[2px] rounded-full bg-church-green/50" />
                Diocese of San Pablo
              </span>
              <h3 className="text-2xl font-extrabold text-gray-900 leading-tight">
                {institutionName}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Integrated Arancel &amp; Financial Report
              </p>
            </div>
            <div className="flex items-center gap-2 sm:flex-col sm:items-end">
              {year && (
                <span className="inline-flex items-center gap-1.5 bg-church-green text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-sm">
                  <svg className="w-3.5 h-3.5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  FY {year}
                </span>
              )}
              {report.timestamp && (
                <span className="text-[11px] text-gray-400">
                  Generated {new Date(report.timestamp).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── month picker — shown regardless of hideHeader; disabled without
             a year since a month alone is ambiguous (matches the backend's
             own rule of only narrowing when both are given together) ── */}
        <div className="flex items-center justify-end gap-2 mb-4">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-400" htmlFor="iafr-month-picker">
            Period
          </label>
          <select
            id="iafr-month-picker"
            value={selectedMonth ?? ''}
            disabled={!year}
            onChange={(e) => setSelectedMonth(e.target.value ? Number(e.target.value) : null)}
            className="bg-gray-100 border-none text-[11px] font-bold text-church-green rounded-lg px-3 py-1.5 outline-none cursor-pointer hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Full Year{year ? ` (${year})` : ''}</option>
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}{year ? ` ${year}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* ── summary strip — shown regardless of hideHeader, the totals are
             useful even when the caller supplies its own title/subtitle ── */}
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label={selectedMonth ? 'Receipts' : 'Total Receipts'} value={report.grand_total.receipts} accent="green" />
          <SummaryCard label={selectedMonth ? 'Expenses' : 'Total Expenses'} value={report.grand_total.expenses} accent="red"   />
          <SummaryCard label="Net Balance"     value={net}                           accent="blue"  />
        </div>
      </div>

      {/* ── table — fixed-height box with its own scroll, so expanding
           several sections doesn't blow up the surrounding page layout ── */}
      <div className="overflow-x-auto overflow-y-auto h-[600px] rounded-xl border border-gray-100 shadow-sm scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
        <table className="w-full text-sm border-collapse">

          {/* column headers — sticky so they stay visible while scrolling */}
          <thead className="sticky top-0 z-20">
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left py-3 px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[52%] sticky top-0 bg-gray-50">
                Account
              </th>
              <th className="text-right py-3 px-4 text-[11px] font-bold text-emerald-600 uppercase tracking-wider w-[16%] sticky top-0 bg-gray-50">
                Receipts
              </th>
              <th className="text-right py-3 px-4 text-[11px] font-bold text-rose-600 uppercase tracking-wider w-[16%] sticky top-0 bg-gray-50">
                Expenses
              </th>
              <th className="text-right py-3 px-4 text-[11px] font-bold text-sky-600 uppercase tracking-wider w-[16%] sticky top-0 bg-gray-50">
                Net
              </th>
            </tr>
          </thead>

          <tbody>
            {report.sections.map((section, sIdx) => {
              const isExpanded = expandedSections.has(section.code);
              const sectionNet = section.receipts - section.expenses;
              return (
              <React.Fragment key={section.code}>

                {/* ── section header — click to expand/collapse; collapsed
                     rows show the section's own totals inline so nothing is
                     lost by collapsing, only the account-level detail ── */}
                <tr className={sIdx > 0 ? 'border-t-2 border-gray-100' : ''}>
                  <td colSpan={4} className="py-0">
                    <button
                      type="button"
                      onClick={() => toggleSection(section.code)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-church-green/10 to-transparent border-l-4 border-church-green cursor-pointer hover:from-church-green/15 transition-colors text-left"
                    >
                      <ChevronIcon expanded={isExpanded} />
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-church-green text-white text-[11px] font-extrabold shadow-sm flex-shrink-0">
                        {section.code}
                      </span>
                      <span className="font-extrabold text-church-green uppercase tracking-wide text-[13px]">
                        {section.name}
                      </span>
                      {!isExpanded && (
                        <span className="ml-auto flex items-center gap-4 text-[12px] font-bold tabular-nums flex-shrink-0">
                          <span className="text-emerald-700">
                            {section.receipts !== 0 ? formatCurrency(section.receipts) : '—'}
                          </span>
                          <span className="text-rose-600">
                            {section.expenses !== 0 ? formatCurrency(section.expenses) : '—'}
                          </span>
                          <span className="w-24 text-right">
                            <NetAmount value={sectionNet} />
                          </span>
                        </span>
                      )}
                    </button>
                  </td>
                </tr>

                {isExpanded && section.subsections.map((subsection) => (
                  <React.Fragment key={subsection.code}>

                    {/* ── subsection label ── */}
                    <tr className="bg-gray-50/60 border-t border-gray-100">
                      <td colSpan={4} className="py-2 px-4 pl-14 text-[12px] font-bold text-gray-600 uppercase tracking-wide">
                        {subsection.name}
                      </td>
                    </tr>

                    {/* ── account lines ── */}
                    {subsection.accounts.map((account, aIdx) => (
                      <tr
                        key={account.code}
                        className={`border-t border-gray-50 transition-colors hover:bg-gray-50/80 ${
                          aIdx % 2 === 1 ? 'bg-white' : 'bg-gray-50/20'
                        }`}
                      >
                        <td className="py-2 px-4 pl-16 text-gray-600">
                          <span className="inline-block bg-gray-100 text-gray-500 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded mr-2">
                            {account.code}
                          </span>
                          {account.name}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-gray-700">
                          {account.receipts !== 0 ? (
                            <span className="text-emerald-700">{formatCurrency(account.receipts)}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-gray-700">
                          {account.expenses !== 0 ? (
                            <span className="text-rose-600">{formatCurrency(account.expenses)}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums">
                          <NetAmount value={account.receipts - account.expenses} />
                        </td>
                      </tr>
                    ))}

                    {/* ── subsection subtotal ── */}
                    <tr className="border-t border-dashed border-gray-200 bg-gray-50">
                      <td className="py-2 px-4 pl-14 text-[12px] font-bold text-gray-700 italic">
                        Subtotal — {subsection.name}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-bold text-emerald-700">
                        {subsection.receipts !== 0 ? formatCurrency(subsection.receipts) : '—'}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-bold text-rose-600">
                        {subsection.expenses !== 0 ? formatCurrency(subsection.expenses) : '—'}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-bold">
                        <NetAmount value={subsection.receipts - subsection.expenses} />
                      </td>
                    </tr>

                  </React.Fragment>
                ))}

                {/* ── section total — only when expanded; the collapsed
                     header row above already shows this same total inline,
                     so repeating it here would be redundant while collapsed ── */}
                {isExpanded && (
                  <tr className="bg-church-green/10 border-t-2 border-church-green/20">
                    <td className="py-2.5 px-4 font-extrabold text-church-green text-[13px]">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-church-green inline-block" />
                        Total — Section {section.code}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-extrabold text-emerald-700">
                      {section.receipts !== 0 ? formatCurrency(section.receipts) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-extrabold text-rose-600">
                      {section.expenses !== 0 ? formatCurrency(section.expenses) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-extrabold">
                      <NetAmount value={sectionNet} />
                    </td>
                  </tr>
                )}

              </React.Fragment>
              );
            })}
          </tbody>

          {/* ── grand total ── */}
          <tfoot>
            <tr className="bg-church-green border-t-2 border-church-green/60">
              <td className="py-4 px-4 font-extrabold text-white text-[14px] tracking-wide">
                <span className="inline-flex items-center gap-2">
                  <svg className="w-4 h-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a1 1 0 001-1V6a1 1 0 00-1-1H4a1 1 0 00-1 1v12a1 1 0 001 1z" />
                  </svg>
                  Grand Total
                </span>
              </td>
              <td className="py-4 px-4 text-right tabular-nums font-extrabold text-white text-[14px]">
                {formatCurrency(report.grand_total.receipts)}
              </td>
              <td className="py-4 px-4 text-right tabular-nums font-extrabold text-white text-[14px]">
                {formatCurrency(report.grand_total.expenses)}
              </td>
              <td className="py-4 px-4 text-right tabular-nums font-extrabold text-[14px]">
                <span className={net >= 0 ? 'text-emerald-200' : 'text-rose-200'}>
                  {net >= 0 ? '+' : ''}{formatCurrency(net)}
                </span>
              </td>
            </tr>
          </tfoot>

        </table>
      </div>

      {/* ── footer note ── */}
      <p className="mt-3 text-[11px] text-gray-400 text-right">
        All amounts in Philippine Peso (PHP) · Diocese of San Pablo Financial System
      </p>

    </div>
  );
}
