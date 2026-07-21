'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, History, Loader2, Plus, RefreshCw, Search, Trash2, Users } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';

type Priest = { id: string; name: string };
type Parish = { id: string; name: string; institutionCode?: string; district?: string; vicariate?: string };
type Assignment = {
  id: string;
  priestId: string;
  priestName: string;
  parishId: string;
  parishName: string;
  startDate: string;
  endDate?: string | null;
  status: string;
  isActive: boolean;
};
type Move = { priestId: string; toParishId: string };

export function PriestReassignmentManagement() {
  const { user } = usePermissions();
  const [activeSection, setActiveSection] = useState<'assignments' | 'planner' | 'history'>('assignments');
  const [priests, setPriests] = useState<Priest[]>([]);
  const [parishes, setParishes] = useState<Parish[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [preview, setPreview] = useState<any | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const headers = () => ({
    'Content-Type': 'application/json',
    'x-user-id': String(user?.id || user?.uid || ''),
    'x-user-name': String(user?.displayName || user?.name || user?.email || 'Authorized user'),
    'x-user-role': String(user?.accessRole || user?.roleId || user?.role || ''),
  });

  const loadWorkspace = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/entities/priest-reassignment/workspace', { headers: headers() });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to load Parish Priest assignments.');
      setPriests(body.priests || []);
      setParishes(body.parishes || []);
      setAssignments(body.assignments || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Parish Priest assignments.');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/entities/priest-reassignment/history', { headers: headers() });
      const body = await response.json().catch(() => []);
      if (!response.ok) throw new Error(body.error || 'Unable to load reassignment history.');
      setHistoryRows(Array.isArray(body) ? body : []);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Unable to load reassignment history.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (user) loadWorkspace();
  }, [user]);

  const activeAssignments = useMemo(() => assignments.filter((assignment) => assignment.isActive), [assignments]);
  const assignmentByPriest = useMemo(
    () => new Map(activeAssignments.map((assignment) => [assignment.priestId, assignment])),
    [activeAssignments],
  );
  const filteredAssignments = activeAssignments.filter((assignment) =>
    `${assignment.priestName} ${assignment.parishName}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const vacantParishes = parishes.filter(
    (parish) => !activeAssignments.some((assignment) => assignment.parishId === parish.id),
  );

  const addMove = () => {
    const firstAvailable = priests.find(
      (priest) => assignmentByPriest.has(priest.id) && !moves.some((move) => move.priestId === priest.id),
    );
    if (!firstAvailable) {
      setError('Every currently assigned priest is already included in the plan.');
      return;
    }
    setMoves((current) => [...current, { priestId: firstAvailable.id, toParishId: '' }]);
    setPreview(null);
    setConfirmation('');
    setError('');
  };

  const updateMove = (index: number, next: Partial<Move>) => {
    setMoves((current) => current.map((move, moveIndex) => (moveIndex === index ? { ...move, ...next } : move)));
    setPreview(null);
    setConfirmation('');
    setError('');
  };

  const removeMove = (index: number) => {
    setMoves((current) => current.filter((_, moveIndex) => moveIndex !== index));
    setPreview(null);
    setConfirmation('');
    setError('');
  };

  const previewMoves = async () => {
    if (!moves.length || moves.some((move) => !move.priestId || !move.toParishId)) {
      setError('Select a priest and destination parish for every row.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/entities/priest-reassignment/preview', {
        method: 'POST', headers: headers(), body: JSON.stringify({ moves }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to preview this reassignment.');
      setPreview(body);
      setConfirmation('');
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Unable to preview this reassignment.');
    } finally {
      setBusy(false);
    }
  };

  const executeMoves = async () => {
    if (confirmation !== 'REASSIGN') {
      setError('Type REASSIGN exactly to confirm these assignments.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/entities/priest-reassignment/execute', {
        method: 'POST', headers: headers(), body: JSON.stringify({ moves }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The reassignment failed. No assignments were changed.');
      setSuccess(`${body.assignmentCount} Parish Priest assignment(s) updated successfully.`);
      setMoves([]);
      setPreview(null);
      setConfirmation('');
      setActiveSection('assignments');
      await loadWorkspace();
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : 'The reassignment failed. No assignments were changed.');
    } finally {
      setBusy(false);
    }
  };

  const switchSection = (section: 'assignments' | 'planner' | 'history') => {
    setActiveSection(section);
    setError('');
    setSuccess('');
    if (section === 'history') loadHistory();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-5 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[28px] bg-slate-950 px-7 py-8 text-white shadow-xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-400">Priest Management</p>
              <h1 className="mt-2 font-serif text-3xl font-bold md:text-4xl">Parish Priest Reassignment</h1>
              <p className="mt-2 max-w-2xl text-sm font-medium text-white/50">Plan a transfer, swap, or rotation and apply every assignment together.</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Assigned" value={activeAssignments.length} />
              <Metric label="Vacant" value={vacantParishes.length} />
              <Metric label="Priests" value={priests.length} />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <Tab active={activeSection === 'assignments'} onClick={() => switchSection('assignments')} icon={Users}>Current Assignments</Tab>
          <Tab active={activeSection === 'planner'} onClick={() => switchSection('planner')} icon={ArrowRight}>Reassign Priests</Tab>
          <Tab active={activeSection === 'history'} onClick={() => switchSection('history')} icon={History}>History</Tab>
        </div>

        {success && <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" />{success}</div>}
        {error && <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />{error}</div>}

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-amber-500" /></div>
        ) : activeSection === 'assignments' ? (
          <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative max-w-md flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search priest or parish" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-amber-400" /></div>
              <button onClick={loadWorkspace} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" />Refresh</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400"><th className="px-6 py-4">Parish Priest</th><th className="px-6 py-4">Current Parish</th><th className="px-6 py-4">Start Date</th><th className="px-6 py-4">Status</th></tr></thead>
                <tbody>{filteredAssignments.map((assignment) => <tr key={assignment.id} className="border-b border-slate-50"><td className="px-6 py-4 font-bold text-slate-900">{assignment.priestName}</td><td className="px-6 py-4 text-sm font-semibold text-slate-600">{assignment.parishName}</td><td className="px-6 py-4 text-sm text-slate-500">{new Date(`${assignment.startDate}T00:00:00`).toLocaleDateString()}</td><td className="px-6 py-4"><span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">Active</span></td></tr>)}</tbody>
              </table>
              {!filteredAssignments.length && <div className="py-14 text-center text-sm font-semibold text-slate-400">No active Parish Priest assignments found.</div>}
            </div>
          </section>
        ) : activeSection === 'planner' ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between"><div><h2 className="font-serif text-2xl font-bold text-slate-950">Transfer plan</h2><p className="mt-1 text-xs font-medium text-slate-500">The current parish is filled automatically.</p></div><button onClick={addMove} className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white hover:bg-slate-800"><Plus className="h-4 w-4" />Add Priest</button></div>
              <div className="mt-5 space-y-3">
                {moves.map((move, index) => {
                  const current = assignmentByPriest.get(move.priestId);
                  return <div key={index} className="grid items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
                    <Field label="Parish Priest"><select value={move.priestId} onChange={(event) => updateMove(index, { priestId: event.target.value, toParishId: '' })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-amber-400"><option value="">Select priest</option>{priests.filter((priest) => assignmentByPriest.has(priest.id) && (!moves.some((item, itemIndex) => itemIndex !== index && item.priestId === priest.id))).map((priest) => <option key={priest.id} value={priest.id}>{priest.name}</option>)}</select></Field>
                    <Field label="Current Parish"><div className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-500">{current?.parishName || '—'}</div></Field>
                    <Field label="Destination Parish"><select value={move.toParishId} onChange={(event) => updateMove(index, { toParishId: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-amber-400"><option value="">Select destination</option>{parishes.filter((parish) => parish.id !== current?.parishId && !moves.some((item, itemIndex) => itemIndex !== index && item.toParishId === parish.id)).map((parish) => <option key={parish.id} value={parish.id}>{parish.institutionCode ? `${parish.institutionCode} · ` : ''}{parish.name}</option>)}</select></Field>
                    <button onClick={() => removeMove(index)} className="rounded-xl p-3 text-rose-500 hover:bg-rose-50" aria-label="Remove reassignment"><Trash2 className="h-5 w-5" /></button>
                  </div>;
                })}
                {!moves.length && <div className="rounded-2xl border border-dashed border-slate-200 py-14 text-center text-sm font-semibold text-slate-400">Select Add Priest to begin a transfer, swap, or rotation.</div>}
              </div>
            </section>

            <section className="h-fit rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-serif text-xl font-bold text-slate-950">Review</h2>
              {preview ? <><div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-black text-amber-950">{preview.assignmentCount} assignment(s) will change</p>{preview.vacancyCount > 0 && <p className="mt-1 text-xs font-bold text-amber-700">{preview.vacancyCount} source parish(es) will become vacant.</p>}<div className="mt-3 space-y-3">{preview.moves.map((move: any) => <div key={move.priestId} className="rounded-xl bg-white p-3"><p className="text-xs font-black text-slate-900">{move.priestName}</p><div className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-slate-500"><span>{move.fromParishName}</span><ArrowRight className="h-3.5 w-3.5 text-amber-500" /><span className="text-slate-900">{move.toParishName}</span></div>{move.createsVacancy && <p className="mt-1 text-[10px] font-bold text-amber-700">Leaves source parish vacant</p>}</div>)}</div></div><label className="mt-4 block text-[10px] font-black uppercase tracking-wider text-slate-500">Type REASSIGN to confirm</label><input value={confirmation} onChange={(event) => { setConfirmation(event.target.value.toUpperCase()); setError(''); }} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm font-black outline-none focus:border-amber-400" /></> : <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-xs font-medium leading-relaxed text-blue-800">Add the priest movements, then review the complete result. Nothing changes during preview.</div>}
              <button disabled={busy || !moves.length} onClick={preview ? executeMoves : previewMoves} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-xs font-black text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{preview ? 'Confirm and Apply Reassignment' : 'Review Reassignment'}</button>
            </section>
          </div>
        ) : (
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-serif text-2xl font-bold text-slate-950">Reassignment History</h2>
            {busy ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div> : <div className="mt-4 space-y-3">{historyRows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4"><div><p className="font-mono text-xs font-black text-slate-900">Batch {String(row.id).slice(0, 8).toUpperCase()}</p><p className="mt-1 text-xs font-medium text-slate-500">{new Date(row.executed_at).toLocaleString()}</p></div><div className="flex gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-600">{row.assignment_count} assignment(s)</span>{row.vacancy_count > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black text-amber-700">{row.vacancy_count} vacancy</span>}<span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">{row.status}</span></div></div>)}{!historyRows.length && <div className="rounded-2xl border border-dashed border-slate-200 py-14 text-center text-sm font-semibold text-slate-400">No reassignment batches recorded yet.</div>}</div>}
          </section>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="min-w-20 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><p className="font-serif text-2xl font-bold">{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-wider text-white/40">{label}</p></div>;
}

function Tab({ active, onClick, icon: Icon, children }: any) {
  return <button onClick={onClick} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition-all ${active ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Icon className="h-4 w-4" />{children}</button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>{children}</label>;
}
