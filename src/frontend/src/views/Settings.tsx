'use client';

import React, { useState } from 'react';
import { Users, UserPlus, Save, Database, ArrowRight, Pencil, Search, ShieldCheck, Eye, EyeOff } from 'lucide-react';

import { Role } from '../App';
import { UserRole, Parish, Seminary, DiocesanSchool } from '../types';
import {
  INITIAL_ROLES,
  VICARIATES,
  CLASSES,
  INITIAL_PARISHES,
  INITIAL_SEMINARIES,
  INITIAL_SCHOOLS,
  ALL_PARISHES,
} from '../constants';
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
import { ArchivesControl } from '../components/settings/ArchivesControl';
import { ParishClassificationLogic } from '../components/settings/ParishClassificationLogic';
import { DashboardHeader } from '../components/layout/DashboardHeader';
import { getAccessRoleLabel, getAppRole, normalizeAccessRole } from '../lib/access';
import { usePermissions } from '../hooks/usePermissions';

export function Settings({ onBack, onLogout, onNavigate, role = 'bishop', initialTab }: SettingsProps) {
  const { permissions, user } = usePermissions();
  const [activeTab, setActiveTab] = useState(initialTab || (permissions.create_users ? 'user-management' : 'security'));
  type InstitutionType = 'diocese' | 'parish' | 'seminary' | 'school';

  const institutionTabType = React.useMemo(() => {
    if (permissions.view_parish) return 'parish';
    if (permissions.view_seminary) return 'seminary';
    if (permissions.view_school && !permissions.view_school_cluster && !permissions.view_school_all) return 'school';
    return null;
  }, [permissions]);

  const institutionTabLabel = React.useMemo(() => {
    if (institutionTabType === 'parish') return 'My Parish';
    if (institutionTabType === 'seminary') return 'My Seminary';
    if (institutionTabType === 'school') return 'My School';
    return null;
  }, [institutionTabType]);

  const [instContactNumber, setInstContactNumber] = useState('');
  const [instEmail, setInstEmail] = useState('');
  const [showInstSuccess, setShowInstSuccess] = useState(false);
  const [showInstError, setShowInstError] = useState('');
  const [isUpdatingInst, setIsUpdatingInst] = useState(false);

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

  const userEntity = React.useMemo(() => {
    const entityId = user?.entityId || auth.currentUser?.entityId;
    const entityName = user?.entityName || auth.currentUser?.entityName;

    if (institutionTabType === 'parish') {
      const list = [...parishes, ...INITIAL_PARISHES];
      if (entityId) {
        const found = list.find((p) => p.id.toString() === entityId.toString());
        if (found) return found;
      }
      if (entityName) {
        const found = list.find((p) => p.name.toLowerCase() === entityName.toLowerCase());
        if (found) return found;
      }
    }
    if (institutionTabType === 'seminary') {
      const list = [...seminaries, ...INITIAL_SEMINARIES];
      if (entityId) {
        const found = list.find((s) => s.id.toString() === entityId.toString());
        if (found) return found;
      }
      if (entityName) {
        const found = list.find((s) => s.name.toLowerCase() === entityName.toLowerCase());
        if (found) return found;
      }
    }
    if (institutionTabType === 'school') {
      const list = [...schools, ...INITIAL_SCHOOLS];
      if (entityId) {
        const found = list.find((s) => s.id.toString() === entityId.toString());
        if (found) return found;
      }
      if (entityName) {
        const found = list.find((s) => s.name.toLowerCase() === entityName.toLowerCase());
        if (found) return found;
      }
    }
    return null;
  }, [institutionTabType, user, parishes, seminaries, schools]);

  React.useEffect(() => {
    if (userEntity) {
      setInstContactNumber((userEntity as any).contactNumber || (userEntity as any).contact_number || '');
      setInstEmail((userEntity as any).email || '');
    }
  }, [userEntity]);

  const handleSaveInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEntity || !institutionTabType) return;

    setIsUpdatingInst(true);
    setShowInstError('');
    setShowInstSuccess(false);

    try {
      const res = await fetch('/api/entities/my-institution', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: institutionTabType,
          id: userEntity.id.toString(),
          contactNumber: instContactNumber,
          email: instEmail,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update institution details.');
      }

      // Update local state
      if (institutionTabType === 'parish') {
        setParishes((prev) =>
          prev.map((p) =>
            p.id.toString() === userEntity.id.toString()
              ? { ...p, contactNumber: instContactNumber, email: instEmail }
              : p,
          ),
        );
      } else if (institutionTabType === 'seminary') {
        setSeminaries((prev) =>
          prev.map((s) =>
            s.id.toString() === userEntity.id.toString()
              ? { ...s, contactNumber: instContactNumber, email: instEmail }
              : s,
          ),
        );
      } else if (institutionTabType === 'school') {
        setSchools((prev) =>
          prev.map((s) =>
            s.id.toString() === userEntity.id.toString()
              ? { ...s, contactNumber: instContactNumber, email: instEmail }
              : s,
          ),
        );
      }

      setShowInstSuccess(true);
      setTimeout(() => setShowInstSuccess(false), 3000);
    } catch (err: any) {
      console.error('[Settings] Error saving institution details:', err);
      setShowInstError(err.message || 'An error occurred while saving.');
    } finally {
      setIsUpdatingInst(false);
    }
  };

  // ── Load users from Supabase (with localStorage fallback) ─────────────
  const fetchAccounts = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('API error');
      const data: any[] = await res.json();

      const dbAccounts = data.map((u) => ({
        id: u.id,
        entity: u.entityName || 'Unassigned',
        leader: u.displayName || u.email?.split('@')[0] || '',
        email: u.email || '',
        role: getAccessRoleLabel(u.roleId || u.role),
        roleId: normalizeAccessRole(u.roleId || u.role),
        status: u.status || 'active',
        entityId: u.entityId,
        entityType: u.entityType,
      }));

      // Merge with localStorage mock accounts so they are never lost and always appear in the table!
      const stored: any[] = JSON.parse(localStorage.getItem('users') || '[]');
      const localAccounts = stored.map((u) => ({
        id: u.id,
        entity: u.entityName || 'Unassigned',
        leader: u.displayName || u.email.split('@')[0],
        email: u.email,
        role: getAccessRoleLabel(u.roleId || u.accessRole || u.role),
        roleId: normalizeAccessRole(u.roleId || u.accessRole || u.role),
        status: u.status || 'active',
        entityId: u.entityId,
        entityType: u.entityType,
      }));

      // Avoid duplicates: if a user with the same email exists in cloud DB, don't show the local storage copy!
      const dbEmails = new Set(dbAccounts.map((a) => a.email.toLowerCase()));
      const uniqueLocal = localAccounts.filter((a) => !dbEmails.has(a.email.toLowerCase()));

      setAccounts([...dbAccounts, ...uniqueLocal]);
    } catch {
      // Fallback: read from localStorage (demo / offline mode)
      const stored: any[] = JSON.parse(localStorage.getItem('users') || '[]');
      setAccounts(
        stored.map((u) => ({
          id: u.id,
          entity: u.entityName || 'Unassigned',
          leader: u.displayName || u.email.split('@')[0],
          email: u.email,
          role: getAccessRoleLabel(u.roleId || u.accessRole || u.role),
          roleId: normalizeAccessRole(u.roleId || u.accessRole || u.role),
          status: u.status || 'active',
          entityId: u.entityId,
          entityType: u.entityType,
        })),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  React.useEffect(() => {
    const fetchEntities = async () => {
      try {
        const res = await fetch('/api/admin/entities?all=true');
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        if (Array.isArray(data.parishes)) setParishes(data.parishes);
        if (Array.isArray(data.seminaries)) setSeminaries(data.seminaries);
        if (Array.isArray(data.schools)) setSchools(data.schools);
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
  const [accountToArchive, setAccountToArchive] = useState<string | number | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | number | null>(null);
  const [showAccountSuccess, setShowAccountSuccess] = useState<{ show: boolean; message: string }>({
    show: false,
    message: '',
  });
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
      notes: currentUser.notes || '',
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
        localStorage.setItem(
          'currentUser',
          JSON.stringify({
            ...currentUser,
            passwordUpdatedAt: new Date().toISOString(),
          }),
        );
      }
    }
    setShowPasswordSuccess(true);
    setPasswords({ current: '', new: '' });
    setTimeout(() => setShowPasswordSuccess(false), 3000);
  };

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const currentUser = auth.currentUser || {};
    const displayName =
      [profileForm.firstName, profileForm.lastName].filter(Boolean).join(' ') ||
      currentUser.displayName ||
      profileForm.email;
    const updatedUser = {
      ...currentUser,
      ...profileForm,
      displayName,
      email: profileForm.email,
      entityName: profileForm.entityName || currentUser.entityName,
      updatedAt: new Date().toISOString(),
    };

    // Persist to Supabase if we have a real session
    await supabaseBrowser.auth
      .updateUser({
        data: {
          displayName,
          firstName: profileForm.firstName,
          lastName: profileForm.lastName,
          nickName: profileForm.nickName,
          contactNumber: profileForm.contactNumber,
          address: profileForm.address,
          position: profileForm.position,
          entityName: profileForm.entityName || currentUser.entityName,
          emergencyContact: profileForm.emergencyContact,
          notes: profileForm.notes,
        },
      })
      .catch(() => {
        // Ignore — may be a demo/offline session
      });

    // Always update localStorage so the profile reflects in the UI
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    setShowProfileSuccess(true);
    setTimeout(() => setShowProfileSuccess(false), 3000);
  };

  // Fetch roles from Supabase database
  const fetchRoles = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/roles');
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setRoles(data);
      }
    } catch {
      const stored = localStorage.getItem('diocese_roles');
      if (stored) {
        setRoles(JSON.parse(stored));
      } else {
        setRoles(INITIAL_ROLES);
      }
    }
  }, []);

  React.useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const handleUpdateRoles = async (newRoles: UserRole[]) => {
    setRoles(newRoles);
    localStorage.setItem('diocese_roles', JSON.stringify(newRoles));
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: newRoles }),
      });
      if (!res.ok) throw new Error('Failed to save roles');
    } catch (err) {
      console.error('Error saving roles, falling back to local storage:', err);
    }
  };

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
    entity: '',
    leader: '',
    firstName: '',
    lastName: '',
    email: '',
    role: '',
    password: '',
  });
  const [showInstitutionSuggestions, setShowInstitutionSuggestions] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const institutionOptions: { id: InstitutionType; label: string }[] = [
    { id: 'diocese', label: 'Diocese' },
    { id: 'parish', label: 'Parish' },
    { id: 'seminary', label: 'Seminary' },
    { id: 'school', label: 'School' },
  ];

  const filteredRoles = React.useMemo(() => {
    if (!formState.institutionType) return [];

    const instType = formState.institutionType as InstitutionType;
    const staticRoles: Record<InstitutionType, string[]> = {
      diocese: ['bishop', 'chancellor', 'diocesan_oeconomus', 'finance_staff'],
      parish: ['parish_priest', 'parish_secretary'],
      seminary: ['seminary_rector', 'seminary_oeconomus'],
      school: ['school_superintendent', 'finance_supervisor', 'finance_officer', 'school_principal'],
    };
    const predefinedRoleIds = new Set(Object.values(staticRoles).flat());
    const inferCustomRoleType = (customRole: UserRole): InstitutionType => {
      const roleText = `${customRole.id} ${customRole.name}`.toLowerCase();
      if (roleText.includes('parish')) return 'parish';
      if (roleText.includes('seminary') || roleText.includes('rector')) return 'seminary';
      if (
        roleText.includes('school') ||
        roleText.includes('principal') ||
        roleText.includes('supervisor') ||
        roleText.includes('officer')
      ) {
        return 'school';
      }
      return 'diocese';
    };

    return roles.filter((r) => {
      const allowedIds = staticRoles[instType];
      if (allowedIds && allowedIds.includes(r.id)) return true;
      if (predefinedRoleIds.has(r.id)) return false;

      // Dynamic custom role type detection based on permissions
      if (r.permissions.view_diocese && formState.institutionType === 'diocese') return true;
      if (r.permissions.view_parish && formState.institutionType === 'parish') return true;
      if (r.permissions.view_seminary && formState.institutionType === 'seminary') return true;

      const isSchoolPerm =
        r.permissions.view_school || r.permissions.view_school_cluster || r.permissions.view_school_all;
      if (isSchoolPerm && formState.institutionType === 'school') return true;

      const hasAccessLevel =
        r.permissions.view_diocese ||
        r.permissions.view_parish ||
        r.permissions.view_seminary ||
        r.permissions.view_school ||
        r.permissions.view_school_cluster ||
        r.permissions.view_school_all;
      return !hasAccessLevel && inferCustomRoleType(r) === instType;
    });
  }, [formState.institutionType, roles]);

  const institutionNames = React.useMemo(() => {
    const list =
      formState.institutionType === 'school'
        ? [...schools, ...INITIAL_SCHOOLS]
        : formState.institutionType === 'seminary'
          ? [...seminaries, ...INITIAL_SEMINARIES]
          : formState.institutionType === 'parish'
            ? [...parishes, ...ALL_PARISHES]
            : [];

    return Array.from(new Set(list.map((item) => item.name))).sort();
  }, [formState.institutionType, parishes, seminaries, schools]);

  const institutionNameSuggestions = React.useMemo(() => {
    const query = formState.entity.trim().toLowerCase();
    const matches = query ? institutionNames.filter((name) => name.toLowerCase().includes(query)) : institutionNames;

    return matches.slice(0, 8);
  }, [formState.entity, institutionNames]);

  const institutionNameLabel =
    formState.institutionType === 'seminary'
      ? 'Seminary Name'
      : formState.institutionType === 'school'
        ? 'School Name'
        : formState.institutionType === 'diocese'
          ? 'Diocese Name'
          : 'Parish Name';

  const institutionNamePlaceholder = formState.institutionType
    ? formState.institutionType === 'diocese'
      ? 'Diocese of San Pablo'
      : `Select ${institutionNameLabel.toLowerCase()}`
    : 'Select an institution type first';

  const handleInstitutionTypeChange = (institutionType: InstitutionType) => {
    const defaultRoleByType: Record<InstitutionType, string> = {
      diocese: 'bishop',
      parish: 'parish_priest',
      seminary: 'seminary_rector',
      school: 'school_superintendent',
    };

    setFormState({
      ...formState,
      institutionType,
      entity: institutionType === 'diocese' ? 'Diocese of San Pablo' : '',
      role: defaultRoleByType[institutionType] || '',
    });
    setShowInstitutionSuggestions(false);
  };

  const findSelectedEntity = (entityName: string, accessRoleId: string) => {
    const appRole = getAppRole(accessRoleId);
    const entityType =
      formState.institutionType || (appRole === 'school' ? 'school' : appRole === 'seminary' ? 'seminary' : 'parish');

    if (entityType === 'diocese') {
      return {
        appRole: 'admin' as any,
        entityType: 'diocese',
        entityId: 'diocese',
      };
    }

    const entityList =
      entityType === 'school'
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
    if (!formState.institutionType || !formState.entity || !formState.email || !formState.role) return;
    if (editingAccountId === null && !formState.password) {
      setShowAccountSuccess({ show: true, message: 'Error: Password is required for new accounts.' });
      setTimeout(() => setShowAccountSuccess({ show: false, message: '' }), 4000);
      return;
    }

    try {
      const accessRole = normalizeAccessRole(formState.role);
      const selectedEntity = findSelectedEntity(formState.entity, accessRole);
      const roleLabel = getAccessRoleLabel(accessRole);
      const constructedLeaderName =
        `${formState.firstName} ${formState.lastName}`.trim() || `${formState.entity} ${roleLabel}`;

      const isUUID = (val: any) =>
        typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
      const isRealUser = editingAccountId !== null && isUUID(editingAccountId);

      if (isRealUser) {
        // ── Update existing user ──────────────────────────────────────────
        const res = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingAccountId.toString(),
            email: formState.email,
            displayName: constructedLeaderName,
            role: accessRole,
            entityName: formState.entity,
            entityType: selectedEntity.entityType,
            entityId: selectedEntity.entityId,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Update failed');
        setShowAccountSuccess({ show: true, message: 'Account updated successfully!' });
      } else {
        // ── Create new user (or promote offline user to Supabase) ──────────
        const tempPassword = formState.password || 'TemporaryPassword123!';
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formState.email,
            password: tempPassword,
            displayName: constructedLeaderName,
            role: accessRole,
            entityName: formState.entity,
            entityType: selectedEntity.entityType,
            entityId: selectedEntity.entityId,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Create failed');
        setShowAccountSuccess({ show: true, message: 'New account created successfully!' });

        // If it was a local mock user, remove it from localStorage since it is now successfully saved in Supabase!
        if (editingAccountId !== null) {
          const stored: any[] = JSON.parse(localStorage.getItem('users') || '[]');
          const filtered = stored.filter((u) => u.id !== editingAccountId);
          localStorage.setItem('users', JSON.stringify(filtered));
        }
      }

      await fetchAccounts();
    } catch (err: any) {
      console.error('Error saving account, falling back to local storage:', err);
      try {
        const stored: any[] = JSON.parse(localStorage.getItem('users') || '[]');
        const accessRole = normalizeAccessRole(formState.role);
        const selectedEntity = findSelectedEntity(formState.entity, accessRole);
        const roleLabel = getAccessRoleLabel(accessRole);
        const constructedLeaderName =
          `${formState.firstName} ${formState.lastName}`.trim() || `${formState.entity} ${roleLabel}`;

        if (editingAccountId !== null) {
          const updated = stored.map((u) =>
            u.id.toString() === editingAccountId.toString()
              ? {
                  ...u,
                  email: formState.email,
                  displayName: constructedLeaderName,
                  role: accessRole,
                  entityName: formState.entity,
                  entityType: selectedEntity.entityType,
                  entityId: selectedEntity.entityId,
                  ...(formState.password ? { password: formState.password } : {}),
                }
              : u,
          );
          localStorage.setItem('users', JSON.stringify(updated));
          setShowAccountSuccess({ show: true, message: 'Account updated successfully (Offline Mode)!' });
        } else {
          const newUser = {
            id: Date.now(),
            email: formState.email,
            displayName: constructedLeaderName,
            role: accessRole,
            entityName: formState.entity,
            entityType: selectedEntity.entityType,
            entityId: selectedEntity.entityId,
            password: formState.password,
            status: 'active',
          };
          stored.push(newUser);
          localStorage.setItem('users', JSON.stringify(stored));
          setShowAccountSuccess({ show: true, message: 'New account created successfully (Offline Mode)!' });
        }
        await fetchAccounts();
      } catch (fallbackErr: any) {
        setShowAccountSuccess({ show: true, message: `Error: ${err.message}` });
      }
    }

    setTimeout(() => setShowAccountSuccess({ show: false, message: '' }), 4000);
    closeModal();
  };

  const handleEditClick = (account: any) => {
    setEditingAccountId(account.id);
    const resolvedType =
      account.entityType === 'diocese' ||
      account.entityType === 'parish' ||
      account.entityType === 'seminary' ||
      account.entityType === 'school'
        ? account.entityType
        : '';
    const nameParts = (account.leader || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    setFormState({
      institutionType: resolvedType as any,
      entity: account.entity,
      leader: account.leader,
      firstName,
      lastName,
      email: account.email,
      role: account.roleId || normalizeAccessRole(account.role),
      password: '',
    });
    setIsModalOpen(true);
  };

  const handleArchiveAccount = (id: string | number) => {
    setAccountToArchive(id);
    setIsArchiveModalOpen(true);
  };

  const toggleAccountStatus = async (id: string | number) => {
    try {
      const acc = accounts.find((a) => a.id.toString() === id.toString());
      const action = acc?.status === 'active' ? 'archive' : 'restore';

      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id.toString(), action }),
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
    setFormState({
      institutionType: '',
      entity: '',
      leader: '',
      firstName: '',
      lastName: '',
      email: '',
      role: '',
      password: '',
    });
  };

  const getFormattedFullName = (leaderName: string) => {
    if (!leaderName) return '';
    const cleanName = leaderName.trim();
    if (!cleanName) return '';

    // Check if it is a fallback/institutional name
    const lower = cleanName.toLowerCase();
    if (
      lower.includes('school') ||
      lower.includes('seminary') ||
      lower.includes('parish') ||
      lower.includes('cathedral') ||
      lower.includes('diocese')
    ) {
      return cleanName;
    }

    const parts = cleanName.split(/\s+/);
    if (parts.length <= 1) return cleanName;

    const lastName = parts[parts.length - 1];
    const firstName = parts.slice(0, -1).join(' ');
    return `${lastName}, ${firstName}`;
  };

  const filteredAccounts = accounts.filter(
    (acc) =>
      acc.status === viewMode &&
      (acc.entity.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.leader.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.role.toLowerCase().includes(searchQuery.toLowerCase())),
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
                  {editingAccountId !== null
                    ? 'Update access credentials for this user.'
                    : 'Create new access credentials for a user.'}
                </p>
              </div>

              <form onSubmit={handleSaveAccount} className="p-8 space-y-6">
                <div className="space-y-4">
                  {/* 1. Institution Type */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                      Institution Type
                    </label>
                    <select
                      required
                      value={formState.institutionType}
                      onChange={(e) => handleInstitutionTypeChange(e.target.value as InstitutionType)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all appearance-none bg-white"
                    >
                      <option value="" disabled>
                        Select institution type
                      </option>
                      {institutionOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Account Role */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                      Account Role
                    </label>
                    <select
                      required
                      disabled={!formState.institutionType}
                      value={formState.role}
                      onChange={(e) => {
                        const selectedRole = e.target.value;
                        let updatedEntity = formState.entity;
                        if (formState.institutionType === 'school') {
                          if (selectedRole === 'school_superintendent') {
                            updatedEntity = 'Diocesan Schools';
                          } else if (selectedRole === 'finance_supervisor') {
                            updatedEntity = 'Cluster 1';
                          } else if (
                            formState.entity === 'Diocesan Schools' ||
                            formState.entity.startsWith('Cluster')
                          ) {
                            updatedEntity = '';
                          }
                        }
                        setFormState({ ...formState, role: selectedRole, entity: updatedEntity });
                      }}
                      className={`w-full px-4 py-3 border rounded-xl text-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all appearance-none bg-white ${
                        formState.institutionType
                          ? 'border-gray-200 bg-white font-medium'
                          : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <option value="" disabled>
                        Select account role
                      </option>
                      {filteredRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 3. Institution Name */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                      {formState.institutionType === 'school' && formState.role === 'finance_supervisor'
                        ? 'Assigned School Cluster'
                        : formState.institutionType === 'school' && formState.role === 'school_superintendent'
                          ? 'Institution Name'
                          : institutionNameLabel}
                    </label>
                    {formState.institutionType === 'diocese' ? (
                      <input
                        type="text"
                        disabled
                        value="Diocese of San Pablo"
                        className="w-full px-4 py-3 border border-gray-100 bg-gray-50 text-gray-400 rounded-xl cursor-not-allowed font-medium transition-all"
                      />
                    ) : formState.institutionType === 'school' && formState.role === 'school_superintendent' ? (
                      <input
                        type="text"
                        disabled
                        value="Diocesan Schools"
                        className="w-full px-4 py-3 border border-gray-100 bg-gray-50 text-gray-400 rounded-xl cursor-not-allowed font-medium transition-all"
                      />
                    ) : formState.institutionType === 'school' && formState.role === 'finance_supervisor' ? (
                      <select
                        required
                        value={formState.entity}
                        onChange={(e) => setFormState({ ...formState, entity: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all appearance-none bg-white font-medium"
                      >
                        <option value="Cluster 1">Cluster 1</option>
                        <option value="Cluster 2">Cluster 2</option>
                        <option value="Cluster 3">Cluster 3</option>
                      </select>
                    ) : (
                      <select
                        required
                        disabled={!formState.institutionType}
                        value={formState.entity}
                        onChange={(e) => setFormState({ ...formState, entity: e.target.value })}
                        className={`w-full px-4 py-3 border rounded-xl text-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all appearance-none bg-white ${
                          formState.institutionType
                            ? 'border-gray-200 bg-white font-medium'
                            : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <option value="" disabled>
                          {institutionNamePlaceholder}
                        </option>
                        {institutionNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* 4. First Name & Last Name */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                        First Name
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!formState.institutionType}
                        value={formState.firstName}
                        onChange={(e) => setFormState({ ...formState, firstName: e.target.value })}
                        placeholder="e.g. John"
                        className={`w-full px-4 py-3 border rounded-xl text-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all font-medium ${
                          formState.institutionType
                            ? 'border-gray-200 bg-white'
                            : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                        Last Name
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!formState.institutionType}
                        value={formState.lastName}
                        onChange={(e) => setFormState({ ...formState, lastName: e.target.value })}
                        placeholder="e.g. Doe"
                        className={`w-full px-4 py-3 border rounded-xl text-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all font-medium ${
                          formState.institutionType
                            ? 'border-gray-200 bg-white'
                            : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                        }`}
                      />
                    </div>
                  </div>

                  {/* 5. Email Address */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      disabled={!formState.institutionType}
                      value={formState.email}
                      onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                      placeholder="e.g. stjude@diocese.ph"
                      className={`w-full px-4 py-3 border rounded-xl text-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all ${
                        formState.institutionType
                          ? 'border-gray-200 bg-white'
                          : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                      }`}
                    />
                  </div>

                  {/* 6. Temporary Password */}
                  {editingAccountId === null && (
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                        Temporary Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          disabled={!formState.institutionType}
                          value={formState.password}
                          onChange={(e) => setFormState({ ...formState, password: e.target.value })}
                          placeholder="Min. 8 characters"
                          minLength={8}
                          className={`w-full pl-4 pr-12 py-3 border rounded-xl text-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all ${
                            formState.institutionType
                              ? 'border-gray-200 bg-white'
                              : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                          }`}
                        />
                        {formState.institutionType && (
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        )}
                      </div>
                      <p className="mt-1.5 ml-1 text-[10px] text-gray-400">
                        The user can change this after their first login.
                      </p>
                    </div>
                  )}
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
                    className="flex-1 px-6 py-3 bg-[#D4AF37] text-white rounded-xl font-bold hover:bg-[#B5952F] transition-colors shadow-md active:scale-[0.98]"
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
            {institutionTabLabel && (
              <div className="flex border-b border-gray-200 mb-8 gap-6">
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className={`pb-4 px-2 text-sm font-bold border-b-2 transition-all relative ${
                    activeTab === 'profile'
                      ? 'border-[#D4AF37] text-gray-900 font-extrabold'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  My Profile
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('my-institution')}
                  className={`pb-4 px-2 text-sm font-bold border-b-2 transition-all relative ${
                    activeTab === 'my-institution'
                      ? 'border-[#D4AF37] text-gray-900 font-extrabold'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {institutionTabLabel}
                </button>
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <form
                  onSubmit={handleProfileSave}
                  className="xl:col-span-2 bg-white rounded-[32px] shadow-sm border border-gray-100 p-10"
                >
                  <div className="flex items-start justify-between gap-6 mb-10">
                    <div>
                      <h3 className="text-3xl font-serif font-bold text-gray-900">My Profile</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Manage your personal information and contact details.
                      </p>
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
                      {
                        id: 'position',
                        label: 'Position / Role',
                        type: 'text',
                        placeholder: 'Parish Priest, Admin, etc.',
                      },
                      {
                        id: 'entityName',
                        label: 'Assigned Institution',
                        type: 'text',
                        placeholder: 'Parish, school, seminary, or office',
                      },
                      {
                        id: 'emergencyContact',
                        label: 'Emergency Contact',
                        type: 'text',
                        placeholder: 'Name and number',
                      },
                    ].map((field) => (
                      <div key={field.id} className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                          {field.label}
                        </label>
                        <input
                          type={field.type}
                          value={(profileForm as any)[field.id]}
                          onChange={(event) => setProfileForm((prev) => ({ ...prev, [field.id]: event.target.value }))}
                          placeholder={field.placeholder}
                          className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all font-medium placeholder:text-gray-300"
                        />
                      </div>
                    ))}

                    <div className="md:col-span-2 space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                        Address
                      </label>
                      <input
                        type="text"
                        value={profileForm.address}
                        onChange={(event) => setProfileForm((prev) => ({ ...prev, address: event.target.value }))}
                        placeholder="Complete address"
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all font-medium placeholder:text-gray-300"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                        Additional Notes
                      </label>
                      <textarea
                        value={profileForm.notes}
                        onChange={(event) => setProfileForm((prev) => ({ ...prev, notes: event.target.value }))}
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
                        <p className="text-sm font-bold text-gray-900 mt-1">
                          {getAccessRoleLabel(auth.currentUser?.role) || profileForm.position || 'User'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</p>
                        <span className="inline-flex mt-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider border border-emerald-100">
                          {auth.currentUser?.status || 'Active'}
                        </span>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Institution Type
                        </p>
                        <p className="text-sm font-bold text-gray-900 mt-1 capitalize">
                          {auth.currentUser?.entityType || 'Diocese'}
                        </p>
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
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                          Current Password
                        </label>
                        <input
                          type="password"
                          value={passwords.current}
                          onChange={(event) => setPasswords((prev) => ({ ...prev, current: event.target.value }))}
                          placeholder="••••••••"
                          className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all font-medium placeholder:text-gray-300"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                          New Password
                        </label>
                        <input
                          type="password"
                          value={passwords.new}
                          onChange={(event) => setPasswords((prev) => ({ ...prev, new: event.target.value }))}
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

            {activeTab === 'my-institution' && userEntity && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <form
                  onSubmit={handleSaveInstitution}
                  className="xl:col-span-2 bg-white rounded-[32px] shadow-sm border border-gray-100 p-10 animate-in fade-in duration-200"
                >
                  <div className="flex items-start justify-between gap-6 mb-10">
                    <div>
                      <h3 className="text-3xl font-serif font-bold text-gray-900">{institutionTabLabel} Details</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {permissions.manage_own_institution
                          ? 'Manage contact information for your assigned institution.'
                          : 'View-only details for your assigned institution.'}
                      </p>
                    </div>
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-emerald-500/20 shrink-0">
                      ⛪
                    </div>
                  </div>

                  {showInstSuccess && (
                    <div className="mb-8 p-5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl text-sm font-bold animate-in fade-in slide-in-from-top-2 flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      Institution details updated successfully!
                    </div>
                  )}

                  {showInstError && (
                    <div className="mb-8 p-5 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl text-sm font-bold animate-in fade-in slide-in-from-top-2 flex items-center gap-3">
                      <div className="w-8 h-8 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
                        ⚠️
                      </div>
                      {showInstError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Name (Read-only) */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                        Name
                      </label>
                      <input
                        type="text"
                        disabled
                        value={userEntity.name || ''}
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-400 cursor-not-allowed font-medium transition-all"
                      />
                    </div>

                    {/* Leader (Read-only) */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                        {institutionTabType === 'parish'
                          ? 'Pastor'
                          : institutionTabType === 'seminary'
                            ? 'Rector'
                            : 'Principal'}
                      </label>
                      <input
                        type="text"
                        disabled
                        value={
                          (userEntity as any).pastor ||
                          (userEntity as any).rector ||
                          (userEntity as any).principal ||
                          ''
                        }
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-400 cursor-not-allowed font-medium transition-all"
                      />
                    </div>

                    {/* Vicariate (Read-only) */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                        Vicariate / Region
                      </label>
                      <input
                        type="text"
                        disabled
                        value={userEntity.vicariate || 'Diocesan'}
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-400 cursor-not-allowed font-medium transition-all"
                      />
                    </div>

                    {/* Class / Level (Read-only) */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                        {institutionTabType === 'school' ? 'Academic Level' : 'Classification'}
                      </label>
                      <input
                        type="text"
                        disabled
                        value={(userEntity as any).class || (userEntity as any).level || 'Class A'}
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-400 cursor-not-allowed font-medium transition-all"
                      />
                    </div>

                    {/* Address (Read-only) */}
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                        Physical Address
                      </label>
                      <input
                        type="text"
                        disabled
                        value={userEntity.address || ''}
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-400 cursor-not-allowed font-medium transition-all"
                      />
                    </div>

                    {/* Contact Number (Editable if permissions allow) */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                        Contact / Phone Number
                      </label>
                      <input
                        type="tel"
                        disabled={!permissions.manage_own_institution || isUpdatingInst}
                        value={instContactNumber}
                        onChange={(event) => setInstContactNumber(event.target.value)}
                        placeholder="e.g. 049-562-1234"
                        className={`w-full px-5 py-4 rounded-2xl font-medium transition-all ${
                          permissions.manage_own_institution
                            ? 'bg-white border border-gray-200 text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10'
                            : 'bg-gray-50 border border-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      />
                    </div>

                    {/* Email Address (Editable if permissions allow) */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        disabled={!permissions.manage_own_institution || isUpdatingInst}
                        value={instEmail}
                        onChange={(event) => setInstEmail(event.target.value)}
                        placeholder="e.g. stfrancis@diocese.org"
                        className={`w-full px-5 py-4 rounded-2xl font-medium transition-all ${
                          permissions.manage_own_institution
                            ? 'bg-white border border-gray-200 text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10'
                            : 'bg-gray-50 border border-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      />
                    </div>
                  </div>

                  {permissions.manage_own_institution && (
                    <div className="flex justify-end mt-8">
                      <button
                        type="submit"
                        disabled={isUpdatingInst}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                      >
                        {isUpdatingInst ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-5 h-5" />
                            Update Details
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </form>

                {/* Side Card */}
                <div className="bg-[#1A1A1A] rounded-[32px] text-white p-8 relative overflow-hidden shadow-xl border border-gray-800 animate-in fade-in slide-in-from-right-4 duration-350">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-[#D4AF37]/5 rounded-full -mr-24 -mt-24 blur-3xl"></div>
                  <h4 className="text-xl font-serif font-bold text-gold-400 mb-6 flex items-center gap-2">
                    <span>⛪</span> Official Records
                  </h4>

                  <div className="space-y-6 text-sm text-white/70">
                    <p className="leading-relaxed">
                      This form allows you to update the official contact details for this institution in the diocese
                      database.
                    </p>

                    <div className="bg-white/5 rounded-2xl p-5 border border-white/10 space-y-4">
                      <div className="flex justify-between items-center py-2 border-b border-white/5">
                        <span className="font-bold text-white/55">Status</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20">
                          Verified
                        </span>
                      </div>

                      {institutionTabType === 'seminary' && (
                        <>
                          <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="font-bold text-white/55">Enrollment</span>
                            <span className="text-white font-mono font-bold">
                              {(userEntity as Seminary).enrollment || 0}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2">
                            <span className="font-bold text-white/55">Capacity</span>
                            <span className="text-white font-mono font-bold">
                              {(userEntity as Seminary).capacity || 0}
                            </span>
                          </div>
                        </>
                      )}

                      {institutionTabType === 'school' && (
                        <>
                          <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="font-bold text-white/55">Enrollment</span>
                            <span className="text-white font-mono font-bold">
                              {(userEntity as DiocesanSchool).enrollment || 0}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2">
                            <span className="font-bold text-white/55">Capacity</span>
                            <span className="text-white font-mono font-bold">
                              {(userEntity as DiocesanSchool).capacity || 0}
                            </span>
                          </div>
                        </>
                      )}

                      {institutionTabType === 'parish' && (
                        <div className="flex justify-between items-center py-2">
                          <span className="font-bold text-white/55">Pastor since</span>
                          <span className="text-white font-bold">Current Assignment</span>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-white/40 leading-relaxed">
                      Note: Structural configurations, pastor/director assignments, and physical locations can only be
                      modified by the Diocesan Admin or Bishop.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'user-management' && permissions.create_users === true && (
              <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-serif font-bold text-gray-900">User Account Management</h3>
                    <p className="text-xs text-gray-500">Manage access and roles for diocese personnel.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex p-1 bg-gray-100 rounded-xl">
                      <button
                        onClick={() => setViewMode('active')}
                        className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${
                          viewMode === 'active'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                        }`}
                      >
                        Active
                      </button>
                      <button
                        onClick={() => setViewMode('archived')}
                        className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${
                          viewMode === 'archived'
                            ? 'bg-white text-amber-600 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
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
                      className="bg-[#D4AF37] hover:bg-[#B8962E] text-white px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-xl shadow-[#D4AF37]/20 active:scale-95 whitespace-nowrap"
                    >
                      <UserPlus className="w-4 h-4" />
                      Add User Account
                    </button>
                  </div>
                </div>

                <div className="relative mb-6">
                  <Search className="w-4 h-4 absolute left-4.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search institutions, types, roles, or emails..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-6 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all font-medium"
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="pb-3.5 font-bold text-gray-400 text-[10px] uppercase tracking-widest w-1/5">
                          Institution Name
                        </th>
                        <th className="pb-3.5 font-bold text-gray-400 text-[10px] uppercase tracking-widest w-[15%]">
                          Institution Type
                        </th>
                        <th className="pb-3.5 font-bold text-gray-400 text-[10px] uppercase tracking-widest w-1/5">
                          Full Name
                        </th>
                        <th className="pb-3.5 font-bold text-gray-400 text-[10px] uppercase tracking-widest w-1/5">
                          Email Address
                        </th>
                        <th className="pb-3.5 font-bold text-gray-400 text-[10px] uppercase tracking-widest w-[15%]">
                          Role
                        </th>
                        <th className="pb-3.5 font-bold text-gray-400 text-[10px] uppercase tracking-widest text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredAccounts.length > 0 ? (
                        filteredAccounts.map((account) => (
                          <tr key={account.id} className="group hover:bg-gray-50/50 transition-colors">
                            <td className="py-4 pr-4">
                              <div className="font-bold text-gray-900 text-sm">{account.entity}</div>
                            </td>
                            <td className="py-4 pr-4 text-gray-600 text-sm font-medium capitalize">
                              {account.entityType || 'Institution'}
                            </td>
                            <td className="py-4 pr-4 text-gray-800 text-sm font-semibold">
                              {getFormattedFullName(account.leader)}
                            </td>
                            <td className="py-4 pr-4 text-gray-500 font-mono text-xs">{account.email}</td>
                            <td className="py-4 pr-4">
                              <span
                                className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                  account.role === 'Bishop'
                                    ? 'bg-amber-100 text-amber-700'
                                    : account.role === 'Admin'
                                      ? 'bg-gray-900 text-white'
                                      : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {account.role}
                              </span>
                            </td>
                            <td className="py-4 text-right">
                              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {viewMode === 'active' && (
                                  <button
                                    onClick={() => handleEditClick(account)}
                                    className="p-2 text-gray-400 hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-all"
                                    title="Edit Account"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleArchiveAccount(account.id)}
                                  className={`p-2 rounded-lg transition-all ${
                                    viewMode === 'active'
                                      ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                                      : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                                  }`}
                                  title={viewMode === 'active' ? 'Archive Account' : 'Restore Account'}
                                >
                                  {viewMode === 'active' ? (
                                    <Database className="w-3.5 h-3.5" />
                                  ) : (
                                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-24 text-center">
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

            {activeTab === 'role-control' && permissions.manage_roles === true && (
              <UserRoleControl roles={roles} onUpdateRoles={handleUpdateRoles} accounts={accounts} />
            )}

            {activeTab === 'entity-management' && permissions.manage_entities === true && (
              <EntityManagementControl
                parishes={parishes}
                seminaries={seminaries}
                schools={schools}
                onUpdateParishes={setParishes}
                onUpdateSeminaries={setSeminaries}
                onUpdateSchools={setSchools}
                onNavigate={onNavigate}
                accounts={accounts}
              />
            )}

            {activeTab === 'archives' &&
              (permissions.create_users === true || permissions.manage_entities === true) && (
                <ArchivesControl
                  parishes={parishes}
                  seminaries={seminaries}
                  schools={schools}
                  accounts={accounts}
                  onUpdateParishes={setParishes}
                  onUpdateSeminaries={setSeminaries}
                  onUpdateSchools={setSchools}
                  onUpdateAccounts={fetchAccounts}
                />
              )}

            {activeTab === 'data-management' &&
              (permissions.download_csv === true ||
                permissions.upload_csv_admin === true ||
                permissions.upload_csv_entity === true) && <DataManagementControl />}

            {activeTab === 'parish-classification' && permissions.manage_entities === true && (
              <ParishClassificationLogic
                parishes={parishes.map((p) => ({
                  id: p.id,
                  name: p.name,
                  annualCollections: p.collections || 0,
                  annualDisbursements: 0,
                  currentClass: p.class,
                  isSubsidized: false,
                }))}
                records={[]}
                onClassificationChange={(parishId, newClass, subsidyNeeded) => {
                  const updatedParishes = parishes.map((p) => (p.id === parishId ? { ...p, class: newClass } : p));
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
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                          Current Password
                        </label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={passwords.current}
                          onChange={(e) => setPasswords((prev) => ({ ...prev, current: e.target.value }))}
                          className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all font-medium placeholder:text-gray-300"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                          New Password
                        </label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={passwords.new}
                          onChange={(e) => setPasswords((prev) => ({ ...prev, new: e.target.value }))}
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
