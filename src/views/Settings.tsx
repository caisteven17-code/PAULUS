'use client';

import React, { useState } from 'react';
import { Users, UserPlus, Save, Database, ArrowRight, Pencil, Search, ShieldCheck } from 'lucide-react';

import { Role } from '../App';
import { UserRole, Parish, Seminary, DiocesanSchool } from '../types';
import { INITIAL_ROLES, VICARIATES, CLASSES, INITIAL_PARISHES, INITIAL_SEMINARIES, INITIAL_SCHOOLS } from '../constants';
import { auth } from '../firebase';
import { dataService } from '../services/dataService';
import { supabaseBrowser } from '../lib/supabase';

interface SettingsProps {
  onBack: () => void;
  onLogout: () => void;
  onNavigate?: (page: string) => void;
  role?: Role;
  initialTab?: string;
}

import { UserRoleControl } from '../components/settings/UserRoleControl';
import { DataManagementControl } from '../components/settings/DataManagementControl';
import { EntityManagementControl } from '../components/settings/EntityManagementControl';
import { ParishClassificationLogic } from '../components/settings/ParishClassificationLogic';
import { DashboardHeader } from '../components/layout/DashboardHeader';
import { getAccessRoleLabel, getAppRole, normalizeAccessRole } from '../lib/access';

