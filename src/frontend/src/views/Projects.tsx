'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Filter, LayoutGrid, ChevronDown, Check, Target, User, Building2, Church, GraduationCap, School } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Project, Donation, ProjectCategory, EntityType, ProjectExpense } from '../types';
import { ProjectDashboardCard } from '../components/projects/ProjectDashboardCard';
import { ProjectDetailPage } from '../components/projects/ProjectDetailPage';
import { ProjectCreationForm } from '../components/projects/ProjectCreationForm';
import { dataService } from '../services/dataService';
import { auth } from '../firebase';
import { INITIAL_ROLES } from '../constants';

interface ProjectsProps {
  role?: string;
}

export function Projects({ role }: ProjectsProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<ProjectCategory | 'All'>('All');
  const [filterEntityType, setFilterEntityType] = useState<EntityType | 'All'>('All');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showEntityFilterDropdown, setShowEntityFilterDropdown] = useState(false);
  const [userContext, setUserContext] = useState<{ id: string, type: EntityType } | null>(null);

  const [customRoles, setCustomRoles] = useState<any[]>([]);

  useEffect(() => {
    const loadRoles = async () => {
      try {
        const res = await fetch('/api/admin/roles');
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (Array.isArray(data)) setCustomRoles(data);
      } catch {
        const stored = localStorage.getItem('diocese_roles');
        if (stored) setCustomRoles(JSON.parse(stored));
      }
    };
    loadRoles();
  }, []);

  // Load the current user's role permissions dynamically
  const permissions = useMemo(() => {
    const userRole = auth.currentUser?.role || 'bishop';
    
    // First, look in dynamically loaded custom roles
    let matchingRole = customRoles.find(r => r.id === userRole);
    
    // Fall back to INITIAL_ROLES
    if (!matchingRole) {
      matchingRole = INITIAL_ROLES.find(r => r.id === userRole);
    }

    if (matchingRole) {
      return {
        manage_projects: matchingRole.permissions.manage_projects !== false,
        view_projects: matchingRole.permissions.view_projects !== false
      };
    }
    return {
      manage_projects: userRole === 'bishop' || userRole === 'admin',
      view_projects: userRole === 'bishop' || userRole === 'admin'
    };
  }, [customRoles, auth.currentUser]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user: any) => {
      if (user) {
        const isDioceseRole = ['bishop', 'admin', 'chancellor', 'diocesan_oeconomus', 'finance_staff'].includes(user.role);
        setUserContext({
          id: user.displayName || 'Unknown Entity',
          type: isDioceseRole ? 'diocese' : user.role as EntityType
        });
      }
    });
    return () => unsubscribe();
  }, []);

  if (!permissions.view_projects) {
    return (
      <div className="min-h-screen bg-church-light p-4 md:p-8 flex items-center justify-center">
        <div className="bg-white p-12 rounded-[40px] border border-gray-100 shadow-xl max-w-md text-center space-y-6">
          <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mx-auto">
            <Building2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-church-black">Access Denied</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            Your account role does not have viewing permissions for Diocesan and Parish Projects. Please contact your diocesan administrator to request access.
          </p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (!userContext) return;

    // If bishop, we can see all projects or filter by type
    // If others, we only see our own projects
    const subEntityType = userContext.type === 'diocese' 
      ? (filterEntityType === 'All' ? undefined : filterEntityType) 
      : userContext.type;
    const subEntityId = userContext.type === 'diocese' ? undefined : userContext.id;

    const unsubscribeProjects = dataService.subscribeToProjects(
      (updatedProjects) => {
        setProjects(updatedProjects);
      },
      subEntityId,
      subEntityType as any
    );

    const unsubscribeDonations = dataService.subscribeToDonations(
      (updatedDonations) => {
        setDonations(updatedDonations);
      }
    );

    const unsubscribeExpenses = dataService.subscribeToExpenses(
      (updatedExpenses) => {
        setExpenses(updatedExpenses);
      }
    );

    return () => {
      unsubscribeProjects();
      unsubscribeDonations();
      unsubscribeExpenses();
    };
  }, [userContext, filterEntityType]);

  const isDiocese = permissions.view_diocese === true;

  const filteredProjects = projects.filter(p => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(query) || 
                         p.entityId.toLowerCase().includes(query) ||
                         p.category.toLowerCase().includes(query);
    const matchesCategory = filterCategory === 'All' || p.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const projectSummary = useMemo(() => {
    const seminaryProjects = projects.filter((project) => project.entityType === 'seminary').length;
    const parishProjects = projects.filter((project) => project.entityType === 'parish').length;
    const schoolProjects = projects.filter((project) => project.entityType === 'school').length;

    return { seminaryProjects, parishProjects, schoolProjects };
  }, [projects]);

  const handleAddProject = (newProject: Omit<Project, 'id' | 'currentAmount' | 'healthScore' | 'successProbability' | 'recommendation' | 'entityId' | 'entityType'>) => {
    if (!userContext) return;

    const project: Project = {
      ...newProject,
      id: Math.random().toString(36).substr(2, 9),
      currentAmount: 0,
      totalExpenses: 0,
      healthScore: 75,
      successProbability: 65,
      recommendation: "Begin with a formal announcement during parish services.",
      entityId: userContext.id,
      entityType: userContext.type
    };
    dataService.saveProject(project);
  };

  const handleAddDonation = (newDonation: Omit<Donation, 'id'>) => {
    dataService.saveDonation(newDonation as Donation);
    
    // Update project current amount in dataService
    const projectToUpdate = projects.find(p => p.id === newDonation.projectId);
    if (projectToUpdate) {
      dataService.saveProject({
        ...projectToUpdate,
        currentAmount: projectToUpdate.currentAmount + newDonation.amount
      });
    }

    // Update selected project if it's the one receiving donation
    if (selectedProject?.id === newDonation.projectId) {
      setSelectedProject(prev => prev ? { ...prev, currentAmount: prev.currentAmount + newDonation.amount } : null);
    }
  };

  const handleAddExpense = (newExpense: Omit<ProjectExpense, 'id'>) => {
    dataService.saveExpense(newExpense as ProjectExpense);

    const projectToUpdate = projects.find((p) => p.id === newExpense.projectId);
    if (projectToUpdate) {
      const updatedTotalExpenses = (projectToUpdate.totalExpenses || 0) + newExpense.amount;
      dataService.saveProject({
        ...projectToUpdate,
        totalExpenses: updatedTotalExpenses,
      });
    }

    if (selectedProject?.id === newExpense.projectId) {
      setSelectedProject((prev) => prev ? { ...prev, totalExpenses: (prev.totalExpenses || 0) + newExpense.amount } : null);
    }
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
      // Keep other details like description, targetAmount, category, etc.
    };
    
    dataService.saveProject(clonedProject);
    setSelectedProject(clonedProject); // Navigate to the new cloned project
  };

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'diocese': return <Building2 className="w-4 h-4" />;
      case 'parish': return <Church className="w-4 h-4" />;
      case 'seminary': return <GraduationCap className="w-4 h-4" />;
      case 'school': return <School className="w-4 h-4" />;
      default: return <Building2 className="w-4 h-4" />;
    }
  };

  if (selectedProject) {
    return (
      <ProjectDetailPage 
        project={selectedProject}
        donations={donations.filter(d => d.projectId === selectedProject.id)}
        expenses={expenses.filter((expense) => expense.projectId === selectedProject.id)}
        onBack={() => setSelectedProject(null)}
        onAddDonation={handleAddDonation}
        onAddExpense={handleAddExpense}
        onCloneProject={handleCloneProject}
        role={role}
        canManageProjects={permissions.manage_projects}
      />
    );
  }

  return (
    <div className="min-h-screen bg-church-light p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
          <div>
            <h1 className="text-4xl font-serif font-bold text-church-black tracking-tight">Projects</h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs font-bold text-gold-600 uppercase tracking-widest bg-gold-50 px-2 py-1 rounded-md">
                {userContext?.type}
              </span>
              <span className="text-sm text-gray-500 font-medium">
                {userContext?.id}
              </span>
            </div>
            <p className="text-base text-gray-500 font-medium mt-2 max-w-2xl">
              Track fundraising progress, monitor delivery status, and compare project performance across diocesan institutions.
            </p>
          </div>
          {permissions.manage_projects && (
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsCreateModalOpen(true)}
              className="px-8 py-4 bg-gold-500 text-church-green-dark rounded-2xl font-bold hover:bg-gold-600 transition-all shadow-xl shadow-gold-500/20 flex items-center gap-3 whitespace-nowrap"
            >
              <Plus className="w-5 h-5" />
              NEW PROJECT
            </motion.button>
          )}
        </div>

        {isDiocese && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            {[
              { label: 'Parish Projects', value: projectSummary.parishProjects, icon: Church, tone: 'bg-blue-50 text-blue-700 border-blue-100' },
              { label: 'Seminary Projects', value: projectSummary.seminaryProjects, icon: GraduationCap, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
              { label: 'School Projects', value: projectSummary.schoolProjects, icon: School, tone: 'bg-amber-50 text-amber-700 border-amber-100' },
            ].map((item) => (
              <div key={item.label} className={`rounded-3xl border px-5 py-4 ${item.tone}`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-70">{item.label}</p>
                    <p className="mt-2 text-2xl font-serif font-bold">{item.value}</p>
                  </div>
                  <div className="h-11 w-11 rounded-2xl bg-white/70 flex items-center justify-center">
                    <item.icon className="w-5 h-5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          {[
            { label: 'Active Projects', value: projects.length, icon: LayoutGrid, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Total Raised', value: `₱${projects.reduce((acc, p) => acc + p.currentAmount, 0).toLocaleString()}`, icon: Target, color: 'text-gold-600', bg: 'bg-gold-50' },
            { label: 'Total Goal', value: `₱${projects.reduce((acc, p) => acc + p.targetAmount, 0).toLocaleString()}`, icon: Target, color: 'text-church-green', bg: 'bg-church-green/5' },
            { label: 'Total Donors', value: donations.length, icon: User, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm"
            >
              <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center mb-4`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
              <p className="text-2xl font-serif font-bold text-church-black mt-1">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row gap-4 mb-10">
          <div className="flex-1 relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-gold-500 transition-colors" />
            <input 
              type="text"
              placeholder="Search by project name, institution, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-14 pr-6 py-4 bg-white border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all shadow-sm placeholder:text-gray-300"
            />
          </div>
          
          <div className="flex gap-4">
            {isDiocese && (
              <div className="relative">
                <button 
                  onClick={() => setShowEntityFilterDropdown(!showEntityFilterDropdown)}
                  className={`px-6 py-4 bg-white border border-gray-100 rounded-2xl text-sm font-bold text-church-black flex items-center gap-4 hover:bg-gray-50 transition-all shadow-sm ${showEntityFilterDropdown ? 'ring-4 ring-gold-500/10 border-gold-500' : ''}`}
                >
                  <Building2 className="w-4 h-4 text-gold-600" />
                  <span className="uppercase tracking-widest text-[11px]">{filterEntityType}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${showEntityFilterDropdown ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showEntityFilterDropdown && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-3 w-64 bg-white rounded-3xl shadow-2xl border border-gray-100 py-3 z-50 overflow-hidden"
                    >
                      <div className="px-4 py-2 mb-2 border-b border-gray-50">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Institution Type</p>
                      </div>
                      {['All', 'diocese', 'parish', 'seminary', 'school'].map((type) => (
                        <button
                          key={type}
                          onClick={() => {
                            setFilterEntityType(type as any);
                            setShowEntityFilterDropdown(false);
                          }}
                          className="w-full px-4 py-3 text-left text-sm font-medium hover:bg-gold-50 flex items-center justify-between transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="text-gold-600">
                              {type !== 'All' && getEntityIcon(type)}
                            </div>
                            <span className={filterEntityType === type ? 'text-gold-600 font-bold capitalize' : 'text-gray-600 group-hover:text-gold-700 capitalize'}>
                              {type}
                            </span>
                          </div>
                          {filterEntityType === type && (
                            <Check className="w-4 h-4 text-gold-600" />
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div className="relative">
              <button 
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className={`px-6 py-4 bg-white border border-gray-100 rounded-2xl text-sm font-bold text-church-black flex items-center gap-4 hover:bg-gray-50 transition-all shadow-sm ${showFilterDropdown ? 'ring-4 ring-gold-500/10 border-gold-500' : ''}`}
              >
                <Filter className="w-4 h-4 text-gold-600" />
                <span className="uppercase tracking-widest text-[11px]">{filterCategory}</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${showFilterDropdown ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showFilterDropdown && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-3 w-72 bg-white rounded-3xl shadow-2xl border border-gray-100 py-3 z-50 overflow-hidden"
                  >
                    <div className="px-4 py-2 mb-2 border-b border-gray-50">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Filter by Category</p>
                    </div>
                    {['All', 'Building/Construction', 'Equipment', 'Programs/Outreach', 'Education', 'Emergency/Relief', 'Liturgical', 'Operational', 'Infrastructure', 'Heritage', 'Charity', 'Facilities'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          setFilterCategory(cat as any);
                          setShowFilterDropdown(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm font-medium hover:bg-gold-50 flex items-center justify-between transition-colors group"
                      >
                        <span className={filterCategory === cat ? 'text-gold-600 font-bold' : 'text-gray-600 group-hover:text-gold-700'}>
                          {cat}
                        </span>
                        {filterCategory === cat && (
                          <Check className="w-4 h-4 text-gold-600" />
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Project Grid */}
        <AnimatePresence mode="wait">
          {filteredProjects.length > 0 ? (
            <motion.div 
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
            >
              {filteredProjects.map((project, index) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <ProjectDashboardCard 
                    project={project} 
                    onClick={setSelectedProject}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div 
              key="empty"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-32 bg-white rounded-[40px] border border-dashed border-gray-200 shadow-sm"
            >
              <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mx-auto mb-6">
                <Search className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-serif font-bold text-church-black mb-2">No projects found</h3>
              <p className="text-gray-400 max-w-sm mx-auto">Try adjusting the search or filters to surface matching projects for this view.</p>
              <button 
                onClick={() => { setSearchQuery(''); setFilterCategory('All'); setFilterEntityType('All'); }}
                className="mt-8 text-gold-600 font-bold text-sm hover:text-gold-700 transition-colors underline underline-offset-8"
              >
                Clear all filters
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ProjectCreationForm 
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleAddProject}
      />
    </div>
  );
}
