'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Search,
  LayoutGrid,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Target,
  User,
  Building2,
  Church,
  GraduationCap,
  School,
  Archive,
  Eye,
  Briefcase,
  WalletCards,
  TrendingUp,
  Clock3,
  SlidersHorizontal,
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
import { FilterModal, FilterField } from '../components/ui/FilterModal';
import { formatCurrency } from '../lib/format';

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
  const [filterInstitution, setFilterInstitution] = useState<string>('all'); // specific institution name
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'progress' | 'raised'>('recent');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showEntityFilterDropdown, setShowEntityFilterDropdown] = useState(false);
  const [userContext, setUserContext] = useState<{ id: string; name: string; type: EntityType } | null>(null);
  const { permissions } = usePermissions();
  const canAccessProjects = permissions.view_projects === true || permissions.manage_projects === true;

  // Role-based visibility
  const isDiocese = permissions.view_diocese === true;
  // Oversight roles that see multiple schools but do NOT own a single institution.
  // Finance Supervisor (view_school_cluster=true, manage_projects=false) is view-only.
  // School Superintendent Supervisor (view_school_all=true, manage_projects=true) CAN manage.
  const isSchoolOverseer =
    !isDiocese && (permissions.view_school_all === true || permissions.view_school_cluster === true);
  const isOverview = isDiocese || isSchoolOverseer;
  // Bug 1.6: School Superintendent Supervisor has manage_projects=true and should be
  // able to add/edit projects. Only block creation for pure-viewer overseer roles
  // (e.g. Finance Supervisor whose manage_projects is false).
  const canCreate = permissions.manage_projects === true && !(isSchoolOverseer && !permissions.manage_projects);
  const canManageProject = (p?: Project | null) =>
    permissions.manage_projects === true && (isDiocese ? p?.entityType === 'diocese' : true);

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
  // Confirm before archiving a project ("Are you sure you want to archive this?").
  const [archiveConfirm, setArchiveConfirm] = useState<{ id: string; name: string } | null>(null);

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

  // Filtering + sorting + pagination
  const filteredProjects = useMemo(() => {
    let out = projects.slice();

    // School overseers receive every type from the API, so keep only schools.
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
    if (filterInstitution !== 'all') out = out.filter((p) => (p.entityName ?? p.entityId) === filterInstitution);
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
  }, [
    projects,
    isSchoolOverseer,
    isDiocese,
    filterEntityType,
    filterStatus,
    filterInstitution,
    isArchived,
    searchQuery,
    filterCategory,
    dateFrom,
    dateTo,
    sortBy,
  ]);

  // Specific-institution options (per-institution filter, like the Events tab),
  // scoped to the currently selected entity type.
  const institutionOptions = useMemo(() => {
    const names = new Set<string>();
    for (const p of projects) {
      if (isArchived(p.id)) continue;
      if (isDiocese && filterEntityType !== 'All' && p.entityType !== filterEntityType) continue;
      const n = p.entityName ?? p.entityId;
      if (n) names.add(n);
    }
    return Array.from(names).sort();
  }, [projects, isDiocese, filterEntityType, isArchived]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterCategory, filterEntityType, filterStatus, filterInstitution, sortBy, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedProjects = filteredProjects.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const visibleForStats = useMemo(
    () =>
      (isSchoolOverseer ? projects.filter((p) => p.entityType === 'school') : projects).filter(
        (p) => !isArchived(p.id),
      ),
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
    filterInstitution !== 'all' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    (isDiocese && filterEntityType !== 'All');

  // Count of active filters inside the modal (search stays inline, so excluded).
  const modalFilterCount =
    (filterCategory !== 'All' ? 1 : 0) +
    (filterStatus !== 'all' ? 1 : 0) +
    (filterInstitution !== 'all' ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (sortBy !== 'recent' ? 1 : 0) +
    (isDiocese && filterEntityType !== 'All' ? 1 : 0);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterCategory('All');
    setFilterEntityType('All');
    setFilterStatus('all');
    setFilterInstitution('all');
    setSortBy('recent');
    setDateFrom('');
    setDateTo('');
  };

  // Handlers
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

  const totalRaised = visibleForStats.reduce((a, p) => a + p.currentAmount, 0);
  const totalGoal = visibleForStats.reduce((a, p) => a + p.targetAmount, 0);
  const portfolioProgress = totalGoal > 0 ? Math.min(100, Math.round((totalRaised / totalGoal) * 100)) : 0;
  const activeProjects = visibleForStats.filter((p) => p.status === 'active').length;
  const dueSoonProjects = visibleForStats.filter((p) => {
    const daysLeft = Math.ceil((new Date(p.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return p.status === 'active' && daysLeft >= 0 && daysLeft <= 30;
  }).length;

  const summaryCards = [
    { label: 'Total', value: visibleForStats.length, icon: LayoutGrid },
    {
      label: 'Raised',
      value: formatCurrency(totalRaised),
      icon: WalletCards,
    },
    {
      label: 'Goal',
      value: formatCurrency(totalGoal),
      icon: Target,
    },
    {
      label: 'Donors',
      value: donations.filter((d) => visibleForStats.some((p) => p.id === d.projectId)).length,
      icon: User,
    },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f5] pt-6 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1500px]">
        {/* Header */}
        <div className="mb-5 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="relative overflow-hidden bg-slate-950 p-6 text-white md:p-8">
              <div className="absolute right-[-80px] top-[-140px] h-72 w-72 rounded-full border border-gold-400/20" />
              <div className="absolute bottom-[-110px] right-20 h-60 w-60 rounded-full border border-white/10" />
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-gold-400/30 bg-gold-400/10">
                  <Briefcase className="h-6 w-6 text-gold-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-400">
                      Diocesan Projects
                    </p>
                    {isSchoolOverseer && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white/70">
                        <Eye className="h-3 w-3" /> View only
                      </span>
                    )}
                  </div>
                  <h1 className="mt-2 font-serif text-4xl font-bold leading-none md:text-6xl">Projects</h1>
                  <p className="mt-3 max-w-2xl text-base font-semibold leading-relaxed text-white/72">
                    {isDiocese
                      ? 'Track fundraising momentum, deadlines, and delivery across every institution in the diocese.'
                      : isSchoolOverseer
                        ? 'Oversee fundraising momentum and delivery across all diocesan schools.'
                        : `Manage project funding, timing, and follow-through for ${userContext?.name || 'your institution'}.`}
                  </p>
                  <div className="mt-6 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setFilterStatus('active')}
                      className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 text-left transition hover:border-gold-400/40 hover:bg-white/[0.1]"
                    >
                      <Clock3 className="mb-3 h-4 w-4 text-gold-400" />
                      <p className="text-2xl font-black leading-none">{activeProjects}</p>
                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Active</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSortBy('progress')}
                      className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 text-left transition hover:border-gold-400/40 hover:bg-white/[0.1]"
                    >
                      <TrendingUp className="mb-3 h-4 w-4 text-gold-400" />
                      <p className="text-2xl font-black leading-none">{portfolioProgress}%</p>
                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Funded</p>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDateTo(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
                      }
                      className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.07] p-3 text-left transition hover:border-gold-400/40 hover:bg-white/[0.1] sm:col-span-1"
                    >
                      <Target className="mb-3 h-4 w-4 text-gold-400" />
                      <p className="text-2xl font-black leading-none">{dueSoonProjects}</p>
                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Due Soon</p>
                    </button>
                  </div>
                </div>
              </div>

              {canCreate && (
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="mt-6 inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-gold-500 px-5 text-[11px] font-black uppercase tracking-[0.18em] text-black shadow-lg shadow-gold-500/20 transition-all hover:-translate-y-0.5 hover:bg-gold-400"
                >
                  <Plus className="h-4 w-4" /> New Project
                </button>
              )}
            </div>
            <div className="border-t border-slate-200 bg-[#fbfaf6] p-5 lg:border-l lg:border-t-0 md:p-7">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Portfolio Pulse</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">Live funding summary for visible projects</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-gold-400">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
              </div>
              <div className="mb-6">
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="font-serif text-3xl font-bold leading-none text-slate-950">
                      {formatCurrency(totalRaised)}
                    </p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Raised of {formatCurrency(totalGoal)}
                    </p>
                  </div>
                  <p className="font-serif text-4xl font-bold leading-none text-gold-600">{portfolioProgress}%</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white shadow-inner">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-gold-400 via-gold-500 to-slate-950"
                    style={{ width: `${portfolioProgress}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {summaryCards.map((c) => (
                  <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                        {c.label}
                      </span>
                      <c.icon className="h-4 w-4 text-gold-500" />
                    </div>
                    <p className="mt-3 truncate text-xl font-black leading-none text-slate-950">{c.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Diocese breakdown */}
        {isDiocese && (
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Diocese', value: projectSummary.dioceseProjects, icon: Building2 },
              { label: 'Parish', value: projectSummary.parishProjects, icon: Church },
              { label: 'Seminary', value: projectSummary.seminaryProjects, icon: GraduationCap },
              { label: 'School', value: projectSummary.schoolProjects, icon: School },
            ].map((item) => (
              <button
                type="button"
                key={item.label}
                onClick={() => {
                  setFilterEntityType(item.label.toLowerCase() as EntityType);
                  setFilterInstitution('all');
                }}
                className="group rounded-3xl border border-slate-200 bg-white px-5 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-gold-400/70 hover:shadow-lg hover:shadow-slate-200/60"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                    <p className="mt-1.5 font-serif text-2xl font-bold text-slate-900">{item.value}</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition group-hover:bg-slate-950 group-hover:text-gold-400">
                    <item.icon className="h-5 w-5" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Filter bar */}
        <div className="sticky top-3 z-30 mb-6 rounded-[28px] border border-slate-200 bg-white/92 p-3 shadow-[0_16px_36px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={roundedField(
                  Boolean(searchQuery.trim()),
                  'h-12 w-full rounded-2xl pl-11 pr-4 text-sm font-semibold',
                )}
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
              {[
                ['all', 'All'],
                ['active', 'Active'],
                ['completed', 'Completed'],
                ['on-hold', 'On hold'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilterStatus(value as any)}
                  className={`h-12 shrink-0 rounded-2xl px-4 text-xs font-black uppercase tracking-[0.14em] transition ${
                    filterStatus === value
                      ? 'bg-slate-950 text-white shadow-lg shadow-slate-900/15'
                      : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <FilterModal activeCount={modalFilterCount} onClear={clearFilters}>
              <FilterField label="Status">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className={selectField(filterStatus !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="on-hold">On hold</option>
                </select>
              </FilterField>

              {isDiocese && (
                <FilterField label="Institution type">
                  <select
                    value={filterEntityType}
                    onChange={(e) => {
                      setFilterEntityType(e.target.value as any);
                      setFilterInstitution('all');
                    }}
                    className={selectField(
                      filterEntityType !== 'All',
                      'h-11 w-full rounded-2xl px-4 text-sm font-bold capitalize',
                    )}
                  >
                    <option value="All">All types</option>
                    <option value="diocese">Diocese</option>
                    <option value="parish">Parish</option>
                    <option value="seminary">Seminary</option>
                    <option value="school">School</option>
                  </select>
                </FilterField>
              )}

              <FilterField label="Institution">
                <select
                  value={filterInstitution}
                  onChange={(e) => setFilterInstitution(e.target.value)}
                  className={selectField(filterInstitution !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
                >
                  <option value="all">All institutions</option>
                  {institutionOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </FilterField>

              <FilterField label="Category">
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value as any)}
                  className={selectField(filterCategory !== 'All', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat === 'All' ? 'All categories' : cat}
                    </option>
                  ))}
                </select>
              </FilterField>

              <FilterField label="Sort by">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className={selectField(sortBy !== 'recent', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
                >
                  <option value="recent">Most recent</option>
                  <option value="name">Name (A-Z)</option>
                  <option value="progress">Progress</option>
                  <option value="raised">Amount raised</option>
                </select>
              </FilterField>

              <div className="grid grid-cols-2 gap-3">
                <FilterField label="From">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className={dateField(Boolean(dateFrom), 'h-11 w-full rounded-2xl px-3 text-sm font-semibold')}
                  />
                </FilterField>
                <FilterField label="To">
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => setDateTo(e.target.value)}
                    className={dateField(Boolean(dateTo), 'h-11 w-full rounded-2xl px-3 text-sm font-semibold')}
                  />
                </FilterField>
              </div>
            </FilterModal>
          </div>
        </div>

        {/* Project grid */}
        {pagedProjects.length > 0 ? (
          <>
            <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
              <aside className="hidden xl:block">
                <div className="sticky top-28 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 bg-slate-950 p-5 text-white">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-400">Focus Board</p>
                    <p className="mt-2 text-sm font-semibold leading-relaxed text-white/65">
                      Use search, quick status tabs, and filters to narrow the worklist.
                    </p>
                  </div>
                  <div className="space-y-3 p-5">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Visible</p>
                      <p className="mt-1 font-serif text-3xl font-bold text-slate-950">{filteredProjects.length}</p>
                    </div>
                    <div className="rounded-2xl bg-[#fbfaf6] p-4">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Page</p>
                      <p className="mt-1 font-serif text-3xl font-bold text-slate-950">
                        {safePage}
                        <span className="text-base text-slate-400">/{totalPages}</span>
                      </p>
                    </div>
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className="w-full rounded-2xl border border-gold-400/60 bg-gold-400/10 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-950 transition hover:bg-gold-400/20"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                </div>
              </aside>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
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
                      {canManageProject(project) && (() => {
                        const now = new Date().getTime();
                        const start = new Date(project.startDate).getTime();
                        const end = new Date(project.endDate).getTime();
                        const isActive = project.status === 'active' || (now >= start && now <= end);

                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isActive) return;
                              setArchiveConfirm({ id: project.id, name: project.name });
                            }}
                            className={`absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition-all group-hover:opacity-100 ${
                              isActive
                                ? 'opacity-0 text-slate-300 cursor-not-allowed hover:bg-slate-100'
                                : 'opacity-0 text-slate-500 hover:bg-rose-500 hover:text-white'
                            }`}
                            title={isActive ? "Active projects cannot be archived" : "Archive project"}
                            disabled={isActive}
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                        );
                      })()}
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Pagination */}
            <div className="mt-8 flex flex-col gap-3 rounded-[26px] border border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold text-slate-400">
                Showing {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, filteredProjects.length)} of{' '}
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

      {/* Confirm before archiving a project */}
      <AnimatePresence>
        {archiveConfirm && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setArchiveConfirm(null)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              <div className="space-y-6 p-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-100 bg-amber-50 text-amber-500">
                  <Archive className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900">Archive project</h3>
                  <p className="text-xs font-semibold leading-relaxed text-slate-500">
                    Are you sure you want to archive &quot;{archiveConfirm.name}&quot;? You can restore it later from
                    Archives.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setArchiveConfirm(null)}
                    className="flex-1 rounded-xl border border-slate-200 px-6 py-3 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      persistArchived(Array.from(new Set([...archivedIds, archiveConfirm.id])));
                      setArchiveConfirm(null);
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-white shadow-lg transition-colors hover:bg-amber-600"
                  >
                    <Archive className="h-4 w-4" />
                    Confirm
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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
        className={selectField(
          value !== 'all' && value !== 'All' && value !== 'recent',
          `h-11 rounded-2xl ${icon ? 'pl-9' : 'pl-4'} pr-9 text-sm font-bold`,
        )}
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
