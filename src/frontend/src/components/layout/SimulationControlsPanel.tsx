'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  RotateCcw,
  Upload,
  AlertTriangle,
  History,
  Clock,
  Trash2,
  Copy,
  CalendarSearch,
  Loader2,
} from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

interface SandboxState {
  projectedCollections: number;
  projectedDisbursements: number;
  projectedRemittances: number;
  projectedExpenses: number;
  projectedBudgetAllocation: number;
}

interface SavedSandbox {
  id: string;
  name: string;
  institutionType: string;
  institutionId: string;
  state: SandboxState;
  uploadedFileName?: string;
  savedAt: number;
}

interface StateSnapshot {
  id: string;
  state: SandboxState;
  timestamp: number;
  label: string;
}

interface SimulationControlsPanelProps {
  institutionName: string;
  institutionType: 'parish' | 'seminary' | 'school';
  baselineHealthScore: number;
  baselineNet: number;
  currentSandboxState: SandboxState;
  onSandboxStateChange: (state: SandboxState) => void;
  onReset: () => void;
  onSave: () => void;
}

const STORAGE_KEY = 'admin_digital_twin_instances';
const HISTORY_KEY = 'digital_twin_state_history';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value);

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

export function SimulationControlsPanel({
  institutionName,
  institutionType,
  baselineHealthScore,
  baselineNet,
  currentSandboxState,
  onSandboxStateChange,
  onReset,
  onSave,
}: SimulationControlsPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [savedSandboxes, setSavedSandboxes] = useState<SavedSandbox[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [stateHistory, setStateHistory] = useState<StateSnapshot[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Period loader state
  const [periodMonth, setPeriodMonth] = useState<string>('Dec');
  const [periodYear, setPeriodYear] = useState<number>(2025);
  const [isLoadingPeriod, setIsLoadingPeriod] = useState(false);
  const [periodStatus, setPeriodStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleLoadPeriod = async () => {
    setIsLoadingPeriod(true);
    setPeriodStatus(null);
    try {
      const res = await fetch(
        `/api/financial/records?entityId=${encodeURIComponent(institutionName)}&entityType=${institutionType}`,
      );
      if (!res.ok) throw new Error('API error');
      const records: Array<{
        month: string;
        year?: number;
        collections: number;
        disbursements: number;
        consumableCollections: number;
        expenses_pastoral?: number;
        expenses_parish?: number;
        netReceipts?: number;
      }> = await res.json();

      // Match by month + year; fall back to month-only if no year on records
      const record =
        records.find((r) => r.month === periodMonth && r.year === periodYear) ??
        records.find((r) => r.month === periodMonth);

      if (!record) {
        setPeriodStatus({ ok: false, msg: `No data for ${periodMonth} ${periodYear}.` });
        return;
      }

      onSandboxStateChange({
        projectedCollections: record.collections,
        projectedDisbursements: record.expenses_pastoral ?? Math.round(record.disbursements * 0.35),
        projectedRemittances: Math.round(record.consumableCollections * 0.12),
        projectedExpenses: record.expenses_parish ?? Math.round(record.disbursements * 0.65),
        projectedBudgetAllocation:
          record.netReceipts != null
            ? Math.round(record.netReceipts * 0.8)
            : Math.round((record.collections - record.disbursements) * 0.8),
      });

      const yearNote = record.year ? ` ${record.year}` : '';
      setPeriodStatus({ ok: true, msg: `Loaded ${periodMonth}${yearNote} data.` });
    } catch {
      setPeriodStatus({ ok: false, msg: 'Failed to fetch records.' });
    } finally {
      setIsLoadingPeriod(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      setSavedSandboxes(JSON.parse(saved));
    } catch {
      setSavedSandboxes([]);
    }
  }, []);

  // Initialize history from sessionStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.sessionStorage.getItem(HISTORY_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setStateHistory(parsed);
      } catch {
        setStateHistory([]);
      }
    }
  }, []);

  // Track state changes in history
  useEffect(() => {
    if (!currentSandboxState) return;

    // Create a unique key for the current state to avoid duplicates
    const stateKey = JSON.stringify(currentSandboxState);
    const lastSnapshot = stateHistory[0];
    const lastStateKey = lastSnapshot ? JSON.stringify(lastSnapshot.state) : null;

    // Only add to history if state has actually changed
    if (stateKey !== lastStateKey) {
      setStateHistory((prev) => {
        const updated = [
          {
            id: `snapshot-${Date.now()}`,
            state: { ...currentSandboxState },
            timestamp: Date.now(),
            label: `Snapshot at ${formatTime(Date.now())}`,
          },
          ...prev,
        ].slice(0, 20); // Keep last 20 snapshots

        // Persist to sessionStorage
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        }

        return updated;
      });
    }
  }, [currentSandboxState]);

  const simulatedNet =
    currentSandboxState.projectedCollections -
    currentSandboxState.projectedDisbursements -
    currentSandboxState.projectedRemittances -
    currentSandboxState.projectedExpenses;

  const balanceDelta = simulatedNet - baselineNet + currentSandboxState.projectedBudgetAllocation * 0.15;

  const simulatedHealth = Math.max(20, Math.min(98, Math.round(baselineHealthScore + balanceDelta / 45000)));

  const simulatedRisk: 'Low' | 'Moderate' | 'High' =
    simulatedNet < 0 || simulatedHealth < 60 ? 'High' : simulatedHealth < 75 ? 'Moderate' : 'Low';

  const getRiskColor = (risk: string) => {
    if (risk === 'High') return 'text-rose-700';
    if (risk === 'Moderate') return 'text-amber-700';
    return 'text-emerald-700';
  };

  const advisoryMessage =
    simulatedNet >= baselineNet
      ? "The sandbox scenario improves the institution's net monthly position if those assumptions hold."
      : 'The sandbox scenario weakens resilience. Review disbursements, remittances, expenses, or budget allocation before acting.';

  const handleLoadSandbox = (item: SavedSandbox) => {
    onSandboxStateChange(item.state);
    setUploadedFileName(item.uploadedFileName ?? '');
  };

  const handleRevertToSnapshot = (snapshot: StateSnapshot) => {
    onSandboxStateChange(snapshot.state);
    setShowHistory(false);
  };

  const handleDeleteSnapshot = (id: string) => {
    setStateHistory((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      // Persist to sessionStorage
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      }
      return updated;
    });
  };

  const handleDuplicateSnapshot = (snapshot: StateSnapshot) => {
    onSandboxStateChange(snapshot.state);
  };

  if (isCollapsed) {
    return (
      <div className="flex shrink-0 items-start border-l border-gray-200 bg-white">
        <button
          onClick={() => setIsCollapsed(false)}
          className="m-3 rounded-xl bg-[#111111] p-3 text-white shadow-md hover:bg-[#282828] transition"
          title="Open Simulation Controls"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-[380px] shrink-0 flex-col overflow-hidden border-l border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-gradient-to-r from-[#111111] to-[#282828] px-4 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-white uppercase tracking-wide">Simulation</h2>
          <p className="mt-1 text-xs text-gray-300">{institutionName}</p>
        </div>
        <button onClick={() => setIsCollapsed(true)} className="rounded-lg p-2 hover:bg-white/10 transition">
          <ChevronRight className="h-5 w-5 text-white" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {showHistory ? (
          <div className="space-y-3 p-4">
            {/* Back Button */}
            <button
              onClick={() => setShowHistory(false)}
              className="flex items-center gap-2 text-xs font-black text-[#111111] hover:text-[#282828] transition"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back to Controls
            </button>

            {/* History Title */}
            <div className="pt-2">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-gray-500">
                Revert to Previous State
              </p>
              <p className="mt-1 text-xs text-gray-600">Load any snapshot from your session history</p>
            </div>

            {/* History Items */}
            <div className="space-y-2">
              {stateHistory.length > 0 ? (
                stateHistory.map((snapshot, idx) => (
                  <div key={snapshot.id} className="rounded-[16px] border border-gray-200 bg-[#faf8f4] p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-900 truncate">{snapshot.label}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          Collections: {formatCurrency(snapshot.state.projectedCollections)}
                        </p>
                      </div>
                      <div className="text-xs font-bold text-[#111111] bg-white px-2 py-1 rounded-full flex-shrink-0">
                        -{idx}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleRevertToSnapshot(snapshot)}
                        className="flex-1 flex items-center justify-center gap-1 rounded-[12px] bg-[#111111] text-white px-2 py-2 text-xs font-black hover:bg-[#282828] transition"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Revert
                      </button>
                      <button
                        onClick={() => handleDuplicateSnapshot(snapshot)}
                        className="flex items-center justify-center gap-1 rounded-[12px] border border-gray-200 px-2 py-2 text-xs font-black hover:bg-gray-50 transition"
                        title="Copy to current"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteSnapshot(snapshot.id)}
                        className="flex items-center justify-center gap-1 rounded-[12px] border border-rose-200 text-rose-700 px-2 py-2 text-xs font-black hover:bg-rose-50 transition"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[16px] border border-dashed border-gray-300 bg-[#faf8f4] px-3 py-6 text-center">
                  <Clock className="mx-auto h-5 w-5 text-gray-400 mb-2" />
                  <p className="text-xs font-semibold text-gray-500">No snapshots yet</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {/* Control Buttons */}
            <div className="flex gap-2">
              <button
                onClick={onReset}
                className="flex-1 rounded-[16px] border border-gray-200 px-3 py-2.5 text-xs font-black text-gray-700 transition hover:bg-gray-50 active:bg-gray-100"
              >
                Reset
              </button>
              <button
                onClick={onSave}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-[16px] bg-[#d4af37] px-3 py-2.5 text-xs font-black text-gray-900 transition hover:bg-[#c49d1f] active:bg-[#b89020]"
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </button>
            </div>

            {/* History Toggle */}
            <button
              onClick={() => setShowHistory(true)}
              className="w-full flex items-center justify-center gap-2 rounded-[16px] border border-gray-200 bg-white px-3 py-2.5 text-xs font-black text-gray-700 transition hover:bg-gray-50 active:bg-gray-100"
            >
              <History className="h-3.5 w-3.5" />
              View History ({stateHistory.length})
            </button>

            {/* ── Period Loader ───────────────────────────────────────── */}
            <div className="space-y-2 pt-2 border-t border-gray-200">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-gray-500">Load from Period</p>
              <p className="text-xs text-gray-500 leading-4">Auto-fill fields with a specific month's recorded data.</p>
              <div className="flex gap-2">
                <select
                  value={periodMonth}
                  onChange={(e) => setPeriodMonth(e.target.value)}
                  className="flex-1 rounded-[12px] border border-gray-200 bg-[#faf8f4] px-2 py-2 text-xs font-semibold text-gray-900 outline-none focus:border-[#d4af37]"
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={periodYear}
                  onChange={(e) => setPeriodYear(Number(e.target.value))}
                  className="w-20 rounded-[12px] border border-gray-200 bg-[#faf8f4] px-2 py-2 text-xs font-semibold text-gray-900 outline-none focus:border-[#d4af37]"
                >
                  {[2024, 2025, 2026].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleLoadPeriod}
                  disabled={isLoadingPeriod}
                  className="inline-flex items-center gap-1.5 rounded-[12px] bg-[#111111] px-3 py-2 text-xs font-black text-white transition hover:bg-[#282828] disabled:opacity-60"
                >
                  {isLoadingPeriod ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CalendarSearch className="h-3.5 w-3.5" />
                  )}
                  Load
                </button>
              </div>
              {periodStatus && (
                <p className={`text-xs font-semibold ${periodStatus.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {periodStatus.ok ? '✓' : '✕'} {periodStatus.msg}
                </p>
              )}
            </div>

            {/* Parameters Section */}
            <div className="space-y-2 pt-2 border-t border-gray-200">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-gray-500">Financial Parameters</p>
              {[
                ['projectedCollections', 'Collections', 'text-emerald-700'],
                ['projectedDisbursements', 'Disbursements', 'text-blue-700'],
                ['projectedRemittances', 'Remittances', 'text-purple-700'],
                ['projectedExpenses', 'Expenses', 'text-rose-700'],
                ['projectedBudgetAllocation', 'Budget', 'text-amber-700'],
              ].map(([key, label, color]) => (
                <label key={key} className="space-y-1.5 block">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${color}`}>{label}</span>
                    <span className="text-xs font-bold text-gray-600">
                      {formatCurrency(currentSandboxState[key as keyof SandboxState])}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={currentSandboxState[key as keyof SandboxState]}
                    onChange={(event) =>
                      onSandboxStateChange({
                        ...currentSandboxState,
                        [key]: Number(event.target.value || 0),
                      })
                    }
                    className="w-full rounded-[12px] border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                  />
                </label>
              ))}
            </div>

            {/* Metrics */}
            <div className="space-y-2 pt-3 border-t border-gray-200">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-gray-500">Impact Analysis</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[14px] bg-gradient-to-br from-gray-50 to-gray-100 p-3 border border-gray-200">
                  <p className="text-[10px] font-bold uppercase text-gray-500">Baseline</p>
                  <p className="mt-2 text-xs font-black text-gray-900">{formatCurrency(baselineNet)}</p>
                </div>
                <div
                  className={`rounded-[14px] bg-gradient-to-br ${simulatedNet >= baselineNet ? 'from-emerald-50 to-emerald-100' : 'from-rose-50 to-rose-100'} p-3 border ${simulatedNet >= baselineNet ? 'border-emerald-200' : 'border-rose-200'}`}
                >
                  <p className="text-[10px] font-bold uppercase text-gray-500">Scenario</p>
                  <p
                    className={`mt-2 text-xs font-black ${simulatedNet >= baselineNet ? 'text-emerald-700' : 'text-rose-700'}`}
                  >
                    {formatCurrency(simulatedNet)}
                  </p>
                </div>
              </div>

              <div className="rounded-[14px] bg-gradient-to-r from-blue-50 to-indigo-50 p-3 border border-blue-200 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-blue-700">Health Score</p>
                  <p className="text-sm font-black text-blue-900">
                    {baselineHealthScore} → {simulatedHealth}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-blue-700">Simulated Risk</p>
                  <p className={`text-xs font-black ${getRiskColor(simulatedRisk)}`}>{simulatedRisk}</p>
                </div>
              </div>
            </div>

            {/* Advisory */}
            <div className="rounded-[14px] border border-amber-200 bg-amber-50 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700 flex-shrink-0" />
                <p className="text-xs font-semibold leading-5 text-amber-900">{advisoryMessage}</p>
              </div>
            </div>

            {/* File Upload — overrides all fields */}
            <div className="rounded-[14px] border border-dashed border-gray-300 bg-[#faf8f4] p-3 space-y-2">
              <div>
                <p className="text-xs font-bold text-gray-900">Upload Financial Report</p>
                <p className="text-xs text-gray-500 leading-4 mt-0.5">CSV values will override all fields below.</p>
              </div>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-700 transition hover:border-[#d4af37] hover:bg-[#faf8f4]">
                <Upload className="h-3.5 w-3.5" />
                Choose CSV File
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setUploadedFileName(file.name);
                    setPeriodStatus(null);

                    try {
                      const csvText = await file.text();
                      const res = await fetch('/api/financial/parse', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          csv: csvText,
                          entityId: institutionName,
                          entityType: institutionType,
                        }),
                      });
                      if (!res.ok) throw new Error('Parse failed');

                      const records: Array<{
                        collections: number;
                        consumableCollections: number;
                        disbursements: number;
                        expenses_pastoral?: number;
                        expenses_parish?: number;
                        netReceipts?: number;
                      }> = await res.json();

                      if (!records.length) {
                        setPeriodStatus({ ok: false, msg: 'No records found in file.' });
                        return;
                      }

                      // Aggregate all rows from the file
                      let sumCollections = 0,
                        sumConsumable = 0,
                        sumDisbursements = 0;
                      let sumPastoral = 0,
                        sumParish = 0,
                        sumNet = 0;
                      for (const r of records) {
                        sumCollections += r.collections;
                        sumConsumable += r.consumableCollections;
                        sumDisbursements += r.disbursements;
                        sumPastoral += r.expenses_pastoral ?? Math.round(r.disbursements * 0.35);
                        sumParish += r.expenses_parish ?? Math.round(r.disbursements * 0.65);
                        sumNet += r.netReceipts ?? r.collections - r.disbursements;
                      }

                      onSandboxStateChange({
                        projectedCollections: sumCollections,
                        projectedDisbursements: sumPastoral,
                        projectedRemittances: Math.round(sumConsumable * 0.12),
                        projectedExpenses: sumParish,
                        projectedBudgetAllocation: Math.round(sumNet * 0.8),
                      });

                      setPeriodStatus({
                        ok: true,
                        msg: `${file.name} — ${records.length} row${records.length > 1 ? 's' : ''} applied.`,
                      });
                    } catch {
                      setPeriodStatus({ ok: false, msg: 'Failed to parse file.' });
                    }
                  }}
                />
              </label>
              {uploadedFileName ? (
                <p className="text-xs font-semibold text-emerald-700">✓ {uploadedFileName}</p>
              ) : (
                <p className="text-xs text-gray-400">No file attached</p>
              )}
              {periodStatus && (
                <p className={`text-xs font-semibold ${periodStatus.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {periodStatus.ok ? '✓' : '✕'} {periodStatus.msg}
                </p>
              )}
            </div>

            {/* Saved Instances */}
            <div className="space-y-2 pt-2 border-t border-gray-200">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-gray-500">
                Saved Scenarios ({savedSandboxes.length})
              </p>
              {savedSandboxes.length > 0 ? (
                <div className="space-y-2">
                  {savedSandboxes.slice(0, 4).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleLoadSandbox(item)}
                      className="w-full rounded-[12px] border border-gray-200 bg-white p-2.5 text-left transition hover:border-[#d4af37] hover:bg-[#faf8f4] active:bg-gray-100"
                    >
                      <p className="text-xs font-bold text-gray-900 truncate">{item.name}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {new Date(item.savedAt).toLocaleDateString('en-US')} at{' '}
                        {new Date(item.savedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </button>
                  ))}
                  {savedSandboxes.length > 4 && (
                    <p className="text-xs text-gray-500 text-center font-bold">
                      +{savedSandboxes.length - 4} more saved
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-[12px] border border-dashed border-gray-300 bg-[#faf8f4] px-3 py-4 text-center">
                  <p className="text-xs font-semibold text-gray-500">No saved scenarios</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
