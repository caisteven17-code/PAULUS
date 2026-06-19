'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Search,
  Filter,
  LayoutGrid,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Target,
  User,
  Building2,
  Church,
  GraduationCap,
  School,
  Archive,
  ArrowUpDown,
  Eye,
  Briefcase,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Project, Donation, ProjectCategory, EntityType, ProjectExpense } from '../types';
import { ProjectDashboardCard } from '../components/projects/ProjectDashboardCard';
import { ProjectDetailPage } from '../components/projects/ProjectDetailPage';
import { ProjectCreationForm, ProjectInstitutionOption } from '../components/projects/ProjectCreationForm';
import { dataService } from '../services/dataService';
import { auth } from '../firebase';
import { usePermissions } from '../hooks/usePermissions';
import { dateField, roundedField, selectField } from '../lib/formStyles';

interface ProjectsProps {
  role?: string;
}

const isUuid = (value?: string) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const PAGE_SIZE = 9;

const CATEGORIES = [
  'All',
  'Building/Construction',
  'Equipment',
  'Programs/Outreach',
  'Education',
  'Emergency/Relief',
  'Liturgical',
  'Operational',
  'Infrastructure',
  'Heritage',
  'Charity',
  'Facilities',
];

export function Projects({ role }: ProjectsProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<ProjectCategory | 'All'>('All');
  const [filterEntityType, setFilterEntityType] = useState<EntityType | 'All'>('All');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'completed' | 'on-hold'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'progress' | 'raised'>('recent');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showEntityFilterDropdown, setShowEntityFilterDropdown] = useState(false);
  const [userContext, setUserContext] = useState<{ id: string; name: string; type: EntityType } | null>(null);
  const { permissions } = usePermissions();
  const canAccessProjects = permissions.view_projects === true || permissions.manage_projects === true;

  // ── Role-based visibility ──────────────────────────────────────────────────
  const isDiocese = permissions.view_diocese === true;
  // Oversight roles (e.g. School Superintendent) see every school's projects but
  // do not own any single institution, so they are view-only like the diocese.
  const isSchoolOverseer =
    !isDiocese && (permissions.view_school_all === true || permissions.view_school_cluster === true);
  const isOverview = isDiocese || isSchoolOverseer;
  // The diocese can add projects and edit the ones it owns (entityType 'diocese');
  // school overseers are fully view-only; institution owners manage their own.
  const canCreate = permissions.manage_projects === true && !isSchoolOverseer;
  const canManageProject = (p?: Project | null) =>
    permissions.manage_projects === true &&
    (isDiocese ? p?.entityType === 'diocese' : isSchoolOverseer ? false : true);

  // Client-side soft archive (projects have no archive column yet).
  const [archivedIds, setArchivedIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem('projects_archived') || '[]');
    } catch {
      return [];
    }
  });
  const persistArchived = useCallback((ids: string[]) => {
    setArchivedIds(ids);
    try {
      localStorage.setItem('projects_archived', JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  }, []);
  const isArchived = useCallback((id: string) => archivedIds.includes(id), [archivedIds]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user: any) => {
      if (user) {
        const isDioceseRole = ['bishop', 'admin', 'chancellor', 'diocesan_oeconomus', 'finance_staff'].includes(
          user.role,
        );
        const entityType = user.entityType ?? (user.role === 'priest' ? 'parish' : user.role);
        const entityName = user.entityName || user.displayName || 'Unknown Entity';
        const entityId = isUuid(user.entityId) ? user.entityId : entityName;
        setUserContext({
          id: entityId,
          name: entityName,
          type: isDioceseRole ? 'diocese' : (entityType as EntityType),
        });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userContext || !canAccessProjects) return;

    // Diocese: all projects (optionally filtered by type). School overseers: all
    // schools. Everyone else: only their own institution.
    const subEntityType = isDiocese
      ? filterEntityType === 'All'
        ? undefined
        : filterEntityType
      : isSchoolOverseer
        ? ('school' as EntityType)
        : userContext.type;
    const subEntityId = isOverview ? undefined : userContext.id;

    const unsubscribeProjects = dataService.subscribeToProjects(
      (updatedProjects) => setProjects(updatedProjects),
      subEntityId,
      subEntityType as any,
    );
    const unsubscribeDonations = dataService.subscribeToDonations((d) => setDonations(d));
    const unsubscribeExpenses = dataService.subscribeToExpenses((e) => setExpenses(e));

    return () => {
      unsubscribeProjects();
      unsubscribeDonations();
      unsubscribeExpenses();
    };
  }, [userContext, filterEntityType, canAccessProjects, isDiocese, isSchoolOverseer, isOverview]);

  const currentProjectInstitution: ProjectInstitutionOption | null = userContext
    ? { id: userContext.id, name: userContext.name, type: userContext.type }
    : null;

  // ── Filtering + sorting + pagination ───────────────────────────────────────
  const filteredProjects = useMemo(() => {
    let out = projects.slice();

    // School overseers receive every type from the API — keep only schools.
    if (isSchoolOverseer) out = out.filter((p) => p.entityType === 'school');

    // Diocese view: apply the entity-type dropdown filter client-side so the
    // list updates immediately without waiting for a fresh API response.
    if (isDiocese && filterEntityType !== 'All') {
      out = out.filter((p) => p.entityType === filterEntityType);
    }

    out = out.filter((p) => !isArchived(p.id));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      out = out.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.entityName ?? p.entityId).toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q),
      );
    }
    if (filterCategory !== 'All') out = out.filter((p) => p.category === filterCategory);
    if (filterStatus !== 'all') out = out.filter((p) => p.status === filterStatus);
    if (dateFrom) out = out.filter((p) => p.startDate >= dateFrom);
    if (dateTo) out = out.filter((p) => p.startDate <= dateTo);

    const progress = (p: Project) => (p.targetAmount > 0 ? p.currentAmount / p.targetAmount : 0);
    out.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'progress') return progress(b) - progress(a);
      if (sortBy === 'raised') return b.currentAmount - a.currentAmount;
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime(); // recent
    });
    return out;
  }, [projects, isSchoolOverseer, isDiocese, filterEntityType, filterStatus, isArchived, searchQuery, filterCategory, dateFrom, dateTo, sortBy]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterCategory, filterEntityType, filterStatus, sortBy, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedProjects = filteredProjects.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const visibleForStats = useMemo(
    () => (isSchoolOverseer ? projects.filter((p) => p.entityType === 'school') : projects).filter((p) => !isArchived(p.id)),
    [projects, isSchoolOverseer, isArchived],
  );

  const projectSummary = useMemo(
    () => ({
      dioceseProjects: visibleForStats.filter((p) => p.entityType === 'diocese').length,
      parishProjects: visibleForStats.filter((p) => p.entityType === 'parish').length,
      seminaryProjects: visibleForStats.filter((p) => p.entityType === 'seminary').length,
      schoolProjects: visibleForStats.filter((p) => p.entityType === 'school').length,
    }),
    [visibleForStats],
  );

  const hasActiveFilters =
    searchQuery !== '' ||
    filterCategory !== 'All' ||
    filterStatus !== 'all' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    (isDiocese && filterEntityType !== 'All');

  const clearFilters = () => {
    setSearchQuery('');
    setFilterCategory('All');
    setFilterEntityType('All');
    setFilterStatus('all');
    setDateFrom('');
    setDateTo('');
  };

  // ── Handlers (unchanged behaviour) ─────────────────────────────────────────
  const handleAddProject = (
    newProject: Omit<Project, 'id' | 'currentAmount' | 'healthScore' | 'successProbability' | 'recommendation'>,
  ) => {
    if (!userContext) return;
    const project: Project = {
      ...newProject,
      id: '',
      currentAmount: 0,
      totalExpenses: 0,
      healthScore: 75,
      successProbability: 65,
      recommendation: 'Begin with a formal announcement during parish services.',
    };
    return dataService.saveProject(project).then((saved) => {
      setProjects((prev) => [saved, ...prev.filter((existing) => existing.id !== saved.id)]);
    });
  };

  const handleAddDonation = (newDonation: Omit<Donation, 'id'>) => {
    void dataService.saveDonation(newDonation as Donation).then((saved) => {
      setDonations((prev) => [saved, ...prev.filter((donation) => donation.id !== saved.id)]);
    });
    const projectToUpdate = projects.find((p) => p.id === newDonation.projectId);
    if (projectToUpdate) {
      const updatedProject = { ...projectToUpdate, currentAmount: projectToUpdate.currentAmount + newDonation.amount };
      setProjects((prev) => prev.map((project) => (project.id === updatedProject.id ? updatedProject : project)));
      void dataService.saveProject(updatedProject).then((saved) => {
        setProjects((prev) => prev.map((project) => (project.id === saved.id ? saved : project)));
      });
    }
    if (selectedProject?.id === newDonation.projectId) {
      setSelectedProject((prev) => (prev ? { ...prev, currentAmount: prev.currentAmount + newDonation.amount } : null));
    }
  };

  const handleAddExpense = (newExpense: Omit<ProjectExpense, 'id'>) => {
    void dataService.saveExpense(newExpense as ProjectExpense).then((saved) => {
      setExpenses((prev) => [saved, ...prev.filter((expense) => expense.id !== saved.id)]);
    });
    const projectToUpdate = projects.find((p) => p.id === newExpense.projectId);
    if (projectToUpdate) {
      const updatedProject = {
        ...projectToUpdate,
        totalExpenses: (projectToUpdate.totalExpenses || 0) + newExpense.amount,
      };
      setProjects((prev) => prev.map((project) => (project.id === updatedProject.id ? updatedProject : project)));
      void dataService.saveProject(updatedProject).then((saved) => {
        setProjects((prev) => prev.map((project) => (project.id === saved.id ? saved : project)));
      });
    }
    if (selectedProject?.id === newExpense.projectId) {
      setSelectedProject((prev) =>
        prev ? { ...prev, totalExpenses: (prev.totalExpenses || 0) + newExpense.amount } : null,
      );
    }
  };

  const handleEditDonation = (updated: Donation) => {
    setDonations((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    void dataService.saveDonation(updated).then((saved) => {
      setDonations((prev) => prev.map((d) => (d.id === saved.id ? saved : d)));
    });
  };

  const handleEditExpense = (updated: ProjectExpense) => {
    setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    void dataService.saveExpense(updated).then((saved) => {
      setExpenses((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
    });
  };

  const handleEditProject = (updated: Project) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSelectedProject(updated);
    void dataService.saveProject(updated).then((saved) => {
      setProjects((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      setSelectedProject(saved);
    });
  };

  const handleCloneProject = (project: Project) => {
    const clonedProject: Project = {
      ...project,
      id: Math.random().toString(36).substr(2, 9),
      name: `${project.name} (Clone)`,
      currentAmount: 0,
      totalExpenses: 0,
      status: 'active',
      startDate: new Date().toISOString().split('T')[0],
    };
    void dataService.saveProject(clonedProject).then((saved) => {
      setProjects((prev) => [saved, ...prev.filter((existing) => existing.id !== saved.id)]);
      setSelectedProject(saved);
    });
  };

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'diocese':
        return <Building2 className="w-4 h-4" />;
      case 'parish':
        return <Church className="w-4 h-4" />;
      case 'seminary':
        return <GraduationCap className="w-4 h-4" />;
      case 'school':
        return <School className="w-4 h-4" />;
      default:
        return <Building2 className="w-4 h-4" />;
    }
  };

  if (!canAccessProjects) {
    return (
      <div className="min-h-screen bg-church-light p-4 md:p-8 flex items-center justify-center">
        <div className="bg-white p-12 rounded-[40px] border border-gray-100 shadow-xl max-w-md text-center space-y-6">
          <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mx-auto">
            <Building2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-church-black">Access Denied</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            Your account role does not have viewing permissions for Diocesan and Parish Projects. Please contact your
            diocesan administrator to request access.
          </p>
        </div>
      </div>
    );
  }

  if (selectedProject) {
    return (
      <ProjectDetailPage
        project={selectedProject}
        donations={donations.filter((d) => d.projectId === selectedProject.id)}
        expenses={expenses.filter((expense) => expense.projectId === selectedProject.id)}
        onBack={() => setSelectedProject(null)}
        onAddDonation={handleAddDonation}
        onAddExpense={handleAddExpense}
        onEditProject={handleEditProject}
        onEditDonation={handleEditDonation}
        onEditExpense={handleEditExpense}
        onCloneProject={handleCloneProject}
        role={role}
        canManageProjects={canManageProject(selectedProject)}
      />
    );
  }

  const summaryCards = [
    { label: 'Total', value: visibleForStats.length, icon: LayoutGrid },
    {
      label: 'Raised',
      value: `₱${visibleForStats.reduce((a, p) => a + p.currentAmount, 0).toLocaleString()}`,
      icon: Target,
    },
    {
      label: 'Goal',
      value: `₱${visibleForStats.reduce((a, p) => a + p.targetAmount, 0).toLocaleString()}`,
      icon: Target,
    },
    { label: 'Donors', value: donations.filter((d) => visibleForStats.some((p) => p.id === d.projectId)).length, icon: User },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f5] pt-8 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1500px]">
        {/* ── Header ── */}
        <div className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="relative p-6 md:p-8">
              <div className="absolute inset-y-8 left-0 w-1 rounded-r-full bg-gold-500" />
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-950">
                <Briefcase className="h-5 w-5 text-gold-400" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-400">Diocesan Projects</p>
                  {isSchoolOverseer && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
                      <Eye className="h-3 w-3" /> View only
                    </span>
                  )}
                </div>
                <h1 className="mt-1 font-serif text-3xl font-bold leading-none text-slate-950 md:text-4xl">Projects</h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
                  {isDiocese
                    ? 'Track fundraising and delivery across every institution in the diocese.'
                    : isSchoolOverseer
                      ? 'Oversee fundraising and delivery across all diocesan schools.'
                      : `Manage and track projects for ${userContext?.name || 'your institution'}.`}
                </p>
              </div>
            </div>

              {canCreate && (
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="mt-6 inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-gold-500 px-5 text-[11px] font-black uppercase tracking-[0.18em] text-black shadow-lg shadow-gold-500/20 transition-all hover:bg-gold-400"
                >
                  <Plus className="h-4 w-4" /> New Project
                </button>
              )}
            </div>
            <div className="border-t border-slate-200 bg-slate-950 p-4 lg:border-l lg:border-t-0 md:p-6">
              <div className="grid h-full grid-cols-2 gap-3">
                {summaryCards.map((c) => (
                  <div key={c.label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/35">{c.label}</span>
                      <c.icon className="h-3 w-3 text-gold-400" />
                    </div>
                    <p className="mt-2 truncate text-xl font-black leading-none text-white">{c.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Diocese breakdown */}
        {isDiocese && (
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Diocese', value: projectSummary.dioceseProjects, icon: Building2 },
              { label: 'Parish', value: projectSummary.parishProjects, icon: Church },
              { label: 'Seminary', value: projectSummary.seminaryProjects, icon: GraduationCap },
              { label: 'School', value: projectSummary.schoolProjects, icon: School },
            ].map((item) => (
              <div key={item.label} className="rounded-3xl border border-slate-200 bg-white px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                    <p className="mt-1.5 font-serif text-2xl font-bold text-slate-900">{item.value}</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                    <item.icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Filter bar ── */}
        <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search projects…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={roundedField(Boolean(searchQuery.trim()), 'h-11 w-full rounded-2xl pl-11 pr-4 text-sm font-semibold')}
              />
            </div>

            {/* Status */}
            <Select
              value={filterStatus}
              onChange={(v) => setFilterStatus(v as any)}
              options={[
                ['all', 'All statuses'],
                ['active', 'Active'],
                ['completed', 'Completed'],
                ['on-hold', 'On hold'],
              ]}
            />

            {/* Entity type — diocese only */}
            {isDiocese && (
              <div className="relative">
                <button
                  onClick={() => setShowEntityFilterDropdown((v) => !v)}
                  className={`flex h-11 items-center gap-2 rounded-2xl border bg-slate-50 px-4 text-sm font-bold text-slate-700 transition-all ${
                    showEntityFilterDropdown ? 'border-gold-500 ring-4 ring-gold-500/10' : 'border-slate-200'
                  }`}
                >
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <span className="capitalize">{filterEntityType === 'All' ? 'All types' : filterEntityType}</span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showEntityFilterDropdown ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showEntityFilterDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-100 bg-white py-2 shadow-2xl"
                    >
                      {['All', 'diocese', 'parish', 'seminary', 'school'].map((type) => (
                        <button
                          key={type}
                          onClick={() => {
                            setFilterEntityType(type as any);
                            setShowEntityFilterDropdown(false);
                          }}
                          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium transition-colors hover:bg-gold-50"
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="text-slate-400">{type !== 'All' && getEntityIcon(type)}</span>
                            <span className={filterEntityType === type ? 'font-bold text-gold-600 capitalize' : 'text-slate-600 capitalize'}>
                              {type === 'All' ? 'All types' : type}
                            </span>
                          </span>
                          {filterEntityType === type && <Check className="h-4 w-4 text-gold-600" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Category */}
            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown((v) => !v)}
                className={`flex h-11 items-center gap-2 rounded-2xl border bg-slate-50 px-4 text-sm font-bold text-slate-700 transition-all ${
                  showFilterDropdown ? 'border-gold-500 ring-4 ring-gold-500/10' : 'border-slate-200'
                }`}
              >
                <Filter className="h-4 w-4 text-slate-400" />
                <span>{filterCategory === 'All' ? 'All categories' : filterCategory}</span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showFilterDropdown ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {showFilterDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute right-0 z-50 mt-2 max-h-72 w-64 overflow-y-auto rounded-2xl border border-slate-100 bg-white py-2 shadow-2xl"
                  >
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          setFilterCategory(cat as any);
                          setShowFilterDropdown(false);
                        }}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium transition-colors hover:bg-gold-50"
                      >
                        <span className={filterCategory === cat ? 'font-bold text-gold-600' : 'text-slate-600'}>
                          {cat === 'All' ? 'All categories' : cat}
                        </span>
                        {filterCategory === cat && <Check className="h-4 w-4 text-gold-600" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Sort */}
            <Select
              icon={<ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />}
              value={sortBy}
              onChange={(v) => setSortBy(v as any)}
              options={[
                ['recent', 'Most recent'],
                ['name', 'Name (A–Z)'],
                ['progress', 'Progress'],
                ['raised', 'Amount raised'],
              ]}
            />

            {/* Date range */}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={dateField(Boolean(dateFrom), 'h-11 rounded-2xl px-3 text-sm font-semibold')}
            />
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className={dateField(Boolean(dateTo), 'h-11 rounded-2xl px-3 text-sm font-semibold')}
            />

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex h-11 items-center gap-1.5 rounded-2xl border border-slate-200 px-4 text-xs font-black uppercase tracking-[0.12em] text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Project grid ── */}
        {pagedProjects.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {pagedProjects.map((project, index) => {
                return (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="group relative"
                  >
                    <ProjectDashboardCard project={project} onClick={setSelectedProject} />
                    {/* Archive / restore — owners only */}
                    {canManageProject(project) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          persistArchived(Array.from(new Set([...archivedIds, project.id])));
                        }}
                        className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500 opacity-0 shadow-sm transition-all hover:bg-rose-500 hover:text-white group-hover:opacity-100"
                        title="Archive project"
                      >
                        <Archive className="h-3 w-3" />
                        Archive
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="mt-8 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3">
              <p className="text-xs font-semibold text-slate-400">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredProjects.length)} of{' '}
                {filteredProjects.length} project{filteredProjects.length === 1 ? '' : 's'}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-bold text-slate-600">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-slate-300 bg-white py-28 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50">
              <Search className="h-9 w-9 text-slate-300" />
            </div>
            <div className="space-y-1">
              <h3 className="font-serif text-2xl font-bold text-slate-900">No projects found</h3>
              <p className="max-w-sm text-sm text-slate-400">
                {hasActiveFilters
                  ? 'Try adjusting the search or filters to surface matching projects.'
                  : 'Projects will appear here once added.'}
              </p>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm font-bold text-gold-600 underline underline-offset-4 transition-colors hover:text-gold-700"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      <ProjectCreationForm
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        currentInstitution={currentProjectInstitution}
        onSubmit={handleAddProject}
      />
    </div>
  );
}

/** Compact styled native select used across the filter bar. */
function Select({
  value,
  onChange,
  options,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  icon?: React.ReactNode;
}) {
  return (
    <div className="relative">
      {icon && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">{icon}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectField(value !== 'all' && value !== 'All' && value !== 'recent', `h-11 rounded-2xl ${
          icon ? 'pl-9' : 'pl-4'
        } pr-9 text-sm font-bold`)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}
