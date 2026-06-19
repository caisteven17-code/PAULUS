'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  RotateCcw,
  AlertTriangle,
  History,
  Clock,
  Trash2,
  Copy,
  CalendarSearch,
  Loader2,
  ShieldCheck,
  PlayCircle,
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { apiClient } from '../../lib/api-client';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const CURRENT_YEAR = new Date().getFullYear();
const PERIOD_YEARS = Array.from({ length: CURRENT_YEAR - 2023 + 1 }, (_, i) => 2023 + i);

/** Sandbox values keyed by field name; the active key set depends on institution type. */
export type SandboxState = Record<string, number>;

interface SandboxField {
  key: string;
  label: string;
  color: string;
}

/** Which fields the sandbox panel shows, per institution type. School/seminary sets
 *  are draft simplifications — labels/groupings can be refined later. */
const SANDBOX_FIELD_CONFIG: Record<'parish' | 'school' | 'seminary', SandboxField[]> = {
  parish: [
    { key: 'totalSacraments', label: 'Total Sacraments', color: 'text-emerald-700' },
    { key: 'totalCollections', label: 'Total Collections', color: 'text-emerald-700' },
    { key: 'totalPastoralExpenses', label: 'Total Pastoral Expenses (Mass Stipend)', color: 'text-rose-700' },
    { key: 'totalParishExpenses', label: 'Total Parish Expenses', color: 'text-blue-700' },
    { key: 'totalMassIntentionsUnclaimed', label: 'Total Mass Intentions (Not Claimed by Priest)', color: 'text-purple-700' },
    { key: 'totalMassIntentionsClaimed', label: 'Total Mass Intentions (Claimed by Priest)', color: 'text-purple-700' },
    { key: 'totalSpecialCollections', label: 'Total Special Collections', color: 'text-amber-700' },
  ],
  school: [
    { key: 'totalCollections', label: 'Total Collections', color: 'text-emerald-700' },
    { key: 'totalPayroll', label: 'Total Faculty Payroll', color: 'text-rose-700' },
    { key: 'totalOperatingExpenses', label: 'Total Operating Expenses', color: 'text-blue-700' },
  ],
  seminary: [
    { key: 'totalCollections', label: 'Total Collections', color: 'text-emerald-700' },
    { key: 'totalPayroll', label: 'Total Payroll & Incentives', color: 'text-rose-700' },
    { key: 'totalOperatingExpenses', label: 'Total Operating Expenses', color: 'text-blue-700' },
  ],
};

/** Collapses whichever per-type sandbox fields are active into the two aggregate
 *  numbers the counterfactual-replay endpoint and the impact-analysis math expect. */
function computeReceiptsAndExpenses(
  institutionType: 'parish' | 'seminary' | 'school',
  state: SandboxState,
): { receipts: number; expenses: number } {
  if (institutionType === 'parish') {
    return {
      receipts:
        (state.totalSacraments ?? 0) +
        (state.totalCollections ?? 0) +
        (state.totalSpecialCollections ?? 0) +
        (state.totalMassIntentionsClaimed ?? 0) +
        (state.totalMassIntentionsUnclaimed ?? 0),
      expenses: (state.totalPastoralExpenses ?? 0) + (state.totalParishExpenses ?? 0),
    };
  }
  return {
    receipts: state.totalCollections ?? 0,
    expenses: (state.totalPayroll ?? 0) + (state.totalOperatingExpenses ?? 0),
  };
}

/** A Digital Twin scenario row from diocese.digital_twin_scenarios (private to creator). */
interface SavedScenario {
  id: string;
  name: string;
  institutionType: string;
  institutionId: string | null;
  institutionName: string;
  startingMonth: number | null;
  startingYear: number | null;
  modifiedValues: SandboxState;
  replayResults?: ReplayResult | null;
  createdAt: string;
}

interface StateSnapshot {
  id: string;
  state: SandboxState;
  timestamp: number;
  label: string;
}

interface ReplayPoint {
  period: string;
  net: number;
  cumulative_net: number;
  health_score: number;
}

