'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Database,
  FileUp,
  Landmark,
  Play,
  Save,
  School,
  ShieldCheck,
  Sparkles,
  Upload,
  Wallet
} from 'lucide-react';
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
  monthlyDisbursements: number;
  monthlyRemittances: number;
  monthlyExpenses: number;
  budgetAllocation: number;
  trend: string;
  insight: string;
}

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
  institutionType: InstitutionType;
  institutionId: string;
  state: SandboxState;
  uploadedFileName?: string;
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

const STORAGE_KEY = 'admin_digital_twin_instances';

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
    border: 'border-amber-200'
  },
  seminary: {
    label: 'Seminary',
    plural: 'Seminaries',
    launchLabel: 'Launch Seminary View',
    icon: Building2,
    accent: 'text-emerald-700',
    accentSoft: 'bg-emerald-50',
    border: 'border-emerald-200'
  },
  school: {
    label: 'School',
    plural: 'Schools',
    launchLabel: 'Launch School View',
    icon: School,
    accent: 'text-sky-700',
    accentSoft: 'bg-sky-50',
    border: 'border-sky-200'
  }
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
    monthlyDisbursements: 164000,
    monthlyRemittances: 72000,
    monthlyExpenses: 231000,
    budgetAllocation: 495000,
    trend: '+8.4%',
    insight: 'Consistent collection growth and disciplined parish operating expenses.'
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
    monthlyDisbursements: 109000,
    monthlyRemittances: 46000,
    monthlyExpenses: 171000,
    budgetAllocation: 318000,
    trend: '-3.2%',
    insight: 'Tight reserves and weak net surplus make this parish sensitive to shocks.'
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
    monthlyDisbursements: 152000,
    monthlyRemittances: 61000,
    monthlyExpenses: 189000,
    budgetAllocation: 402000,
    trend: '+4.9%',
    insight: 'Healthy balance position, but discretionary spending is rising faster than inflows.'
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
    monthlyDisbursements: 382000,
    monthlyRemittances: 118000,
    monthlyExpenses: 641000,
    budgetAllocation: 1100000,
    trend: '+6.1%',
    insight: 'Stable cash position supported by subsidy continuity and predictable donor base.'
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
    monthlyDisbursements: 331000,
    monthlyRemittances: 92000,
    monthlyExpenses: 566000,
    budgetAllocation: 835000,
    trend: '+1.8%',
    insight: 'Operating margin remains positive, but support dependence is increasing.'
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
    monthlyDisbursements: 624000,
    monthlyRemittances: 145000,
    monthlyExpenses: 781000,
    budgetAllocation: 1550000,
    trend: '+9.7%',
    insight: 'Strong tuition performance and reserve growth provide good simulation headroom.'
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
    monthlyDisbursements: 309000,
    monthlyRemittances: 88000,
    monthlyExpenses: 487000,
    budgetAllocation: 876000,
    trend: '-1.1%',
    insight: 'Enrollment-sensitive collections create pressure on school operating flexibility.'
  }
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0
  }).format(value);