export function Settings({ onBack, onLogout, onNavigate, role = 'bishop', initialTab }: SettingsProps) {
  const [activeTab, setActiveTab] = useState(initialTab || ((role === 'bishop' || role === 'admin') ? 'user-management' : 'security'));
  type InstitutionType = 'parish' | 'seminary' | 'school';

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  
  const [accounts, setAccounts] = useState<any[]>([]);
  const [roles, setRoles] = useState<UserRole[]>(INITIAL_ROLES);
  const [parishes, setParishes] = useState<Parish[]>([]);
  const [seminaries, setSeminaries] = useState<Seminary[]>([]);
  const [schools, setSchools] = useState<DiocesanSchool[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Load users from Supabase (with localStorage fallback) ─────────────
  const fetchAccounts = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('API error');
      const data: any[] = await res.json();
      setAccounts(data.map((u) => ({
        id:         u.id,
        entity:     u.entityName  || 'Unassigned',
        leader:     u.displayName || u.email?.split('@')[0] || '',
        email:      u.email       || '',
        role:       getAccessRoleLabel(u.roleId || u.role),
        roleId:     normalizeAccessRole(u.roleId || u.role),
        status:     u.status      || 'active',
        entityId:   u.entityId,
        entityType: u.entityType,
      })));
    } catch {
      // Fallback: read from localStorage (demo / offline mode)
      const stored: any[] = JSON.parse(localStorage.getItem('users') || '[]');
      setAccounts(stored.map((u) => ({
        id:         u.id,
        entity:     u.entityName  || 'Unassigned',
        leader:     u.displayName || u.email.split('@')[0],
        email:      u.email,
        role:       getAccessRoleLabel(u.roleId || u.accessRole || u.role),
        roleId:     normalizeAccessRole(u.roleId || u.accessRole || u.role),
        status:     u.status      || 'active',
        entityId:   u.entityId,
        entityType: u.entityType,
      })));
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  // ── Load entities from Supabase (with constants fallback) ─────────────
  React.useEffect(() => {
    const fetchEntities = async () => {
      try {
        const res = await fetch('/api/admin/entities');
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        if (Array.isArray(data.parishes))   setParishes(data.parishes);
        if (Array.isArray(data.seminaries)) setSeminaries(data.seminaries);
        if (Array.isArray(data.schools))    setSchools(data.schools);
      } catch {
        // Fallback to compiled-in constants
        setParishes(INITIAL_PARISHES as Parish[]);
        setSeminaries(INITIAL_SEMINARIES as Seminary[]);
        setSchools(INITIAL_SCHOOLS as DiocesanSchool[]);
      }
    };
    fetchEntities();
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [accountToArchive, setAccountToArchive] = useState<number | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [showAccountSuccess, setShowAccountSuccess] = useState<{show: boolean, message: string}>({ show: false, message: '' });
  const [showPasswordSuccess, setShowPasswordSuccess] = useState(false);
  const [showProfileSuccess, setShowProfileSuccess] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', new: '' });
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [profileForm, setProfileForm] = useState(() => {
    const currentUser = auth.currentUser || {};
    const nameParts = (currentUser.displayName || '').split(' ').filter(Boolean);
    return {
      firstName: currentUser.firstName || nameParts[0] || '',
      lastName: currentUser.lastName || nameParts.slice(1).join(' ') || '',
      nickName: currentUser.nickName || '',
      email: currentUser.email || '',
      contactNumber: currentUser.contactNumber || '',
      address: currentUser.address || '',
      position: currentUser.position || currentUser.roleLabel || '',
      entityName: currentUser.entityName || '',
      emergencyContact: currentUser.emergencyContact || '',
      notes: currentUser.notes || ''
    };
  });

  const handleUpdatePassword = async () => {
    if (!passwords.new) return;
    try {
      // Update via Supabase Auth (works when logged in with a real Supabase session)
      const { error } = await supabaseBrowser.auth.updateUser({ password: passwords.new });
      if (error) throw error;
    } catch {
      // Also update the localStorage demo record so offline sessions work
      const currentUser = auth.currentUser;
      if (currentUser) {
        localStorage.setItem('currentUser', JSON.stringify({
          ...currentUser,
          passwordUpdatedAt: new Date().toISOString(),
        }));
      }
    }
    setShowPasswordSuccess(true);
    setPasswords({ current: '', new: '' });
    setTimeout(() => setShowPasswordSuccess(false), 3000);
  };

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const currentUser = auth.currentUser || {};
    const displayName = [profileForm.firstName, profileForm.lastName].filter(Boolean).join(' ') || currentUser.displayName || profileForm.email;
    const updatedUser = {
      ...currentUser,
      ...profileForm,
      displayName,
      email: profileForm.email,
      entityName: profileForm.entityName || currentUser.entityName,
      updatedAt: new Date().toISOString(),
    };

    // Persist to Supabase if we have a real session
    await supabaseBrowser.auth.updateUser({
      data: {
        displayName,
        firstName:       profileForm.firstName,
        lastName:        profileForm.lastName,
        nickName:        profileForm.nickName,
        contactNumber:   profileForm.contactNumber,
        address:         profileForm.address,
        position:        profileForm.position,
        entityName:      profileForm.entityName || currentUser.entityName,
        emergencyContact: profileForm.emergencyContact,
        notes:           profileForm.notes,
      },
    }).catch(() => {
      // Ignore — may be a demo/offline session
    });

    // Always update localStorage so the profile reflects in the UI
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    setShowProfileSuccess(true);
    setTimeout(() => setShowProfileSuccess(false), 3000);
  };

  // Auto-save roles when they change
  React.useEffect(() => {
    // localStorage.setItem('diocese_roles', JSON.stringify(roles));
  }, [roles]);

  // Auto-save accounts when they change
  React.useEffect(() => {
    // localStorage.setItem('diocese_accounts', JSON.stringify(accounts));
  }, [accounts]);

  // Auto-save entities when they change
  React.useEffect(() => {
    // localStorage.setItem('diocese_parishes', JSON.stringify(parishes));
  }, [parishes]);

  React.useEffect(() => {
    // localStorage.setItem('diocese_seminaries', JSON.stringify(seminaries));
  }, [seminaries]);

  React.useEffect(() => {
    // localStorage.setItem('diocese_schools', JSON.stringify(schools));
  }, [schools]);

  const [searchQuery, setSearchQuery] = useState('');
  
  const [formState, setFormState] = useState({
    institutionType: '' as InstitutionType | '',
    entity:   '',
    leader:   '',
    email:    '',
    role:     INITIAL_ROLES[2].id,
    password: '',
  });
  const [showInstitutionSuggestions, setShowInstitutionSuggestions] = useState(false);

  const institutionOptions: { id: InstitutionType; label: string }[] = [
    { id: 'parish', label: 'Parish' },
    { id: 'seminary', label: 'Seminary' },
    { id: 'school', label: 'School' }
  ];

  const institutionNames = React.useMemo(() => {
    const list = formState.institutionType === 'school'
      ? [...schools, ...INITIAL_SCHOOLS]
      : formState.institutionType === 'seminary'
        ? [...seminaries, ...INITIAL_SEMINARIES]
        : formState.institutionType === 'parish'
          ? [...parishes, ...INITIAL_PARISHES]
          : [];

    return Array.from(new Set(list.map((item) => item.name))).sort();
  }, [formState.institutionType, parishes, seminaries, schools]);

  const institutionNameSuggestions = React.useMemo(() => {
    const query = formState.entity.trim().toLowerCase();
    const matches = query
      ? institutionNames.filter((name) => name.toLowerCase().includes(query))
      : institutionNames;

    return matches.slice(0, 8);
  }, [formState.entity, institutionNames]);

  const institutionNameLabel = formState.institutionType === 'seminary'
    ? 'Seminary Name'
    : formState.institutionType === 'school'
      ? 'School Name'
      : 'Parish Name';

  const institutionNamePlaceholder = formState.institutionType
    ? `Type ${institutionNameLabel.toLowerCase()}`
    : 'Select an institution type first';

  const handleInstitutionTypeChange = (institutionType: InstitutionType) => {
    const defaultRoleByType: Record<InstitutionType, string> = {
      parish: 'parish_priest',
      seminary: 'seminary_rector',
      school: 'school_registrar'
    };

    setFormState({
      ...formState,
      institutionType,
      entity: '',
      role: defaultRoleByType[institutionType] || formState.role
    });
    setShowInstitutionSuggestions(false);
  };

  const findSelectedEntity = (entityName: string, accessRoleId: string) => {
    const appRole = getAppRole(accessRoleId);
    const entityType = formState.institutionType || (appRole === 'school' ? 'school' : appRole === 'seminary' ? 'seminary' : 'parish');
    const entityList = entityType === 'school'
      ? [...schools, ...INITIAL_SCHOOLS]
      : entityType === 'seminary'
        ? [...seminaries, ...INITIAL_SEMINARIES]
        : [...parishes, ...INITIAL_PARISHES];
    const entity = entityList.find((item) => item.name === entityName);

    return {
      appRole,
      entityType,
      entityId: entity?.id || entityName.toLowerCase().replace(/\s+/g, '_'),
    };
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.institutionType || !formState.entity || !formState.leader || !formState.email || !formState.role) return;
    if (editingAccountId === null && !formState.password) {
      setShowAccountSuccess({ show: true, message: 'Error: Password is required for new accounts.' });
      setTimeout(() => setShowAccountSuccess({ show: false, message: '' }), 4000);
      return;
    }

    try {
      const accessRole    = normalizeAccessRole(formState.role);
      const selectedEntity = findSelectedEntity(formState.entity, accessRole);

      if (editingAccountId !== null) {
        // ── Update existing user ──────────────────────────────────────────
        const res = await fetch('/api/admin/users', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            id:          editingAccountId.toString(),
            email:       formState.email,
            displayName: formState.leader,
            role:        accessRole,
            entityName:  formState.entity,
            entityType:  selectedEntity.entityType,
            entityId:    selectedEntity.entityId,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Update failed');
        setShowAccountSuccess({ show: true, message: 'Account updated successfully!' });
      } else {
        // ── Create new user ───────────────────────────────────────────────
        const res = await fetch('/api/admin/users', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            email:       formState.email,
            password:    formState.password,
            displayName: formState.leader,
            role:        accessRole,
            entityName:  formState.entity,
            entityType:  selectedEntity.entityType,
            entityId:    selectedEntity.entityId,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Create failed');
        setShowAccountSuccess({ show: true, message: 'New account created successfully!' });
      }

      await fetchAccounts();
    } catch (err: any) {
      console.error('Error saving account:', err);
      setShowAccountSuccess({ show: true, message: `Error: ${err.message}` });
    }

    setTimeout(() => setShowAccountSuccess({ show: false, message: '' }), 4000);
    closeModal();
  };

  const handleEditClick = (account: any) => {
    setEditingAccountId(account.id);
    setFormState({
      institutionType: (account.entityType === 'parish' || account.entityType === 'seminary' || account.entityType === 'school') ? account.entityType : '',
      entity: account.entity,
      leader: account.leader,
      email: account.email,
      role: account.roleId || normalizeAccessRole(account.role)
    });
    setIsModalOpen(true);
  };

  const handleArchiveAccount = (id: number) => {
    setAccountToArchive(id);
    setIsArchiveModalOpen(true);
  };

  const toggleAccountStatus = async (id: string | number) => {
    try {
      const acc    = accounts.find((a) => a.id === id.toString());
      const action = acc?.status === 'active' ? 'archive' : 'restore';

      const res = await fetch('/api/admin/users', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: id.toString(), action }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Status change failed');
      await fetchAccounts();
    } catch (error) {
      console.error('Error toggling status:', error);
    }
    setIsArchiveModalOpen(false);
    setAccountToArchive(null);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingAccountId(null);
    setShowInstitutionSuggestions(false);
    setFormState({ institutionType: '', entity: '', leader: '', email: '', role: roles[2]?.id || 'parish_priest', password: '' });
  };

  const filteredAccounts = accounts.filter(acc => 
    acc.status === viewMode && (
      acc.entity.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.leader.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.role.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  return (
    <>
      <div className="min-h-[calc(100vh-80px)] bg-[#F3F4F6] flex flex-col">
      {isArchiveModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center space-y-6">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
                <Database className="w-8 h-8 text-amber-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-serif font-bold text-gray-900">
                  {viewMode === 'active' ? 'Archive Account' : 'Restore Account'}
                </h3>
                <p className="text-gray-500">
                  {viewMode === 'active' 
                    ? 'Are you sure you want to archive this account? It will be moved to the archive list.' 
                    : 'Are you sure you want to restore this account to active status?'}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => {
                    setIsArchiveModalOpen(false);
                    setAccountToArchive(null);
                  }}
                  className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    if (accountToArchive !== null) {
                      toggleAccountStatus(accountToArchive);
                    }
                  }}
                  className={`flex-1 px-6 py-3 text-white rounded-xl font-bold transition-colors shadow-md ${
                    viewMode === 'active' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'
                  }`}
                >
                  {viewMode === 'active' ? 'Archive' : 'Restore'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-church-green p-6 text-white">
              <h3 className="text-2xl font-serif font-bold">
                {editingAccountId !== null ? 'Edit User Account' : 'Add User Account'}
              </h3>
              <p className="text-white/60 text-sm">
                {editingAccountId !== null ? 'Update access credentials for this user.' : 'Create new access credentials for a user.'}
              </p>
            </div>
            
            <form onSubmit={handleSaveAccount} className="p-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Institution Type</label>
                  <select 
                    required
                    value={formState.institutionType}
                    onChange={(e) => handleInstitutionTypeChange(e.target.value as InstitutionType)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all appearance-none bg-white"
                  >
                    <option value="" disabled>Select institution type</option>
                    {institutionOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="relative">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">{institutionNameLabel}</label>
                  <input
                    type="text"
                    required
                    disabled={!formState.institutionType}
                    value={formState.entity}
                    onChange={(e) => {
                      setFormState({ ...formState, entity: e.target.value });
                      setShowInstitutionSuggestions(true);
                    }}
                    onFocus={() => {
                      if (formState.institutionType) setShowInstitutionSuggestions(true);
                    }}
                    onBlur={() => window.setTimeout(() => setShowInstitutionSuggestions(false), 120)}
                    placeholder={institutionNamePlaceholder}
                    className={`w-full px-4 py-3 border rounded-xl text-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all ${
                      formState.institutionType
                        ? 'border-gray-200 bg-white'
                        : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                    }`}
                  />
                  {showInstitutionSuggestions && formState.institutionType && institutionNameSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-xl shadow-black/10">
                      {institutionNameSuggestions.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setFormState({ ...formState, entity: name });
                            setShowInstitutionSuggestions(false);
                          }}
                          className="w-full px-4 py-3 text-left text-sm font-semibold text-gray-700 hover:bg-[#D4AF37]/10 hover:text-gray-950 transition-colors"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Assigned Leader</label>
                  <input 
                    type="text" 
                    required
                    value={formState.leader}
                    onChange={(e) => setFormState({...formState, leader: e.target.value})}
                    placeholder="e.g. Fr. John Doe"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={formState.email}
                    onChange={(e) => setFormState({...formState, email: e.target.value})}
                    placeholder="e.g. stjude@diocese.ph"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
                  />
                </div>
                {editingAccountId === null && (
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                      Temporary Password
                    </label>
                    <input
                      type="password"
                      required
                      value={formState.password}
                      onChange={(e) => setFormState({ ...formState, password: e.target.value })}
                      placeholder="Min. 8 characters"
                      minLength={8}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
                    />
                    <p className="mt-1.5 ml-1 text-[10px] text-gray-400">
                      The user can change this after their first login.
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Account Role</label>
                  <select 
                    required
                    value={formState.role}
                    onChange={(e) => setFormState({...formState, role: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all appearance-none bg-white"
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gold-500 text-church-black rounded-xl font-bold hover:bg-gold-600 transition-colors shadow-md"
                >
                  {editingAccountId !== null ? 'Update Account' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Main Content */}
      <div className="flex-1 max-w-[1600px] mx-auto w-full px-8 py-8">
        <div className="w-full min-w-0">
          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              <form onSubmit={handleProfileSave} className="xl:col-span-2 bg-white rounded-[32px] shadow-sm border border-gray-100 p-10">
                <div className="flex items-start justify-between gap-6 mb-10">
                  <div>
                    <h3 className="text-3xl font-serif font-bold text-gray-900">My Profile</h3>
                    <p className="text-sm text-gray-500 mt-1">Manage your personal information and contact details.</p>
                  </div>
                  <div className="w-16 h-16 rounded-2xl bg-gold-500 text-black flex items-center justify-center text-2xl font-black shadow-lg shadow-gold-500/20 shrink-0">
                    {(profileForm.firstName || profileForm.email || 'U').charAt(0).toUpperCase()}
                  </div>
                </div>

                {showProfileSuccess && (
                  <div className="mb-8 p-5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl text-sm font-bold animate-in fade-in slide-in-from-top-2 flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    Profile updated successfully!
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    { id: 'firstName', label: 'First Name', type: 'text', placeholder: 'First name' },
                    { id: 'lastName', label: 'Last Name', type: 'text', placeholder: 'Last name' },
                    { id: 'nickName', label: 'Nick Name', type: 'text', placeholder: 'Preferred name' },
                    { id: 'email', label: 'Email Address', type: 'email', placeholder: 'name@diocese.ph' },
                    { id: 'contactNumber', label: 'Contact Number', type: 'tel', placeholder: '+63 900 000 0000' },
                    { id: 'position', label: 'Position / Role', type: 'text', placeholder: 'Parish Priest, Admin, etc.' },
                    { id: 'entityName', label: 'Assigned Institution', type: 'text', placeholder: 'Parish, school, seminary, or office' },
                    { id: 'emergencyContact', label: 'Emergency Contact', type: 'text', placeholder: 'Name and number' },
                  ].map((field) => (
                    <div key={field.id} className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">{field.label}</label>
                      <input
                        type={field.type}
                        value={(profileForm as any)[field.id]}
                        onChange={(event) => setProfileForm(prev => ({ ...prev, [field.id]: event.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all font-medium placeholder:text-gray-300"
                      />
                    </div>
                  ))}

                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Address</label>
                    <input
                      type="text"
                      value={profileForm.address}
                      onChange={(event) => setProfileForm(prev => ({ ...prev, address: event.target.value }))}
                      placeholder="Complete address"
                      className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all font-medium placeholder:text-gray-300"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Additional Notes</label>
                    <textarea
                      value={profileForm.notes}
                      onChange={(event) => setProfileForm(prev => ({ ...prev, notes: event.target.value }))}
                      placeholder="Office hours, alternate contact, or other profile notes"
                      rows={4}
                      className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all font-medium placeholder:text-gray-300 resize-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end mt-8">
                  <button
                    type="submit"
                    className="bg-[#D4AF37] text-white px-8 py-4 rounded-2xl font-bold hover:bg-[#B5952F] transition-all shadow-lg shadow-[#D4AF37]/20 flex items-center justify-center gap-3 active:scale-[0.98]"
                  >
                    <Save className="w-5 h-5" />
                    Save Profile
                  </button>
                </div>
              </form>

              <div className="space-y-8">
                <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 p-8">
                  <h4 className="text-lg font-bold text-gray-900 mb-6">Account Details</h4>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Access Role</p>
                      <p className="text-sm font-bold text-gray-900 mt-1">{auth.currentUser?.roleLabel || profileForm.position || 'User'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</p>
                      <span className="inline-flex mt-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider border border-emerald-100">
                        {auth.currentUser?.status || 'Active'}
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Institution Type</p>
                      <p className="text-sm font-bold text-gray-900 mt-1 capitalize">{auth.currentUser?.entityType || 'Diocese'}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 p-8">
                  <h4 className="text-lg font-bold text-gray-900 mb-2">Change Password</h4>
                  <p className="text-sm text-gray-500 mb-6">Update the password used for this account.</p>

                  {showPasswordSuccess && (
                    <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl text-sm font-bold flex items-center gap-3">
                      <ShieldCheck className="w-5 h-5" />
                      Password updated successfully!
                    </div>
                  )}

                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Current Password</label>
                      <input
                        type="password"
                        value={passwords.current}
                        onChange={(event) => setPasswords(prev => ({ ...prev, current: event.target.value }))}
                        placeholder="••••••••"
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all font-medium placeholder:text-gray-300"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">New Password</label>
                      <input
                        type="password"
                        value={passwords.new}
                        onChange={(event) => setPasswords(prev => ({ ...prev, new: event.target.value }))}
                        placeholder="••••••••"
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all font-medium placeholder:text-gray-300"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleUpdatePassword}
                      className="w-full bg-gray-900 text-white px-8 py-4 rounded-2xl font-bold hover:bg-black transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                    >
                      <Save className="w-5 h-5" />
                      Update Password
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'user-management' && (
            <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 p-12">
              <div className="flex items-center justify-between mb-12">
                <div className="space-y-1">
                  <h3 className="text-3xl font-serif font-bold text-gray-900">User Account Management</h3>
                  <p className="text-sm text-gray-500">Manage access and roles for diocese personnel.</p>
                </div>
                <div className="flex items-center gap-5">
                  <div className="flex p-1.5 bg-gray-100 rounded-2xl">
                    <button 
                      onClick={() => setViewMode('active')}
                      className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        viewMode === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      Active
                    </button>
                    <button 
                      onClick={() => setViewMode('archived')}
                      className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        viewMode === 'archived' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      Archived
                    </button>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingAccountId(null);
                      setIsModalOpen(true);
                    }}
                    className="bg-[#D4AF37] hover:bg-[#B8962E] text-white px-7 py-3.5 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-xl shadow-[#D4AF37]/20 active:scale-95 whitespace-nowrap"
                  >
                    <UserPlus className="w-5 h-5" />
                    Add User Account
                  </button>
                </div>
              </div>

              <div className="relative mb-12">
                <Search className="w-5 h-5 absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search institutions, leaders, or emails..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-14 pr-8 py-4.5 bg-gray-50 border border-gray-100 rounded-[24px] text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all font-medium"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-5 font-bold text-gray-400 text-[11px] uppercase tracking-widest w-1/4">Institution Name</th>
                      <th className="pb-5 font-bold text-gray-400 text-[11px] uppercase tracking-widest w-1/4">Assigned Leader</th>
                      <th className="pb-5 font-bold text-gray-400 text-[11px] uppercase tracking-widest w-1/4">Email Address</th>
                      <th className="pb-5 font-bold text-gray-400 text-[11px] uppercase tracking-widest w-1/6">Role</th>
                      <th className="pb-5 font-bold text-gray-400 text-[11px] uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredAccounts.length > 0 ? (
                      filteredAccounts.map((account) => (
                        <tr key={account.id} className="group hover:bg-gray-50/50 transition-colors">
                          <td className="py-7 pr-4">
                            <div className="font-bold text-gray-900">{account.entity}</div>
                            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter mt-1">{account.entityType || 'Institution'}</div>
                          </td>
                          <td className="py-7 pr-4 text-gray-600 font-medium">{account.leader}</td>
                          <td className="py-7 pr-4 text-gray-500 font-mono text-xs">{account.email}</td>
                          <td className="py-7 pr-4">
                            <span className={`px-3.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              account.role === 'Bishop' ? 'bg-amber-100 text-amber-700' : 
                              account.role === 'Admin' ? 'bg-gray-900 text-white' : 
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {account.role}
                            </span>
                          </td>
                          <td className="py-7 text-right">
                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {viewMode === 'active' && (
                                <button 
                                  onClick={() => handleEditClick(account)}
                                  className="p-2.5 text-gray-400 hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-xl transition-all"
                                  title="Edit Account"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                              )}
                              <button 
                                onClick={() => handleArchiveAccount(account.id)}
                                className={`p-2.5 rounded-xl transition-all ${
                                  viewMode === 'active' 
                                    ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50' 
                                    : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                                }`}
                                title={viewMode === 'active' ? 'Archive Account' : 'Restore Account'}
                              >
                                {viewMode === 'active' ? <Database className="w-4 h-4" /> : <ArrowRight className="w-4 h-4 rotate-180" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-24 text-center">
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center">
                              <Users className="w-10 h-10 text-gray-200" />
                            </div>
                            <p className="text-gray-400 font-medium">No accounts found matching your search.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'role-control' && (
            <UserRoleControl roles={roles} onUpdateRoles={setRoles} />
          )}

          {activeTab === 'entity-management' && (
            <EntityManagementControl 
              parishes={parishes}
              seminaries={seminaries}
              schools={schools}
              onUpdateParishes={setParishes}
              onUpdateSeminaries={setSeminaries}
              onUpdateSchools={setSchools}
              onNavigate={onNavigate}
            />
          )}

          {activeTab === 'data-management' && (
            <DataManagementControl />
          )}

          {activeTab === 'parish-classification' && (
            <ParishClassificationLogic
              parishes={parishes.map(p => ({
                id: p.id,
                name: p.name,
                annualCollections: p.collections || 0,
                annualDisbursements: 0,
                currentClass: p.class,
                isSubsidized: false,
              }))}
              records={[]}
              onClassificationChange={(parishId, newClass, subsidyNeeded) => {
                const updatedParishes = parishes.map(p => 
                  p.id === parishId ? { ...p, class: newClass } : p
                );
                setParishes(updatedParishes);
              }}
            />
          )}

          {activeTab === 'security' && (
            <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 p-10">
              <div className="space-y-1 mb-10">
                <h3 className="text-3xl font-bold text-gray-900">Account Security</h3>
                <p className="text-sm text-gray-500 font-medium">Update your password and manage account access.</p>
              </div>
              
              <div className="max-w-xl">
                <div className="bg-gray-50/50 rounded-[32px] p-10 border border-gray-100 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                  <h4 className="text-lg font-bold text-gray-900 mb-8 relative z-10">Change Account Password</h4>
                  
                  {showPasswordSuccess && (
                    <div className="mb-8 p-5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl text-sm font-bold animate-in fade-in slide-in-from-top-2 flex items-center gap-3 relative z-10">
                      <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      Password updated successfully!
                    </div>
                  )}
                  
                  <div className="space-y-6 mb-10 relative z-10">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Current Password</label>
                      <input 
                        type="password" 
                        placeholder="••••••••" 
                        value={passwords.current}
                        onChange={(e) => setPasswords(prev => ({ ...prev, current: e.target.value }))}
                        className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all font-medium placeholder:text-gray-300"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">New Password</label>
                      <input 
                        type="password" 
                        placeholder="••••••••" 
                        value={passwords.new}
                        onChange={(e) => setPasswords(prev => ({ ...prev, new: e.target.value }))}
                        className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all font-medium placeholder:text-gray-300"
                      />
                    </div>
                  </div>
                  
                  <button 
                    onClick={handleUpdatePassword}
                    className="w-full bg-[#D4AF37] text-white px-8 py-4 rounded-2xl font-bold hover:bg-[#B5952F] transition-all shadow-lg shadow-[#D4AF37]/20 flex items-center justify-center gap-3 relative z-10 active:scale-[0.98]"
                  >
                    <Save className="w-5 h-5" />
                    Update Account Password
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