interface ReplayResult {
  modified_period: string;
  original_values: { receipts: number; expenses: number };
  modified_values: { receipts: number; expenses: number };
  actual_trajectory: ReplayPoint[];
  counterfactual_trajectory: ReplayPoint[];
  divergence: {
    periods_compared: number;
    cumulative_net_delta: number;
    final_health_delta: number;
  };
}

interface DigitalTwinControlsPanelProps {
  institutionName: string;
  institutionType: 'parish' | 'seminary' | 'school';
  institutionId: string;
  baselineHealthScore: number;
  baselineNet: number;
  currentSandboxState: SandboxState;
  onSandboxStateChange: (state: SandboxState) => void;
  onReset: () => void;
}

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

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function DigitalTwinControlsPanel({
  institutionName,
  institutionType,
  institutionId,
  baselineHealthScore,
  baselineNet,
  currentSandboxState,
  onSandboxStateChange,
  onReset,
}: DigitalTwinControlsPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [stateHistory, setStateHistory] = useState<StateSnapshot[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Period loader state (shared by Load-from-Period and Historical Replay)
  const [periodMonth, setPeriodMonth] = useState<string>('Dec');
  const [periodYear, setPeriodYear] = useState<number>(CURRENT_YEAR);
  const [isLoadingPeriod, setIsLoadingPeriod] = useState(false);
  const [periodStatus, setPeriodStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Historical counterfactual replay state
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null);
  const [replayStatus, setReplayStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Save-scenario modal state
  const [saveModal, setSaveModal] = useState<{ open: boolean; name: string }>({ open: false, name: '' });
  const [isSaving, setIsSaving] = useState(false);

  // Scenario comparison state (up to 3 scenarios with replay results)
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [compareMetric, setCompareMetric] = useState<'cumulative_net' | 'health_score'>('cumulative_net');

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 3 ? prev : [...prev, id],
    );
  };

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
        sacraments_rate?: number;
        collections_mass?: number;
        others_massIntentionsClaimed?: number;
        others_massIntentionsNotClaimed?: number;
        others_specialCollections?: number;
      }> = await res.json();

      // Match by month + year; fall back to month-only if no year on records
      const record =
        records.find((r) => r.month === periodMonth && r.year === periodYear) ??
        records.find((r) => r.month === periodMonth);

      if (!record) {
        setPeriodStatus({ ok: false, msg: `No data for ${periodMonth} ${periodYear}.` });
        return;
      }

      if (institutionType === 'parish') {
        onSandboxStateChange({
          totalSacraments: record.sacraments_rate ?? 0,
          totalCollections: record.collections_mass ?? 0,
          totalPastoralExpenses: record.expenses_pastoral ?? Math.round(record.disbursements * 0.35),
          totalParishExpenses: record.expenses_parish ?? Math.round(record.disbursements * 0.65),
          totalMassIntentionsUnclaimed: record.others_massIntentionsNotClaimed ?? 0,
          totalMassIntentionsClaimed: record.others_massIntentionsClaimed ?? 0,
          totalSpecialCollections: record.others_specialCollections ?? 0,
        });
      } else {
        onSandboxStateChange({
          totalCollections: record.collections,
          totalPayroll: record.expenses_pastoral ?? Math.round(record.disbursements * 0.35),
          totalOperatingExpenses: record.expenses_parish ?? Math.round(record.disbursements * 0.65),
        });
      }

      const yearNote = record.year ? ` ${record.year}` : '';
      setPeriodStatus({ ok: true, msg: `Loaded ${periodMonth}${yearNote} data.` });
    } catch {
      setPeriodStatus({ ok: false, msg: 'Failed to fetch records.' });
    } finally {
      setIsLoadingPeriod(false);
    }
  };

  // Replays history from the selected period with the adjusted values above,
  // showing how the difference would have compounded up until today.
  const handleRunReplay = async () => {
    if (!isUuid(institutionId)) {
      setReplayStatus({ ok: false, msg: 'Replay needs a registered institution (demo data has no history).' });
      return;
    }
    setIsReplaying(true);
    setReplayStatus(null);
    try {
      const { receipts, expenses } = computeReceiptsAndExpenses(institutionType, currentSandboxState);
      const result: ReplayResult = await apiClient.runDigitalTwinReplay(institutionType, institutionId, {
        start_month: MONTHS.indexOf(periodMonth as (typeof MONTHS)[number]) + 1,
        start_year: periodYear,
        modified_receipts: receipts,
        modified_expenses: expenses,
      });
      setReplayResult(result);
      setReplayStatus({
        ok: true,
        msg: `Replayed ${result.divergence.periods_compared} month${result.divergence.periods_compared > 1 ? 's' : ''} from ${result.modified_period}.`,
      });
    } catch (error: any) {
      const detail = String(error?.message ?? '').split('→ 400')[0] || 'Replay failed.';
      setReplayStatus({ ok: false, msg: `Replay failed — check that ${periodMonth} ${periodYear} has a record.` });
      console.error('[DigitalTwin] replay failed:', detail);
    } finally {
      setIsReplaying(false);
    }
  };

  // Load saved scenarios from the DB (only the current user's rows come back)
  useEffect(() => {
    apiClient
      .listDigitalTwinScenarios()
      .then((rows) => setSavedScenarios(rows || []))
      .catch(() => setSavedScenarios([]));
  }, []);

  const handleSaveScenario = async (name: string) => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const scenario = await apiClient.createDigitalTwinScenario({
        institutionType,
        institutionId: isUuid(institutionId) ? institutionId : null,
        institutionName,
        name: name.trim(),
        startingMonth: MONTHS.indexOf(periodMonth as (typeof MONTHS)[number]) + 1,
        startingYear: periodYear,
        modifiedValues: { ...currentSandboxState },
        replayResults: replayResult ?? undefined,
      });
      setSavedScenarios([scenario, ...savedScenarios]);
      setSaveModal({ open: false, name: '' });
    } catch (error: any) {
      const detail =
        String(error?.message ?? '').split('→ 400: ')[1] ?? 'Could not save the scenario. Please try again.';
      alert(detail);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadScenario = (item: SavedScenario) => {
    onSandboxStateChange(item.modifiedValues);
    if (item.startingMonth) setPeriodMonth(MONTHS[item.startingMonth - 1]);
    if (item.startingYear) setPeriodYear(item.startingYear);
    setReplayResult(item.replayResults ?? null);
  };

  const handleDeleteScenario = async (id: string) => {
    if (!confirm('Delete this scenario?')) return;
    try {
      await apiClient.deleteDigitalTwinScenario(id);
      setSavedScenarios(savedScenarios.filter((s) => s.id !== id));
      setCompareIds((prev) => prev.filter((x) => x !== id));
    } catch (error) {
      console.error('[DigitalTwin] failed to delete scenario:', error);
    }
  };

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

  const { receipts: simulatedReceipts, expenses: simulatedExpenses } = computeReceiptsAndExpenses(
    institutionType,
    currentSandboxState,
  );
  const simulatedNet = simulatedReceipts - simulatedExpenses;

  const balanceDelta = simulatedNet - baselineNet;

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
      ? "This Digital Twin projection improves the institution's net monthly position if those assumptions hold."
      : 'This Digital Twin projection weakens resilience. Review your adjusted collections and expenses before acting.';

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
          title="Open Digital Twin Controls"
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
          <h2 className="text-sm font-black text-white uppercase tracking-wide">Digital Twin</h2>
          <p className="mt-1 text-xs text-gray-300">{institutionName}</p>
        </div>
        <button onClick={() => setIsCollapsed(true)} className="rounded-lg p-2 hover:bg-white/10 transition">
          <ChevronRight className="h-5 w-5 text-white" />
        </button>
      </div>

      {/* Sandbox notice */}
      <div className="flex-shrink-0 flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2">
        <ShieldCheck className="h-3.5 w-3.5 text-amber-700 shrink-0" />
        <p className="text-[11px] font-semibold leading-4 text-amber-800">
          Sandbox only — official records and analytics are never modified.
        </p>
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
                          Collections: {formatCurrency(snapshot.state.totalCollections ?? 0)}
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
                onClick={() => setSaveModal({ open: true, name: '' })}
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
                  {PERIOD_YEARS.map((y) => (
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
              {SANDBOX_FIELD_CONFIG[institutionType].map(({ key, label, color }) => (
                <label key={key} className="space-y-1.5 block">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${color}`}>{label}</span>
                    <span className="text-xs font-bold text-gray-600">
                      {formatCurrency(currentSandboxState[key] ?? 0)}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={currentSandboxState[key] ?? 0}
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

            {/* ── Historical What-If Replay ───────────────────────────── */}
            <div className="space-y-2 pt-2 border-t border-gray-200">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-gray-500">Historical Replay</p>
              <p className="text-xs text-gray-500 leading-4">
                Pretend {periodMonth} {periodYear} had the adjusted values above, then replay every month since to see
                how the difference compounds up to today.
              </p>
              <button
                onClick={handleRunReplay}
                disabled={isReplaying}
                className="w-full inline-flex items-center justify-center gap-2 rounded-[12px] bg-[#111111] px-3 py-2.5 text-xs font-black text-white transition hover:bg-[#282828] disabled:opacity-60"
              >
                {isReplaying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlayCircle className="h-3.5 w-3.5" />
                )}
                {isReplaying ? 'Replaying…' : `Replay from ${periodMonth} ${periodYear}`}
              </button>
              {replayStatus && (
                <p className={`text-xs font-semibold ${replayStatus.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {replayStatus.ok ? '✓' : '✕'} {replayStatus.msg}
                </p>
              )}

              {replayResult && (
                <div className="space-y-2">
                  <ReactECharts
                    style={{ height: '200px', width: '100%' }}
                    option={{
                      tooltip: {
                        trigger: 'axis',
                        formatter: (params: any) =>
                          params
                            .map((p: any) => `${p.seriesName}: ${formatCurrency(Number(p.value ?? 0))}`)
                            .join('<br/>'),
                      },
                      legend: {
                        data: ['Actual', 'What-If'],
                        textStyle: { fontSize: 10 },
                        top: 0,
                      },
                      grid: { left: 48, right: 8, bottom: 20, top: 24 },
                      xAxis: {
                        type: 'category',
                        data: replayResult.actual_trajectory.map((d) => d.period),
                        axisLabel: { fontSize: 9, color: '#9CA3AF' },
                      },
                      yAxis: {
                        type: 'value',
                        axisLabel: {
                          formatter: (v: number) => `${Math.round(v / 1000)}k`,
                          fontSize: 9,
                          color: '#9CA3AF',
                        },
                      },
                      series: [
                        {
                          name: 'Actual',
                          type: 'line',
                          data: replayResult.actual_trajectory.map((d) => d.cumulative_net),
                          smooth: true,
                          lineStyle: { color: '#9CA3AF', width: 2, type: 'dashed' },
                          itemStyle: { color: '#9CA3AF' },
                          symbol: 'none',
                        },
                        {
                          name: 'What-If',
                          type: 'line',
                          data: replayResult.counterfactual_trajectory.map((d) => d.cumulative_net),
                          smooth: true,
                          lineStyle: { color: '#d4af37', width: 3 },
                          itemStyle: { color: '#d4af37' },
                          symbol: 'none',
                        },
                      ],
                    }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-[12px] bg-[#faf8f4] border border-gray-200 p-2.5">
                      <p className="text-[10px] font-bold uppercase text-gray-500">Cumulative Net Δ</p>
                      <p
                        className={`mt-1 text-xs font-black ${replayResult.divergence.cumulative_net_delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}
                      >
                        {replayResult.divergence.cumulative_net_delta >= 0 ? '+' : ''}
                        {formatCurrency(replayResult.divergence.cumulative_net_delta)}
                      </p>
                    </div>
                    <div className="rounded-[12px] bg-[#faf8f4] border border-gray-200 p-2.5">
                      <p className="text-[10px] font-bold uppercase text-gray-500">Health Today Δ</p>
                      <p
                        className={`mt-1 text-xs font-black ${replayResult.divergence.final_health_delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}
                      >
                        {replayResult.divergence.final_health_delta >= 0 ? '+' : ''}
                        {replayResult.divergence.final_health_delta} pts
                      </p>
                    </div>
                  </div>
                </div>
              )}
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
                  <p className="text-xs font-bold text-blue-700">Projected Risk</p>
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

            {/* Saved Scenarios (private to the current user) */}
            <div className="space-y-2 pt-2 border-t border-gray-200">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-gray-500">
                Saved Scenarios ({savedScenarios.length})
              </p>
              {savedScenarios.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 leading-4">
                    Tick up to 3 scenarios with replay results to compare them side by side.
                  </p>
                  {savedScenarios.slice(0, 8).map((item) => {
                    const comparable = Boolean(item.replayResults?.counterfactual_trajectory?.length);
                    const checked = compareIds.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`w-full rounded-[12px] border bg-white p-2.5 transition ${checked ? 'border-[#d4af37] ring-1 ring-[#d4af37]/30' : 'border-gray-200 hover:border-[#d4af37]'}`}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!comparable || (!checked && compareIds.length >= 3)}
                            onChange={() => toggleCompare(item.id)}
                            title={comparable ? 'Select for comparison' : 'Run a replay before saving to compare this scenario'}
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#d4af37] disabled:opacity-30"
                          />
                          <button onClick={() => handleLoadScenario(item)} className="min-w-0 flex-1 text-left">
                            <p className="text-xs font-bold text-gray-900 truncate">{item.name}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {item.institutionName}
                              {item.startingMonth
                                ? ` — from ${MONTHS[item.startingMonth - 1]} ${item.startingYear}`
                                : ''}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-400">
                              {new Date(item.createdAt).toLocaleDateString('en-US')}
                              {!comparable && ' • no replay data'}
                            </p>
                          </button>
                        </div>
                        <button
                          onClick={() => handleDeleteScenario(item.id)}
                          className="mt-1.5 w-full rounded-[10px] border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-700 transition hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    );
                  })}
                  {savedScenarios.length > 8 && (
                    <p className="text-xs text-gray-500 text-center font-bold">
                      +{savedScenarios.length - 8} more saved
                    </p>
                  )}
                  {compareIds.length >= 2 && (
                    <button
                      onClick={() => setShowCompare(true)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-[12px] bg-[#d4af37] px-3 py-2.5 text-xs font-black text-gray-900 transition hover:bg-[#c49d1f]"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Compare Selected ({compareIds.length})
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-[12px] border border-dashed border-gray-300 bg-[#faf8f4] px-3 py-4 text-center">
                  <p className="text-xs font-semibold text-gray-500">No saved scenarios</p>
                  <p className="mt-1 text-[10px] text-gray-400">Only you can see scenarios you save.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Compare Scenarios Modal */}
      {showCompare &&
        (() => {
          const selected = savedScenarios.filter(
            (s) => compareIds.includes(s.id) && s.replayResults?.counterfactual_trajectory?.length,
          );
          if (selected.length < 2) return null;

          const periods = Array.from(
            new Set(selected.flatMap((s) => s.replayResults!.counterfactual_trajectory.map((p) => p.period))),
          ).sort();
          const colors = ['#d4af37', '#6366f1', '#10b981'];
          const isNet = compareMetric === 'cumulative_net';

          // Baseline = actual trajectory from the scenario covering the longest window
          const actualSource = selected.reduce((a, b) =>
            a.replayResults!.actual_trajectory.length >= b.replayResults!.actual_trajectory.length ? a : b,
          );
          const actualByPeriod = new Map<string, number>(
            actualSource.replayResults!.actual_trajectory.map((p) => [p.period, p[compareMetric]]),
          );

          const series = [
            {
              name: 'Actual',
              type: 'line',
              data: periods.map((p) => actualByPeriod.get(p) ?? null),
              smooth: true,
              connectNulls: true,
              lineStyle: { color: '#9CA3AF', width: 2, type: 'dashed' },
              itemStyle: { color: '#9CA3AF' },
              symbol: 'none',
            },
            ...selected.map((s, i) => {
              const byPeriod = new Map<string, number>(
                s.replayResults!.counterfactual_trajectory.map((p) => [p.period, p[compareMetric]]),
              );
              return {
                name: s.name,
                type: 'line',
                data: periods.map((p) => byPeriod.get(p) ?? null),
                smooth: true,
                connectNulls: true,
                lineStyle: { color: colors[i], width: 3 },
                itemStyle: { color: colors[i] },
                symbol: 'none',
              };
            }),
          ];

          return (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-lg">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-gray-900">Compare Scenarios</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      What-if trajectories vs the actual record. Visible only to you.
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1 rounded-xl bg-gray-100 p-1">
                    {(
                      [
                        ['cumulative_net', 'Net'],
                        ['health_score', 'Health'],
                      ] as const
                    ).map(([metric, label]) => (
                      <button
                        key={metric}
                        onClick={() => setCompareMetric(metric)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                          compareMetric === metric ? 'bg-[#111111] text-white' : 'text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <ReactECharts
                  style={{ height: '300px', width: '100%' }}
                  option={{
                    tooltip: {
                      trigger: 'axis',
                      formatter: (params: any) =>
                        params
                          .filter((p: any) => p.value != null)
                          .map(
                            (p: any) =>
                              `${p.seriesName}: ${isNet ? formatCurrency(Number(p.value)) : `${Number(p.value).toFixed(1)} pts`}`,
                          )
                          .join('<br/>'),
                    },
                    legend: { textStyle: { fontSize: 10 }, top: 0 },
                    grid: { left: 56, right: 12, bottom: 24, top: 32 },
                    xAxis: {
                      type: 'category',
                      data: periods,
                      axisLabel: { fontSize: 9, color: '#9CA3AF' },
                    },
                    yAxis: {
                      type: 'value',
                      scale: !isNet,
                      axisLabel: {
                        formatter: (v: number) => (isNet ? `${Math.round(v / 1000)}k` : String(v)),
                        fontSize: 9,
                        color: '#9CA3AF',
                      },
                    },
                    series,
                  }}
                />

                {/* Divergence summary per scenario */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {selected.map((s, i) => (
                    <div key={s.id} className="rounded-[14px] border border-gray-200 bg-[#faf8f4] p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[i] }} />
                        <p className="truncate text-xs font-black text-gray-900">{s.name}</p>
                      </div>
                      <p className="mt-1 text-[10px] text-gray-500">
                        Modified {s.replayResults!.modified_period} • {s.replayResults!.divergence.periods_compared}{' '}
                        months
                      </p>
                      <p
                        className={`mt-1.5 text-xs font-black ${s.replayResults!.divergence.cumulative_net_delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}
                      >
                        {s.replayResults!.divergence.cumulative_net_delta >= 0 ? '+' : ''}
                        {formatCurrency(s.replayResults!.divergence.cumulative_net_delta)} net
                      </p>
                      <p
                        className={`text-xs font-bold ${s.replayResults!.divergence.final_health_delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}
                      >
                        {s.replayResults!.divergence.final_health_delta >= 0 ? '+' : ''}
                        {s.replayResults!.divergence.final_health_delta} pts health
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => setShowCompare(false)}
                    className="rounded-xl border border-gray-200 px-5 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Save Scenario Modal */}
      {saveModal.open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-black text-gray-900">Save Digital Twin Scenario</h3>
            <p className="text-xs text-gray-500">
              Saves the adjusted values{replayResult ? ' and replay results' : ''} for {institutionName}. Visible only
              to you.
            </p>
            <input
              type="text"
              value={saveModal.name}
              onChange={(e) => setSaveModal({ ...saveModal, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveScenario(saveModal.name);
                if (e.key === 'Escape') setSaveModal({ open: false, name: '' });
              }}
              autoFocus
              placeholder="Enter scenario name"
              className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSaveModal({ open: false, name: '' })}
                className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveScenario(saveModal.name)}
                disabled={!saveModal.name.trim() || isSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-[#d4af37] px-5 py-2 text-xs font-black text-gray-900 transition hover:bg-[#c49d1f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