const getDefaultSandboxState = (institution?: InstitutionProfile): SandboxState => ({
  projectedCollections: institution?.monthlyCollections ?? 0,
  projectedDisbursements: institution?.monthlyDisbursements ?? 0,
  projectedRemittances: institution?.monthlyRemittances ?? 0,
  projectedExpenses: institution?.monthlyExpenses ?? 0,
  projectedBudgetAllocation: institution?.budgetAllocation ?? 0
});

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
  const [launchedInstitutionId, setLaunchedInstitutionId] = useState('');
  const [sandboxState, setSandboxState] = useState<SandboxState>(getDefaultSandboxState());
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [savedSandboxes, setSavedSandboxes] = useState<SavedSandbox[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);

  const filteredInstitutions = institutionProfiles.filter((item) => item.type === institutionType);
  const selectedInstitution =
    filteredInstitutions.find((item) => item.id === selectedInstitutionId) ?? filteredInstitutions[0];
  const activeInstitution =
    institutionProfiles.find((item) => item.id === launchedInstitutionId) ?? null;
  const activeMeta = institutionTypeMeta[institutionType];

  useEffect(() => {
    if (!selectedInstitutionId && filteredInstitutions[0]) {
      setSelectedInstitutionId(filteredInstitutions[0].id);
    }
  }, [filteredInstitutions, selectedInstitutionId]);

  useEffect(() => {
    if (selectedInstitution) {
      setSandboxState(getDefaultSandboxState(selectedInstitution));
      setUploadedFileName('');
      setLaunchedInstitutionId('');
    }
  }, [institutionType, selectedInstitutionId]);

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

  const baselineNet = activeInstitution
    ? activeInstitution.monthlyCollections -
      activeInstitution.monthlyDisbursements -
      activeInstitution.monthlyRemittances -
      activeInstitution.monthlyExpenses
    : 0;

  const simulatedNet =
    sandboxState.projectedCollections -
    sandboxState.projectedDisbursements -
    sandboxState.projectedRemittances -
    sandboxState.projectedExpenses;

  const balanceDelta =
    simulatedNet -
    baselineNet +
    (sandboxState.projectedBudgetAllocation - (activeInstitution?.budgetAllocation ?? 0)) * 0.15;

  const simulatedHealth = activeInstitution
    ? Math.max(20, Math.min(98, Math.round(activeInstitution.healthScore + balanceDelta / 45000)))
    : 0;

  const simulatedRisk: 'Low' | 'Moderate' | 'High' =
    simulatedNet < 0 || simulatedHealth < 60 ? 'High' : simulatedHealth < 75 ? 'Moderate' : 'Low';

  const persistSandboxes = (items: SavedSandbox[]) => {
    setSavedSandboxes(items);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  };

  const handleLaunch = () => {
    if (!selectedInstitution) return;
    const entityClass = getInstitutionClass(selectedInstitution);
    const viewRole = selectedInstitution.type === 'parish' ? 'priest' : selectedInstitution.type;
    setLaunchedInstitutionId(selectedInstitution.id);
    setIsLaunching(true);

    window.setTimeout(() => {
      onLaunch({
        entityClass,
        entityName: selectedInstitution.name,
        entityType: selectedInstitution.type,
        viewRole
      });
      setIsLaunching(false);
    }, 1200);
  };

  const handleReset = () => {
    if (!activeInstitution) return;
    setSandboxState(getDefaultSandboxState(activeInstitution));
    setUploadedFileName('');
  };

  const handleSaveSandbox = () => {
    if (!activeInstitution) return;

    const nextItem: SavedSandbox = {
      id: `${activeInstitution.id}-${Date.now()}`,
      name: `${activeInstitution.name} Sandbox ${new Date().toLocaleDateString('en-US')}`,
      institutionType: activeInstitution.type,
      institutionId: activeInstitution.id,
      state: sandboxState,
      uploadedFileName: uploadedFileName || undefined,
      savedAt: Date.now()
    };

    persistSandboxes([nextItem, ...savedSandboxes].slice(0, 8));
  };

  const handleLoadSandbox = (item: SavedSandbox) => {
    setInstitutionType(item.institutionType);
    setSelectedInstitutionId(item.institutionId);
    setLaunchedInstitutionId(item.institutionId);
    setSandboxState(item.state);
    setUploadedFileName(item.uploadedFileName ?? '');
  };

  const advisoryMessage = !activeInstitution
    ? 'Select and launch an institution to enter its real dashboard interface.'
    : simulatedNet >= baselineNet
      ? 'The sandbox scenario improves the institution’s net monthly position if those assumptions hold.'
      : 'The sandbox scenario weakens resilience. Review disbursements, remittances, expenses, or budget allocation before acting.';

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#f7f3ec]">
      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-8 md:py-8 space-y-8">
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
                Select a parish, seminary, or school, then launch its actual dashboard interface inside a protected bishop-only simulation workspace.
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
                    Simulation values and uploaded files stay inside this Digital Twin page. They do not overwrite the official database or primary dashboards.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-8 xl:grid-cols-[440px_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="rounded-[32px] border border-black/5 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-[#efe3c2] p-3 text-[#8f6513]">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-900">Simulation Setup</h2>
                  <p className="text-sm text-gray-500">Select type, choose institution, then launch the actual dashboard view.</p>
                </div>
              </div>

              <div className="mt-6 space-y-6">
                <div className="space-y-3">
                  <label className="text-[11px] font-black uppercase tracking-[0.24em] text-gray-500">Institution Type</label>
                  <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                    {(Object.keys(institutionTypeMeta) as InstitutionType[]).map((type) => {
                      const meta = institutionTypeMeta[type];
                      const Icon = meta.icon;
                      const isActive = institutionType === type;

                      return (
                        <button
                          key={type}
                          onClick={() => setInstitutionType(type)}
                          className={`flex items-center gap-3 rounded-[22px] border px-4 py-4 text-left transition-all ${
                            isActive ? `${meta.accentSoft} ${meta.border} shadow-sm` : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className={`rounded-2xl p-3 ${isActive ? meta.accentSoft : 'bg-gray-100'} ${meta.accent}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-gray-900">{meta.label}</p>
                            <p className="text-xs text-gray-500">{institutionProfiles.filter((item) => item.type === type).length} listed</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-black uppercase tracking-[0.24em] text-gray-500">{activeMeta.plural} List</label>
                  <select
                    value={selectedInstitutionId}
                    onChange={(event) => setSelectedInstitutionId(event.target.value)}
                    className="w-full rounded-[22px] border border-gray-200 bg-[#faf8f4] px-4 py-4 text-sm font-semibold text-gray-900 outline-none transition focus:border-[#d4af37]"
                  >
                    {filteredInstitutions.map((institution) => (
                      <option key={institution.id} value={institution.id}>
                        {institution.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedInstitution && (
                  <div className="rounded-[26px] border border-dashed border-gray-300 bg-[#faf8f4] p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500">Selected Institution</p>
                        <h3 className="mt-2 text-lg font-black text-gray-900">{selectedInstitution.name}</h3>
                        <p className="mt-1 text-sm text-gray-500">{selectedInstitution.location}</p>
                      </div>
                      <div className={`rounded-full border px-3 py-1 text-xs font-black ${getRiskTone(selectedInstitution.risk)}`}>
                        {selectedInstitution.risk} Risk
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-gray-600">{selectedInstitution.insight}</p>
                  </div>
                )}

                <button
                  onClick={handleLaunch}
                  disabled={!selectedInstitution}
                  className="flex w-full items-center justify-center gap-3 rounded-[22px] bg-[#111111] px-4 py-4 text-sm font-black text-white transition hover:bg-[#282828] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Play className="h-4 w-4 fill-current" />
                  {activeMeta.launchLabel}
                </button>
              </div>
            </div>

            {activeInstitution && (
              <div className="rounded-[32px] border border-black/5 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-black text-gray-900">Simulation Controls</h2>
                    <p className="text-sm text-gray-500">Sandbox inputs beside the real dashboard.</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleReset}
                      className="rounded-[18px] border border-gray-200 px-4 py-2 text-xs font-black text-gray-700 transition hover:bg-gray-50"
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleSaveSandbox}
                      className="inline-flex items-center gap-2 rounded-[18px] bg-[#111111] px-4 py-2 text-xs font-black text-white transition hover:bg-[#282828]"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save Instance
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {[
                    ['projectedCollections', 'Projected Collections'],
                    ['projectedDisbursements', 'Projected Disbursements'],
                    ['projectedRemittances', 'Projected Remittances'],
                    ['projectedExpenses', 'Projected Expenses'],
                    ['projectedBudgetAllocation', 'Budget Allocation']
                  ].map(([key, label]) => (
                    <label key={key} className="space-y-2">
                      <span className="text-[11px] font-black uppercase tracking-[0.22em] text-gray-500">{label}</span>
                      <input
                        type="number"
                        min="0"
                        value={sandboxState[key as keyof SandboxState]}
                        onChange={(event) =>
                          setSandboxState((current) => ({
                            ...current,
                            [key]: Number(event.target.value || 0)
                          }))
                        }
                        className="w-full rounded-[20px] border border-gray-200 bg-[#faf8f4] px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-[#d4af37]"
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-6 rounded-[24px] border border-dashed border-gray-300 bg-[#faf8f4] p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-white p-3 text-gray-700 shadow-sm">
                      <FileUp className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-gray-900">Temporary Financial Report Upload</p>
                      <p className="mt-1 text-sm leading-6 text-gray-500">
                        Upload a report to preview its effect inside the sandbox only.
                      </p>
                      <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-[18px] border border-gray-200 bg-white px-4 py-2 text-xs font-black text-gray-700 transition hover:border-[#d4af37]">
                        <Upload className="h-3.5 w-3.5" />
                        Choose File
                        <input
                          type="file"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            setUploadedFileName(file?.name ?? '');
                          }}
                        />
                      </label>
                      <p className="mt-3 text-sm font-semibold text-gray-600">
                        {uploadedFileName ? `${uploadedFileName} loaded into sandbox preview.` : 'No temporary file attached.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-[32px] border border-black/5 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-gray-900">Saved Instances</h2>
                  <p className="text-sm text-gray-500">Retrieve previous sandbox runs for comparison.</p>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-600">{savedSandboxes.length}</span>
              </div>

              <div className="mt-5 space-y-3">
                {savedSandboxes.length > 0 ? (
                  savedSandboxes.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleLoadSandbox(item)}
                      className="w-full rounded-[22px] border border-gray-200 bg-[#faf8f4] p-4 text-left transition hover:border-[#d4af37]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-black text-gray-900">{item.name}</p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                            {institutionTypeMeta[item.institutionType].label} Instance
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                      </div>
                      <p className="mt-3 text-xs text-gray-500">
                        {new Date(item.savedAt).toLocaleString('en-US')}
                        {item.uploadedFileName ? ` • ${item.uploadedFileName}` : ''}
                      </p>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-dashed border-gray-300 bg-[#faf8f4] px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-gray-500">No saved sandbox instance yet.</p>
                  </div>
                )}
              </div>
            </div>

            {activeInstitution && (
              <div className="rounded-[32px] border border-black/5 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900">Sandbox Notes</h3>
                    <p className="text-sm text-gray-500">Extra simulation context while using the real dashboard.</p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="rounded-[22px] bg-[#faf8f4] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Baseline Net</p>
                    <p className="mt-2 text-2xl font-black text-gray-900">{formatCurrency(baselineNet)}</p>
                  </div>
                  <div className="rounded-[22px] bg-[#faf8f4] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Scenario Net</p>
                    <p className={`mt-2 text-2xl font-black ${simulatedNet >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formatCurrency(simulatedNet)}
                    </p>
                  </div>
                  <div className="rounded-[22px] bg-[#faf8f4] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Health Shift</p>
                    <p className="mt-2 text-2xl font-black text-gray-900">{activeInstitution.healthScore} to {simulatedHealth}</p>
                  </div>
                  <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
                      <p className="text-sm font-semibold leading-6 text-amber-900">{advisoryMessage}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {isLaunching ? (
              <div className="rounded-[32px] border border-black/5 bg-white px-6 py-28 text-center shadow-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#faf8f4]">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#d4af37]/30 border-t-[#d4af37]" />
                </div>
                <p className="mt-6 text-xl font-black text-gray-900">Opening {selectedInstitution?.name} dashboard...</p>
                <p className="mt-2 text-sm text-gray-500">
                  Loading the full {activeMeta.label.toLowerCase()} view inside Digital Twin.
                </p>
              </div>
            ) : activeInstitution ? (
              <div className="rounded-[32px] border border-black/5 bg-white p-3 shadow-sm md:p-4">
                <div className="flex flex-col gap-3 px-3 py-3 md:flex-row md:items-center md:justify-between md:px-4">
                  <div>
                    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] ${institutionTypeMeta[activeInstitution.type].accentSoft} ${institutionTypeMeta[activeInstitution.type].accent}`}>
                      <Play className="h-3.5 w-3.5 fill-current" />
                      Actual Dashboard Interface
                    </div>
                    <h3 className="mt-3 text-xl font-black text-gray-900">
                      {activeInstitution.name}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Launch will switch to the selected institution&apos;s full dashboard view.
                    </p>
                  </div>
                  <div className={`rounded-[18px] border px-4 py-3 text-sm font-black ${getRiskTone(simulatedRisk)}`}>
                    Simulated Risk: {simulatedRisk}
                  </div>
                </div>

                <div className="flex min-h-[520px] items-center justify-center rounded-[28px] border border-dashed border-gray-300 bg-[#fcfbf8] px-6 py-16 text-center">
                  <div className="max-w-xl">
                    <p className="text-lg font-black text-gray-900">Ready to launch full dashboard view</p>
                    <p className="mt-2 text-sm leading-6 text-gray-500">
                      Click the launch button on the left to leave this setup screen and enter the full {institutionTypeMeta[activeInstitution.type].label.toLowerCase()} dashboard.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[32px] border border-dashed border-gray-300 bg-white px-6 py-20 text-center shadow-sm">
                <p className="text-lg font-black text-gray-900">Launch an institution to open its actual dashboard interface.</p>
                <p className="mt-2 text-sm text-gray-500">The main panel will switch to the selected parish, school, or seminary dashboard.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
