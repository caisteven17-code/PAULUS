'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRight, Building2, Database, Landmark, Play, School, ShieldCheck, Sparkles } from 'lucide-react';
import { ALL_PARISHES, INITIAL_SEMINARIES, INITIAL_SCHOOLS } from '../constants';

type InstitutionType = 'parish' | 'seminary' | 'school';

interface InstitutionProfile {
  id: string;
  name: string;
  type: InstitutionType;
  location: string;
  healthScore: number;
  risk: 'Low' | 'Moderate' | 'High';
  currentBalance: number;
  monthlyCollections: number;
  trend: string;
  insight: string;
}

/** A saved quick-launch — just records which institution was pinned, no financial state. */
interface SavedSession {
  id: string;
  name: string;
  institutionType: InstitutionType;
  institutionId: string;
  savedAt: number;
}

interface DigitalTwinProps {
  onLaunch: (session: {
    entityClass: string;
    entityName: string;
    entityType: InstitutionType;
    viewRole: 'priest' | 'school' | 'seminary';
  }) => void;
}

const STORAGE_KEY = 'admin_digital_twin_sessions';

const institutionTypeMeta: Record<
  InstitutionType,
  {
    label: string;
    plural: string;
    launchLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
    accentSoft: string;
    border: string;
  }
> = {
  parish: {
    label: 'Parish',
    plural: 'Parishes',
    launchLabel: 'Launch Parish View',
    icon: Landmark,
    accent: 'text-amber-700',
    accentSoft: 'bg-amber-50',
    border: 'border-amber-200',
  },
  seminary: {
    label: 'Seminary',
    plural: 'Seminaries',
    launchLabel: 'Launch Seminary View',
    icon: Building2,
    accent: 'text-emerald-700',
    accentSoft: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  school: {
    label: 'School',
    plural: 'Schools',
    launchLabel: 'Launch School View',
    icon: School,
    accent: 'text-sky-700',
    accentSoft: 'bg-sky-50',
    border: 'border-sky-200',
  },
};

const institutionProfiles: InstitutionProfile[] = [
  {
    id: 'parish-san-isidro',
    name: 'San Isidro Labrador Parish',
    type: 'parish',
    location: 'St. John the Baptist Vicariate',
    healthScore: 82,
    risk: 'Low',
    currentBalance: 1860000,
    monthlyCollections: 548000,
    trend: '+8.4%',
    insight: 'Consistent collection growth and disciplined parish operating expenses.',
  },
  {
    id: 'parish-san-roque',
    name: 'San Roque Parish',
    type: 'parish',
    location: 'St. Paul the First Hermit Vicariate',
    healthScore: 56,
    risk: 'High',
    currentBalance: 690000,
    monthlyCollections: 284000,
    trend: '-3.2%',
    insight: 'Tight reserves and weak net surplus make this parish sensitive to shocks.',
  },
  {
    id: 'parish-st-john-baptist',
    name: 'St. John the Baptist Parish',
    type: 'parish',
    location: 'St. John the Baptist Vicariate',
    healthScore: 74,
    risk: 'Moderate',
    currentBalance: 1290000,
    monthlyCollections: 431000,
    trend: '+4.9%',
    insight: 'Healthy balance position, but discretionary spending is rising faster than inflows.',
  },
  {
    id: 'seminary-st-peter',
    name: "St. Peter's College Seminary",
    type: 'seminary',
    location: 'San Pablo',
    healthScore: 78,
    risk: 'Moderate',
    currentBalance: 4920000,
    monthlyCollections: 1230000,
    trend: '+6.1%',
    insight: 'Stable cash position supported by subsidy continuity and predictable donor base.',
  },
  {
    id: 'seminary-formation-center',
    name: 'San Pablo Theological Formation Center',
    type: 'seminary',
    location: 'San Pablo',
    healthScore: 66,
    risk: 'Moderate',
    currentBalance: 2810000,
    monthlyCollections: 918000,
    trend: '+1.8%',
    insight: 'Operating margin remains positive, but support dependence is increasing.',
  },
  {
    id: 'school-liceo',
    name: 'Liceo de San Pablo',
    type: 'school',
    location: 'San Pablo',
    healthScore: 85,
    risk: 'Low',
    currentBalance: 6480000,
    monthlyCollections: 1840000,
    trend: '+9.7%',
    insight: 'Strong tuition performance and reserve growth provide good simulation headroom.',
  },
  {
    id: 'school-canossa',
    name: 'Canossa College San Pablo',
    type: 'school',
    location: 'San Pablo',
    healthScore: 63,
    risk: 'Moderate',
    currentBalance: 2140000,
    monthlyCollections: 921000,
    trend: '-1.1%',
    insight: 'Enrollment-sensitive collections create pressure on school operating flexibility.',
  },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value);

const getRiskTone = (risk: string) => {
  if (risk === 'High') return 'text-rose-700 bg-rose-50 border-rose-200';
  if (risk === 'Moderate') return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-emerald-700 bg-emerald-50 border-emerald-200';
};

const getInstitutionClass = (institution: InstitutionProfile) => {
  if (institution.type === 'parish') {
    return ALL_PARISHES.find((item) => item.name === institution.name)?.class ?? 'Class C';
  }
  if (institution.type === 'seminary') {
    return INITIAL_SEMINARIES.find((item) => item.name === institution.name)?.class ?? 'Class C';
  }
  return INITIAL_SCHOOLS.find((item) => item.name === institution.name)?.class ?? 'Class C';
};

export function DigitalTwin({ onLaunch }: DigitalTwinProps) {
  const [institutionType, setInstitutionType] = useState<InstitutionType>('parish');
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);

  const filteredInstitutions = institutionProfiles.filter((item) => item.type === institutionType);
  const selectedInstitution =
    filteredInstitutions.find((item) => item.id === selectedInstitutionId) ?? filteredInstitutions[0];
  const activeMeta = institutionTypeMeta[institutionType];

  useEffect(() => {
    if (!selectedInstitutionId && filteredInstitutions[0]) {
      setSelectedInstitutionId(filteredInstitutions[0].id);
    }
  }, [filteredInstitutions, selectedInstitutionId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      setSavedSessions(JSON.parse(saved));
    } catch {
      setSavedSessions([]);
    }
  }, []);

  const handleLaunch = () => {
    if (!selectedInstitution) return;
    const entityClass = getInstitutionClass(selectedInstitution);
    const viewRole = selectedInstitution.type === 'parish' ? 'priest' : selectedInstitution.type;
    setIsLaunching(true);

    // Pin this institution to quick-launch list
    if (typeof window !== 'undefined') {
      const prev = window.localStorage.getItem(STORAGE_KEY);
      const list: SavedSession[] = prev ? JSON.parse(prev) : [];
      const alreadySaved = list.find((s) => s.institutionId === selectedInstitution.id);
      if (!alreadySaved) {
        const nextList = [
          {
            id: `${selectedInstitution.id}-${Date.now()}`,
            name: selectedInstitution.name,
            institutionType: selectedInstitution.type,
            institutionId: selectedInstitution.id,
            savedAt: Date.now(),
          },
          ...list,
        ].slice(0, 8);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList));
        setSavedSessions(nextList);
      }
    }

    setTimeout(() => {
      onLaunch({ entityClass, entityName: selectedInstitution.name, entityType: selectedInstitution.type, viewRole });
      setIsLaunching(false);
    }, 1200);
  };

  const handleQuickLaunch = (item: SavedSession) => {
    const inst = institutionProfiles.find((p) => p.id === item.institutionId);
    if (!inst) return;
    const entityClass = getInstitutionClass(inst);
    const viewRole = inst.type === 'parish' ? 'priest' : inst.type;
    setInstitutionType(inst.type);
    setSelectedInstitutionId(inst.id);
    setIsLaunching(true);
    setTimeout(() => {
      onLaunch({ entityClass, entityName: inst.name, entityType: inst.type, viewRole });
      setIsLaunching(false);
    }, 1200);
  };

  const handleRemoveSession = (id: string) => {
    const updated = savedSessions.filter((s) => s.id !== id);
    setSavedSessions(updated);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#f7f3ec]">
      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-8 md:py-8 space-y-8">
        {/* ── Hero Banner ─────────────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-[36px] border border-black/5 bg-gradient-to-br from-[#1f1f1f] via-[#2c2c2c] to-[#111111] text-white shadow-2xl">
          <div className="grid gap-8 px-6 py-8 md:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.8fr)] md:px-10 md:py-10">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.28em] text-[#f1d48d]">
                <Sparkles className="h-4 w-4" />
                Digital Twin Sandbox
              </div>
              <h1 className="font-serif text-4xl font-bold leading-tight md:text-5xl">
                Enter another institution&apos;s dashboard without changing official records.
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-white/70 md:text-base">
                Select a parish, seminary, or school, then launch its actual dashboard interface inside a protected
                bishop-only simulation workspace.
              </p>
            </div>
            <div className="rounded-[32px] border border-[#d8b56a]/25 bg-white/95 p-6 text-gray-900 shadow-xl">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-900">Sandbox Protection Rules</h2>
                  <p className="mt-1 text-sm leading-6 text-gray-600">
                    Simulation values and uploaded files stay inside this Digital Twin page. They do not overwrite the
                    official database or primary dashboards.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Three-Column Grid ────────────────────────────────────────────── */}
        <section className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          {/* ── LEFT: Setup ─────────────────────────────────────────────── */}
          <div className="space-y-5">
            <div className="rounded-[32px] border border-black/5 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="rounded-2xl bg-[#efe3c2] p-3 text-[#8f6513]">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-gray-900">Simulation Setup</h2>
                  <p className="text-xs text-gray-500">Select type, then launch.</p>
                </div>
              </div>

              <div className="space-y-5">
                {/* Institution type picker */}
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.24em] text-gray-500">
                    Institution Type
                  </label>
                  <div className="space-y-2">
                    {(Object.keys(institutionTypeMeta) as InstitutionType[]).map((type) => {
                      const meta = institutionTypeMeta[type];
                      const Icon = meta.icon;
                      const isActive = institutionType === type;
                      return (
                        <button
                          key={type}
                          onClick={() => setInstitutionType(type)}
                          className={`flex w-full items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition-all ${
                            isActive
                              ? `${meta.accentSoft} ${meta.border} shadow-sm`
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div
                            className={`rounded-xl p-2 ${isActive ? meta.accentSoft : 'bg-gray-100'} ${meta.accent}`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-gray-900">{meta.label}</p>
                            <p className="text-xs text-gray-500">
                              {institutionProfiles.filter((i) => i.type === type).length} listed
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Institution dropdown */}
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.24em] text-gray-500">
                    {activeMeta.plural}
                  </label>
                  <select
                    value={selectedInstitutionId}
                    onChange={(e) => setSelectedInstitutionId(e.target.value)}
                    className="w-full rounded-[18px] border border-gray-200 bg-[#faf8f4] px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-[#d4af37]"
                  >
                    {filteredInstitutions.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Launch button */}
                <button
                  onClick={handleLaunch}
                  disabled={!selectedInstitution || isLaunching}
                  className="flex w-full items-center justify-center gap-3 rounded-[18px] bg-[#111111] px-4 py-4 text-sm font-black text-white transition hover:bg-[#282828] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Play className="h-4 w-4 fill-current" />
                  {isLaunching ? 'Launching…' : activeMeta.launchLabel}
                </button>
              </div>
            </div>
          </div>

          {/* ── MIDDLE: Institution Profile + Controls ───────────────────── */}
          <div className="space-y-6">
            {isLaunching ? (
              <div className="rounded-[32px] border border-black/5 bg-white px-6 py-28 text-center shadow-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#faf8f4]">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#d4af37]/30 border-t-[#d4af37]" />
                </div>
                <p className="mt-6 text-xl font-black text-gray-900">Opening {selectedInstitution?.name} dashboard…</p>
                <p className="mt-2 text-sm text-gray-500">
                  Loading the full {activeMeta.label.toLowerCase()} view inside Digital Twin.
                </p>
              </div>
            ) : selectedInstitution ? (
              <>
                {/* Institution Profile */}
                <div className="rounded-[32px] border border-black/5 bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500">
                        Selected Institution
                      </p>
                      <h3 className="mt-2 text-2xl font-black text-gray-900">{selectedInstitution.name}</h3>
                      <p className="mt-1 text-sm text-gray-500">{selectedInstitution.location}</p>
                    </div>
                    <div
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${getRiskTone(selectedInstitution.risk)}`}
                    >
                      {selectedInstitution.risk} Risk
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-gray-600">{selectedInstitution.insight}</p>

                  {/* Quick stats */}
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div className="rounded-[18px] bg-[#faf8f4] p-3 text-center">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Health</p>
                      <p className="mt-1 text-xl font-black text-gray-900">{selectedInstitution.healthScore}</p>
                    </div>
                    <div className="rounded-[18px] bg-[#faf8f4] p-3 text-center">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Collections</p>
                      <p className="mt-1 text-sm font-black text-gray-900">
                        {formatCurrency(selectedInstitution.monthlyCollections)}
                      </p>
                    </div>
                    <div className="rounded-[18px] bg-[#faf8f4] p-3 text-center">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Trend</p>
                      <p
                        className={`mt-1 text-sm font-black ${selectedInstitution.trend.startsWith('+') ? 'text-emerald-700' : 'text-rose-700'}`}
                      >
                        {selectedInstitution.trend}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Launch hint */}
                <div className="rounded-[32px] border border-dashed border-gray-200 bg-white px-6 py-8 text-center shadow-sm">
                  <p className="text-sm font-black text-gray-700">Ready to launch</p>
                  <p className="mt-1 text-xs leading-5 text-gray-400">
                    Click <strong>Launch</strong> on the left to open this institution's exact dashboard — the same
                    interface the institution sees. Use the year/period selectors at the top to navigate across time.
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-[32px] border border-dashed border-gray-300 bg-white px-6 py-20 text-center shadow-sm">
                <p className="text-lg font-black text-gray-900">
                  Launch an institution to open its actual dashboard interface.
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  The main panel will switch to the selected parish, school, or seminary dashboard.
                </p>
              </div>
            )}
          </div>

          {/* ── RIGHT: Recent Launches ───────────────────────────────────── */}
          <div className="space-y-6">
            <div className="rounded-[32px] border border-black/5 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-base font-black text-gray-900">Recent Launches</h2>
                  <p className="text-xs text-gray-500">Jump back into a previous session.</p>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-600">
                  {savedSessions.length}
                </span>
              </div>

              <div className="space-y-3">
                {savedSessions.length > 0 ? (
                  savedSessions.map((item) => (
                    <div key={item.id} className="rounded-[22px] border border-gray-200 bg-[#faf8f4] p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-gray-900">{item.name}</p>
                          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                            {institutionTypeMeta[item.institutionType].label}
                          </p>
                          <p className="mt-1 text-xs text-gray-400">
                            {new Date(item.savedAt).toLocaleDateString('en-US')}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleQuickLaunch(item)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-[#111111] px-3 py-2 text-xs font-black text-white transition hover:bg-[#282828]"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          Launch
                        </button>
                        <button
                          onClick={() => handleRemoveSession(item.id)}
                          className="rounded-[14px] border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 transition hover:bg-gray-100"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-dashed border-gray-300 bg-[#faf8f4] px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-gray-500">No recent sessions yet.</p>
                    <p className="mt-1 text-xs text-gray-400">Launch an institution to add it here.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
