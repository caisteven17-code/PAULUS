'use client';

import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Save,
  Database,
  ArrowRight,
  Pencil,
  Camera,
  Search,
  ShieldCheck,
  Eye,
  EyeOff,
  X,
  Mail,
  Building2,
  Archive,
  Shield,
  RotateCcw,
  Phone,
  Cake,
  CheckCircle,
  AtSign,
  BadgeCheck,
  LockKeyhole,
  MapPin,
  NotebookPen,
  Sparkles,
  UserRound,
} from 'lucide-react';

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
import { getInitials } from '../lib/initials';
import { FilterModal, FilterField } from '../components/ui/FilterModal';
import { Avatar } from '../components/ui/Avatar';

interface SettingsProps {
  onBack: () => void;
  onLogout: () => void;
  onNavigate?: (page: string) => void;
  role?: Role;
  initialTab?: string;
}

import { UserRoleControl } from '../components/settings/UserRoleControl';
import { DataManagementControl } from '../components/settings/DataManagementControl';
import { LiturgicalValidatorControl } from '../components/settings/LiturgicalValidatorControl';
import { EntityManagementControl } from '../components/settings/EntityManagementControl';
import { ParishClassificationLogic } from '../components/settings/ParishClassificationLogic';
import { getAccessRoleLabel, getAppRole, normalizeAccessRole } from '../lib/access';
import { usePermissions } from '../hooks/usePermissions';
import { roundedField, selectField } from '../lib/formStyles';

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
        assignmentStatus: u.assignmentStatus,
        hasParishAccess: u.hasParishAccess,
        accountStatus: u.accountStatus,
        birthday:
          u.birthday || u.birthDate || u.dateOfBirth || u.user_metadata?.birthday || u.user_metadata?.birthDate || '',
        avatarUrl: u.avatarUrl || u.photoURL || '',
        onboardingCompleted:
          u.onboardingCompleted === true ||
          u.user_metadata?.onboardingCompleted === true ||
          u.metadata?.onboardingCompleted === true,
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
        birthday: u.birthday || u.birthDate || u.dateOfBirth || '',
        avatarUrl: u.avatarUrl || u.photoURL || '',
        onboardingCompleted: u.onboardingCompleted === true,
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
          birthday: u.birthday || u.birthDate || u.dateOfBirth || '',
          avatarUrl: u.avatarUrl || u.photoURL || '',
          onboardingCompleted: u.onboardingCompleted === true,
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
      } catch (err) {
        // No compiled-in fallback: the Add User dropdowns must reflect ONLY what
        // exists in Entity Management (diocese.institutions). Showing constants
        // here is what surfaced phantom institutions (e.g. seminaries/schools
        // that were never registered) in the dropdowns.
        console.error('[Settings] entity dropdown fetch failed; showing none rather than stale constants:', err);
        setParishes([]);
        setSeminaries([]);
        setSchools([]);
      }
    };
    fetchEntities();
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [accountToArchive, setAccountToArchive] = useState<string | number | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | number | null>(null);
  const [viewAccount, setViewAccount] = useState<any | null>(null); // read-only user detail modal
  const [showAccountSuccess, setShowAccountSuccess] = useState<{ show: boolean; message: string }>({
    show: false,
    message: '',
  });
  const [duplicatePriestModal, setDuplicatePriestModal] = useState<{
    open: boolean;
    existingPriest: string;
    existingPriestEmail: string;
    parishName: string;
    onProceed: () => void;
  }>({ open: false, existingPriest: '', existingPriestEmail: '', parishName: '', onProceed: () => {} });
  const [showProfileSuccess, setShowProfileSuccess] = useState(false);
  // Profile view/edit mode + email-change OTP
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [emailOtp, setEmailOtp] = useState<{
    open: boolean;
    pendingEmail: string;
    code: string;
    sending: boolean;
    error: string;
  }>({ open: false, pendingEmail: '', code: '', sending: false, error: '' });
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [avatarUrl, setAvatarUrl] = useState<string>(() => {
    const u: any = auth.currentUser || {};
    return u.avatarUrl || u.photoURL || '';
  });
  const [avatarBusy, setAvatarBusy] = useState(false);

  const currentUserId = (): string => {
    const u: any = auth.currentUser || {};
    return u.uid || u.id || u.external_auth_id || '';
  };

  const persistAvatarLocal = (url: string | null) => {
    const cur = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (url) {
      cur.avatarUrl = url;
      cur.photoURL = url;
    } else {
      delete cur.avatarUrl;
      delete cur.photoURL;
    }
    localStorage.setItem('currentUser', JSON.stringify(cur));
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return;
    const userId = currentUserId();
    if (!userId) return;

    setAvatarBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('userId', userId);
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.avatarUrl) {
        setAvatarUrl(data.avatarUrl);
        persistAvatarLocal(data.avatarUrl);
      }
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarRemove = async () => {
    const userId = currentUserId();
    if (!userId) return;
    setAvatarBusy(true);
    try {
      await fetch('/api/profile/avatar', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      setAvatarUrl('');
      persistAvatarLocal(null);
    } finally {
      setAvatarBusy(false);
    }
  };

  const [profileForm, setProfileForm] = useState(() => {
    const currentUser = auth.currentUser || {};
    const nameParts = (currentUser.displayName || '').split(' ').filter(Boolean);
    return {
      firstName: currentUser.firstName || nameParts[0] || '',
      lastName: currentUser.lastName || nameParts.slice(1).join(' ') || '',
      nickName: currentUser.nickName || '',
      email: currentUser.email || '',
      contactNumber: currentUser.contactNumber || '',
      birthday: (currentUser.birthday || '').slice(0, 10),
      address: currentUser.address || '',
      position: currentUser.position || currentUser.roleLabel || '',
      entityName: currentUser.entityName || '',
      emergencyContact: currentUser.emergencyContact || '',
      notes: currentUser.notes || '',
    };
  });

  // Persist profile metadata using a specific email (the email only changes once
  // the OTP is verified).
  const persistProfile = async (emailToUse: string) => {
    const currentUser = auth.currentUser || {};
    const displayName =
      [profileForm.firstName, profileForm.lastName].filter(Boolean).join(' ') || currentUser.displayName || emailToUse;
    const updatedUser = {
      ...currentUser,
      ...profileForm,
      displayName,
      email: emailToUse,
      entityName: profileForm.entityName || currentUser.entityName,
      updatedAt: new Date().toISOString(),
    };
    await supabaseBrowser.auth
      .updateUser({
        data: {
          displayName,
          firstName: profileForm.firstName,
          lastName: profileForm.lastName,
          nickName: profileForm.nickName,
          contactNumber: profileForm.contactNumber,
          birthday: profileForm.birthday || null,
          address: profileForm.address,
          position: profileForm.position,
          entityName: profileForm.entityName || currentUser.entityName,
          emergencyContact: profileForm.emergencyContact,
          notes: profileForm.notes,
        },
      })
      .catch(() => {
        /* demo/offline session — ignore */
      });

    // Persist birthday + contact number to diocese.profiles (the database table).
    const userId = (currentUser as any).uid || (currentUser as any).id || (currentUser as any).external_auth_id;
    if (userId) {
      await fetch('/api/profile/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          birthday: profileForm.birthday || null,
          contactNumber: profileForm.contactNumber || '',
        }),
      }).catch(() => {
        /* non-fatal — metadata + localStorage still hold the value */
      });
    }

    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
  };

  const resetProfileForm = () => {
    const currentUser = auth.currentUser || {};
    const nameParts = (currentUser.displayName || '').split(' ').filter(Boolean);
    setProfileForm({
      firstName: currentUser.firstName || nameParts[0] || '',
      lastName: currentUser.lastName || nameParts.slice(1).join(' ') || '',
      nickName: currentUser.nickName || '',
      email: currentUser.email || '',
      contactNumber: currentUser.contactNumber || '',
      birthday: (currentUser.birthday || '').slice(0, 10),
      address: currentUser.address || '',
      position: currentUser.position || currentUser.roleLabel || '',
      entityName: currentUser.entityName || '',
      emergencyContact: currentUser.emergencyContact || '',
      notes: currentUser.notes || '',
    });
  };

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const currentUser = auth.currentUser || {};
    const originalEmail = currentUser.email || '';
    const newEmail = profileForm.email.trim();
    const emailChanged = !!newEmail && newEmail.toLowerCase() !== originalEmail.toLowerCase();

    // Save everything except the email straight away (email keeps its old value).
    await persistProfile(emailChanged ? originalEmail : newEmail);

    if (emailChanged) {
      // Ask Supabase Auth to send a verification code to the NEW address.
      setEmailOtp({ open: true, pendingEmail: newEmail, code: '', sending: true, error: '' });
      const { error } = await supabaseBrowser.auth.updateUser({ email: newEmail });
      setEmailOtp((s) => ({
        ...s,
        sending: false,
        error: error ? error.message || 'Could not send the verification code.' : '',
      }));
      return; // stay in edit mode until the code is verified or cancelled
    }

    setShowProfileSuccess(true);
    setIsEditingProfile(false);
    setTimeout(() => setShowProfileSuccess(false), 3000);
  };

  const verifyEmailOtp = async () => {
    const code = emailOtp.code.trim();
    if (code.length < 6) {
      setEmailOtp((s) => ({ ...s, error: 'Enter the 6-digit code sent to your new email.' }));
      return;
    }
    setEmailOtp((s) => ({ ...s, sending: true, error: '' }));
    const { error } = await supabaseBrowser.auth.verifyOtp({
      email: emailOtp.pendingEmail,
      token: code,
      type: 'email_change',
    });
    if (error) {
      setEmailOtp((s) => ({
        ...s,
        sending: false,
        error: error.message || 'That code is invalid or expired. Your email was not changed.',
      }));
      return;
    }
    await persistProfile(emailOtp.pendingEmail); // commit the verified email
    setEmailOtp({ open: false, pendingEmail: '', code: '', sending: false, error: '' });
    setShowProfileSuccess(true);
    setIsEditingProfile(false);
    setTimeout(() => setShowProfileSuccess(false), 3000);
  };

  const cancelEmailOtp = () => {
    // Email stays as it was; other fields were already saved.
    setProfileForm((prev) => ({ ...prev, email: auth.currentUser?.email || prev.email }));
    setEmailOtp({ open: false, pendingEmail: '', code: '', sending: false, error: '' });
    setIsEditingProfile(false);
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
  const [roleFilter, setRoleFilter] = useState('all');
  const [assignmentFilter, setAssignmentFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all'); // institution type
  const [institutionFilter, setInstitutionFilter] = useState('all'); // specific institution

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
  const editingAccount = editingAccountId === null ? null : accounts.find((account) => account.id?.toString() === editingAccountId.toString());
  const assignmentLocked = editingAccount?.assignmentStatus === 'assigned' && normalizeAccessRole(formState.role) === 'parish_priest';

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
    // Source the Add User dropdown strictly from Entity Management
    // (diocese.institutions, loaded into parishes/seminaries/schools). Merging
    // compiled-in constants here is what made unregistered institutions appear.
    const list: any[] =
      formState.institutionType === 'school'
        ? schools
        : formState.institutionType === 'seminary'
          ? seminaries
          : formState.institutionType === 'parish'
            ? parishes
            : [];

    // `value` stays the bare name (so findSelectedEntity can resolve it), while
    // the label shows the vicariate (parish) or cluster (school) in parentheses
    // to disambiguate. Seminaries have no vicariate/cluster, so just the name.
    const seen = new Set<string>();
    const out: { name: string; label: string }[] = [];
    for (const item of list) {
      if (!item?.name || seen.has(item.name)) continue;
      seen.add(item.name);
      let suffix = '';
      if (formState.institutionType === 'parish' && item.vicariate) suffix = ` (${item.vicariate})`;
      else if (formState.institutionType === 'school' && item.cluster) suffix = ` (Cluster ${item.cluster})`;
      out.push({ name: item.name, label: `${item.name}${suffix}` });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [formState.institutionType, parishes, seminaries, schools]);

  const institutionNameSuggestions = React.useMemo(() => {
    const query = formState.entity.trim().toLowerCase();
    const matches = query ? institutionNames.filter((i) => i.name.toLowerCase().includes(query)) : institutionNames;

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

    // Resolve the selected institution to its real registry row so the new
    // account stores the institution UUID as entityId (Entity Management only).
    const entityList = entityType === 'school' ? schools : entityType === 'seminary' ? seminaries : parishes;
    const entity = entityList.find((item) => item.name === entityName);

    return {
      appRole,
      entityType,
      entityId: entity?.id || entityName.toLowerCase().replace(/\s+/g, '_'),
    };
  };

  const handleSaveAccount = async (e: React.FormEvent, createUnassignedAndRedirect = false) => {
    e.preventDefault();
    const unassignedPriest = normalizeAccessRole(formState.role) === 'parish_priest' && !formState.entity;
    if (!formState.institutionType || (!formState.entity && !unassignedPriest) || !formState.email || !formState.role) return;
    if (editingAccountId === null && !formState.password) {
      setShowAccountSuccess({ show: true, message: 'Error: Password is required for new accounts.' });
      setTimeout(() => setShowAccountSuccess({ show: false, message: '' }), 4000);
      return;
    }

    try {
      const accessRole = normalizeAccessRole(formState.role);

      // One-priest-per-parish rule: warn before creating/reassigning a second parish_priest.
      if (!createUnassignedAndRedirect && accessRole === 'parish_priest' && formState.institutionType === 'parish' && formState.entity) {
        // Account rows carry the institution under `entity` (and the normalized
        // role under `roleId`) — matching on the non-existent `a.entityName`
        // with the role label is why the warning never fired and duplicates
        // (e.g. two priests in Holy Trinity Parish) slipped through.
        const targetParish = formState.entity.trim().toLowerCase();
        const existing = accounts.find(
          (a) =>
            normalizeAccessRole(a.roleId || a.role) === 'parish_priest' &&
            (a.entity || '').trim().toLowerCase() === targetParish &&
            a.status !== 'archived' &&
            (editingAccountId === null || a.id?.toString() !== editingAccountId?.toString()),
        );
        if (existing) {
          setDuplicatePriestModal({
            open: true,
            existingPriest: existing.displayName || existing.email || 'another priest',
            existingPriestEmail: existing.email || existing.displayName || '',
            parishName: formState.entity,
            onProceed: () => {},
          });
          return;
        }
      }

      const requestedParishName = formState.entity;
      const requestedParish = parishes.find((parish) => parish.name === requestedParishName);
      const effectiveEntityName = createUnassignedAndRedirect ? '' : formState.entity;
      const selectedEntity = findSelectedEntity(effectiveEntityName, accessRole);
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
            entityName: effectiveEntityName,
            entityType: selectedEntity.entityType,
            entityId: selectedEntity.entityId,
          }),
        });
        if (!res.ok) {
          const body = await res.json();
          if (body.code === 'PARISH_PRIEST_ASSIGNMENT_CONFLICT') {
            setDuplicatePriestModal({ open: true, existingPriest: body.existingPriest, existingPriestEmail: '', parishName: body.parishName, onProceed: () => {} });
            return;
          }
          throw new Error(body.error ?? 'Update failed');
        }
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
            entityName: effectiveEntityName,
            entityType: selectedEntity.entityType,
            entityId: selectedEntity.entityId,
          }),
        });
        if (!res.ok) {
          const body = await res.json();
          if (body.code === 'PARISH_PRIEST_ASSIGNMENT_CONFLICT') {
            setDuplicatePriestModal({ open: true, existingPriest: body.existingPriest, existingPriestEmail: '', parishName: body.parishName, onProceed: () => {} });
            return;
          }
          throw new Error(body.error ?? 'Create failed');
        }
        const createdUser = await res.json().catch(() => ({}));
        setShowAccountSuccess({ show: true, message: createUnassignedAndRedirect ? 'Priest created as unassigned.' : 'New account created successfully!' });
        if (createUnassignedAndRedirect) {
          sessionStorage.setItem('priest_reassignment_prefill', JSON.stringify({
            action: 'assign',
            priestId: createdUser.id,
            destinationParishId: requestedParish?.id || '',
          }));
        }

        // If it was a local mock user, remove it from localStorage since it is now successfully saved in Supabase!
        if (editingAccountId !== null) {
          const stored: any[] = JSON.parse(localStorage.getItem('users') || '[]');
          const filtered = stored.filter((u) => u.id !== editingAccountId);
          localStorage.setItem('users', JSON.stringify(filtered));
        }
      }

      await fetchAccounts();
    } catch (err: any) {
      if (err?.message === 'DUPLICATE_CANCELLED') {
        setDuplicatePriestModal({
          open: false,
          existingPriest: '',
          existingPriestEmail: '',
          parishName: '',
          onProceed: () => {},
        });
        return;
      }
      if (!(err instanceof TypeError)) {
        setShowAccountSuccess({ show: true, message: `Error: ${err.message}` });
        setTimeout(() => setShowAccountSuccess({ show: false, message: '' }), 4000);
        return;
      }
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
    if (createUnassignedAndRedirect) onNavigate?.('priest-aitwin');
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
    const account = accounts.find((item) => item.id.toString() === id.toString());
    if (account?.assignmentStatus === 'assigned') {
      sessionStorage.setItem('priest_reassignment_prefill', JSON.stringify({ action: 'relieve', priestId: account.id }));
      onNavigate?.('priest-aitwin');
      return;
    }
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

  const roleOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          accounts
            .filter((acc: any) => acc.status === 'active')
            .map((acc: any) => acc.role)
            .filter(Boolean),
        ),
      ).sort(),
    [accounts],
  );

  // Institution options for the User Management filter, scoped to the selected
  // institution type so the dropdown stays relevant.
  const accountInstitutionOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          accounts
            .filter((acc: any) => acc.status === 'active')
            .filter((acc: any) => typeFilter === 'all' || (acc.entityType || '') === typeFilter)
            .map((acc: any) => acc.entity)
            .filter(Boolean),
        ),
      ).sort(),
    [accounts, typeFilter],
  );

  const userFilterCount =
    (roleFilter !== 'all' ? 1 : 0) +
    (assignmentFilter !== 'all' ? 1 : 0) +
    (typeFilter !== 'all' ? 1 : 0) +
    (institutionFilter !== 'all' ? 1 : 0);

  const clearUserFilters = () => {
    setRoleFilter('all');
    setAssignmentFilter('all');
    setTypeFilter('all');
    setInstitutionFilter('all');
  };

  const activeAccounts = accounts.filter((account) => account.status === 'active');
  const activeRoleCount = new Set(activeAccounts.map((account) => account.role).filter(Boolean)).size;
  const activeInstitutionCount = new Set(activeAccounts.map((account) => account.entity).filter(Boolean)).size;

  const filteredAccounts = accounts.filter((acc) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      query.length === 0 ||
      [acc.entity, acc.entityType, acc.leader, acc.email, acc.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));

    return (
      acc.status === 'active' &&
      matchesSearch &&
      (roleFilter === 'all' || acc.role === roleFilter) &&
      (assignmentFilter === 'all' || acc.assignmentStatus === assignmentFilter) &&
      (typeFilter === 'all' || (acc.entityType || '') === typeFilter) &&
      (institutionFilter === 'all' || acc.entity === institutionFilter)
    );
  });

  const profileDisplayName =
    [profileForm.firstName, profileForm.lastName].filter(Boolean).join(' ') ||
    auth.currentUser?.displayName ||
    profileForm.email ||
    'My Profile';
  const profileRoleLabel = getAccessRoleLabel(auth.currentUser?.role) || profileForm.position || 'User';
  const profileInstitutionName = auth.currentUser?.entityName || profileForm.entityName || 'Diocese of San Pablo';
  const profileStatus = auth.currentUser?.status || 'Active';
  const completedProfileFields = [
    profileForm.firstName,
    profileForm.lastName,
    profileForm.email,
    profileForm.contactNumber,
    profileForm.birthday,
    profileForm.address,
    profileForm.emergencyContact,
  ].filter((value) => String(value || '').trim()).length;
  const profileCompletion = Math.round((completedProfileFields / 7) * 100);
  const profileFieldGroups = [
    [
      { id: 'firstName', label: 'First Name', type: 'text', placeholder: 'First name', icon: UserRound },
      { id: 'lastName', label: 'Last Name', type: 'text', placeholder: 'Last name', icon: UserRound },
      { id: 'nickName', label: 'Nick Name', type: 'text', placeholder: 'Preferred name', icon: Sparkles },
    ],
    [
      { id: 'email', label: 'Email Address', type: 'email', placeholder: 'name@diocese.ph', icon: AtSign },
      { id: 'contactNumber', label: 'Contact Number', type: 'tel', placeholder: '+63 900 000 0000', icon: Phone },
      { id: 'birthday', label: 'Birthday', type: 'date', placeholder: '', icon: Cake },
    ],
    [
      {
        id: 'emergencyContact',
        label: 'Emergency Contact',
        type: 'text',
        placeholder: 'Name and number',
        icon: ShieldCheck,
      },
    ],
  ];

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
                        required={formState.role !== 'parish_priest'}
                        disabled={!formState.institutionType || assignmentLocked}
                        value={formState.entity}
                        onChange={(e) => setFormState({ ...formState, entity: e.target.value })}
                        className={`w-full px-4 py-3 border rounded-xl text-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all appearance-none bg-white ${
                          formState.institutionType
                            ? 'border-gray-200 bg-white font-medium'
                            : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <option value="" disabled={formState.role !== 'parish_priest'}>
                          {formState.role === 'parish_priest' ? 'No Parish — Create as Unassigned' : institutionNamePlaceholder}
                        </option>
                        {institutionNames.map((item) => (
                          <option key={item.name} value={item.name}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    )}
                    {formState.role === 'parish_priest' && !formState.entity && (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-800">
                        This priest may sign in, but will have no parish data access until assigned through Parish Priest Reassignment.
                      </div>
                    )}
                    {assignmentLocked && (
                      <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold leading-relaxed text-blue-800">
                        This parish assignment is managed through Parish Priest Reassignment. You may still edit the priest's account details.
                        <button type="button" onClick={() => { closeModal(); sessionStorage.setItem('priest_reassignment_prefill', JSON.stringify({ action: 'transfer', priestId: editingAccount?.id })); onNavigate?.('priest-aitwin'); }} className="mt-2 block font-black text-blue-900 underline">Open Reassignment</button>
                      </div>
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
              <div className="grid grid-cols-1 gap-7 xl:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.45fr)]">
                <aside className="space-y-6">
                  <div className="relative overflow-hidden rounded-[28px] border border-slate-900 bg-slate-950 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
                    <div className="absolute inset-x-0 top-0 h-1.5 bg-[#D4AF37]" />
                    <div className="absolute -right-20 top-12 h-44 w-44 rounded-full border border-[#D4AF37]/30" />
                    <div className="absolute -right-10 top-28 h-28 w-28 rounded-full border border-white/10" />
                    <div className="relative p-7">
                      <div className="flex items-start justify-between gap-4">
                        <div className="relative">
                          <Avatar
                            name={profileDisplayName}
                            photoUrl={avatarUrl}
                            size={92}
                            className="shadow-2xl shadow-black/30 ring-4 ring-white/10"
                          />
                          {isEditingProfile && (
                            <>
                              <label
                                htmlFor="profile-photo"
                                title="Change photo"
                                className="absolute -bottom-2 -right-2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-2 border-slate-950 bg-[#D4AF37] text-slate-950 shadow-lg transition-all hover:bg-[#E5C04B]"
                              >
                                {avatarBusy ? (
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
                                ) : (
                                  <Camera className="h-4 w-4" />
                                )}
                              </label>
                              <input
                                id="profile-photo"
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                className="hidden"
                                onChange={handleAvatarChange}
                                disabled={avatarBusy}
                              />
                            </>
                          )}
                        </div>
                        <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">
                          {profileStatus}
                        </span>
                      </div>

                      <div className="mt-7">
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#D4AF37]">
                          Personnel Record
                        </p>
                        <h3 className="mt-2 font-serif text-4xl font-bold leading-tight text-white">
                          {profileDisplayName}
                        </h3>
                        <p className="mt-2 text-sm font-semibold text-white/60">{profileRoleLabel}</p>
                      </div>

                      <div className="mt-7 rounded-[22px] border border-white/10 bg-white/[0.06] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45">
                            Profile Strength
                          </p>
                          <p className="text-sm font-black text-[#F5D98A]">{profileCompletion}%</p>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-[#D4AF37] transition-all"
                            style={{ width: `${profileCompletion}%` }}
                          />
                        </div>
                        <p className="mt-3 text-xs leading-relaxed text-white/50">
                          Complete contact and emergency details to make this profile easier to use during coordination.
                        </p>
                      </div>

                      {isEditingProfile && avatarUrl && (
                        <button
                          type="button"
                          onClick={handleAvatarRemove}
                          disabled={avatarBusy}
                          className="mt-4 text-xs font-bold text-rose-200 transition-colors hover:text-rose-100 disabled:opacity-50"
                        >
                          Remove photo
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                    {[
                      { label: 'Email', value: profileForm.email || 'Not provided', icon: AtSign },
                      { label: 'Phone', value: profileForm.contactNumber || 'Add phone number', icon: Phone },
                      { label: 'Institution', value: profileInstitutionName, icon: Building2 },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.label}
                          className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_38px_rgba(15,23,42,0.05)]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FFF4CF] text-[#9A7A17]">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                                {item.label}
                              </p>
                              <p className="truncate text-sm font-extrabold text-slate-900">{item.value}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-[28px] border border-[#D4AF37]/30 bg-[#FFF8E5] p-5 shadow-[0_14px_40px_rgba(180,131,12,0.08)]">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#D4AF37] text-slate-950">
                        <LockKeyhole className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9A7A17]">
                          Security
                        </p>
                        <h4 className="font-serif text-xl font-bold text-slate-950">Password Access</h4>
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-slate-600">
                      Keep account access protected with a fresh password when credentials change hands.
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigate?.('change-password')}
                      className="mt-5 flex w-full items-center justify-between rounded-[18px] bg-slate-950 px-5 py-4 text-sm font-black text-white transition-all hover:bg-slate-800 active:scale-[0.98]"
                    >
                      Change Password
                      <ArrowRight className="h-5 w-5" />
                    </button>
                  </div>
                </aside>
                <form
                  onSubmit={handleProfileSave}
                  className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex flex-col gap-5 border-b border-slate-100 bg-white p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#F5D98A]">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        Personal Details
                      </div>
                      <h3 className="mt-3 font-serif text-3xl font-bold text-slate-950">
                        {isEditingProfile ? 'Update Your Record' : 'Profile Workspace'}
                      </h3>
                      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
                        {isEditingProfile
                          ? 'Edit the fields that people rely on when they need to reach you quickly.'
                          : 'Review your contact information, assigned institution, and account access at a glance.'}
                      </p>
                    </div>
                    {!isEditingProfile ? (
                      <button
                        type="button"
                        onClick={() => setIsEditingProfile(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-[#D4AF37] px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-[#D4AF37]/20 transition-all hover:bg-[#E5C04B] active:scale-[0.98]"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit Profile
                      </button>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:flex">
                        <button
                          type="button"
                          onClick={() => {
                            resetProfileForm();
                            setIsEditingProfile(false);
                          }}
                          className="rounded-[18px] border border-slate-200 px-5 py-3 text-sm font-black text-slate-500 transition-all hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/15 transition-all hover:bg-slate-800 active:scale-[0.98]"
                        >
                          <Save className="h-4 w-4" />
                          Save
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-7 p-6 sm:p-8">
                    {showProfileSuccess && (
                      <div className="rounded-[22px] border border-emerald-100 bg-emerald-50 p-5 text-sm font-bold text-emerald-700 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-100">
                            <ShieldCheck className="h-5 w-5" />
                          </div>
                          Profile updated successfully!
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 lg:col-span-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-sm">
                            <UserRound className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                              Primary Identity
                            </p>
                            <p className="truncate text-lg font-extrabold text-slate-950">{profileDisplayName}</p>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-[#D4AF37]/30 bg-[#FFFAEA] p-5">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9A7A17]">
                          Access Role
                        </p>
                        <p className="mt-2 text-lg font-extrabold text-slate-950">{profileRoleLabel}</p>
                        <p className="mt-1 text-xs font-semibold capitalize text-slate-500">
                          {auth.currentUser?.entityType || 'Diocese'} account
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {profileFieldGroups.flat().map((field) => {
                        const Icon = field.icon;
                        return (
                          <div
                            key={field.id}
                            className={`space-y-2 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] ${
                              field.id === 'email'
                                ? 'xl:col-span-2'
                                : field.id === 'emergencyContact'
                                  ? 'xl:col-span-3'
                                  : ''
                            }`}
                          >
                            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              <Icon className="h-3.5 w-3.5 text-[#B5952F]" />
                              {field.label}
                              {field.id === 'email' && isEditingProfile && (
                                <span className="normal-case tracking-normal text-slate-300">verified by code</span>
                              )}
                            </label>
                            <input
                              type={field.type}
                              value={(profileForm as any)[field.id]}
                              disabled={!isEditingProfile}
                              max={field.type === 'date' ? new Date().toISOString().split('T')[0] : undefined}
                              onChange={(event) =>
                                setProfileForm((prev) => ({ ...prev, [field.id]: event.target.value }))
                              }
                              placeholder={field.placeholder}
                              className={`w-full rounded-[18px] border px-4 py-3.5 text-sm font-bold text-slate-950 transition-all placeholder:text-slate-300 ${
                                isEditingProfile
                                  ? 'border-slate-200 bg-white shadow-sm focus:border-[#D4AF37] focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/10'
                                  : 'cursor-default border-transparent bg-slate-50 text-slate-700'
                              }`}
                            />
                          </div>
                        );
                      })}

                      <div className="space-y-2 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] xl:col-span-3">
                        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          <MapPin className="h-3.5 w-3.5 text-[#B5952F]" />
                          Address
                        </label>
                        <input
                          type="text"
                          value={profileForm.address}
                          disabled={!isEditingProfile}
                          onChange={(event) => setProfileForm((prev) => ({ ...prev, address: event.target.value }))}
                          placeholder="Complete address"
                          className={`w-full rounded-[18px] border px-4 py-3.5 text-sm font-bold text-slate-950 transition-all placeholder:text-slate-300 ${
                            isEditingProfile
                              ? 'border-slate-200 bg-white shadow-sm focus:border-[#D4AF37] focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/10'
                              : 'cursor-default border-transparent bg-slate-50 text-slate-700'
                          }`}
                        />
                      </div>

                      <div className="space-y-2 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] xl:col-span-3">
                        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          <NotebookPen className="h-3.5 w-3.5 text-[#B5952F]" />
                          Additional Notes
                        </label>
                        <textarea
                          value={profileForm.notes}
                          disabled={!isEditingProfile}
                          onChange={(event) => setProfileForm((prev) => ({ ...prev, notes: event.target.value }))}
                          placeholder="Office hours, alternate contact, or other profile notes"
                          rows={4}
                          className={`w-full resize-none rounded-[18px] border px-4 py-3.5 text-sm font-bold text-slate-950 transition-all placeholder:text-slate-300 ${
                            isEditingProfile
                              ? 'border-slate-200 bg-white shadow-sm focus:border-[#D4AF37] focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/10'
                              : 'cursor-default border-transparent bg-slate-50 text-slate-700'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                </form>

                {/* ── Email change OTP verification ── */}
                {emailOtp.open && (
                  <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
                      <div className="bg-slate-900 p-6 text-white">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-400">
                          Verify Your New Email
                        </p>
                        <h3 className="mt-1 font-serif text-2xl font-bold">Enter the 6-digit code</h3>
                        <p className="mt-1 text-sm text-white/55">
                          We sent a verification code to{' '}
                          <span className="font-bold text-white">{emailOtp.pendingEmail}</span>. Your email won’t change
                          until the code is confirmed.
                        </p>
                      </div>
                      <div className="space-y-5 p-6">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={emailOtp.code}
                          onChange={(e) =>
                            setEmailOtp((s) => ({ ...s, code: e.target.value.replace(/\D/g, ''), error: '' }))
                          }
                          placeholder="••••••"
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-center text-2xl font-black tracking-[0.5em] text-gray-900 outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10"
                        />
                        {emailOtp.sending && !emailOtp.error && (
                          <p className="text-center text-xs font-semibold text-gray-400">Working…</p>
                        )}
                        {emailOtp.error && (
                          <p className="rounded-xl bg-rose-50 px-4 py-3 text-center text-sm font-semibold text-rose-600">
                            {emailOtp.error}
                          </p>
                        )}
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={cancelEmailOtp}
                            disabled={emailOtp.sending}
                            className="flex-1 rounded-2xl border border-gray-200 px-6 py-3 text-sm font-bold text-gray-500 transition-colors hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={verifyEmailOtp}
                            disabled={emailOtp.sending || emailOtp.code.length < 6}
                            className="flex-1 rounded-2xl bg-[#D4AF37] px-6 py-3 text-sm font-bold text-black shadow-lg shadow-[#D4AF37]/20 transition-colors hover:bg-[#E5C04B] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                          >
                            Verify &amp; Update
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
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
              <div className="space-y-5">
                <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-black via-[#111111] to-[#29230f] px-6 py-7 text-white shadow-[0_24px_60px_rgba(15,15,15,0.2)] md:px-8 md:py-8">
                  <div className="pointer-events-none absolute -right-16 -top-28 h-72 w-72 rounded-full border-[40px] border-gold-500/[0.07]" />
                  <div className="pointer-events-none absolute bottom-0 right-1/3 h-32 w-32 translate-y-20 rounded-full bg-gold-400/10 blur-2xl" />
                  <div className="relative flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-xl">
                      <div className="inline-flex items-center gap-2 rounded-full border border-gold-500/25 bg-gold-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-gold-400">
                        <ShieldCheck className="h-3.5 w-3.5" /> Identity &amp; Access
                      </div>
                      <h3 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">User Account Management</h3>
                      <p className="mt-3 max-w-lg text-sm font-medium leading-relaxed text-white/55">
                        Provision personnel accounts, assign institutional access, and keep diocesan roles organized from one secure directory.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                      <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-white/15 bg-slate-950/20 backdrop-blur-sm">
                        {[
                          { label: 'Active', value: activeAccounts.length, Icon: Users },
                          { label: 'Roles', value: activeRoleCount, Icon: Shield },
                          { label: 'Institutions', value: activeInstitutionCount, Icon: Building2 },
                        ].map(({ label, value, Icon }) => (
                          <div key={label} className="min-w-[92px] border-r border-white/10 px-4 py-3 last:border-r-0">
                            <div className="flex items-center gap-1.5 text-gold-400/70">
                              <Icon className="h-3.5 w-3.5" />
                              <span className="text-[8px] font-black uppercase tracking-[0.16em]">{label}</span>
                            </div>
                            <p className="mt-2 text-2xl font-black leading-none text-white">{value}</p>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          setEditingAccountId(null);
                          setIsModalOpen(true);
                        }}
                        className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-gold-500 px-5 text-[11px] font-black uppercase tracking-[0.14em] text-black shadow-xl shadow-gold-500/15 transition-all hover:-translate-y-0.5 hover:bg-gold-400 active:translate-y-0 whitespace-nowrap"
                      >
                        <UserPlus className="h-4 w-4" />
                        Add User Account
                      </button>
                    </div>
                  </div>
                </section>

                <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_16px_45px_rgba(15,23,42,0.07)]">
                  <div className="border-b border-slate-100 px-5 py-5 md:px-7">
                    <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-gold-600">Personnel directory</p>
                        <h4 className="mt-1 text-xl font-black text-slate-950">Authorized accounts</h4>
                      </div>
                      <p className="text-xs font-bold text-slate-400">Showing {filteredAccounts.length} of {activeAccounts.length} active accounts</p>
                    </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search institutions, types, roles, or emails..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={roundedField(
                        Boolean(searchQuery.trim()),
                        'w-full pl-10 pr-6 py-3.5 rounded-2xl text-sm font-medium',
                      )}
                    />
                  </div>
                  <FilterModal activeCount={userFilterCount} onClear={clearUserFilters}>
                    <FilterField label="Role">
                      <select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        className={selectField(roleFilter !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
                      >
                        <option value="all">All roles</option>
                        {roleOptions.map((roleName) => (
                          <option key={roleName} value={roleName}>
                            {roleName}
                          </option>
                        ))}
                      </select>
                    </FilterField>

                    <FilterField label="Institution type">
                      <select
                        value={typeFilter}
                        onChange={(e) => {
                          setTypeFilter(e.target.value);
                          setInstitutionFilter('all');
                        }}
                        className={selectField(
                          typeFilter !== 'all',
                          'h-11 w-full rounded-2xl px-4 text-sm font-bold capitalize',
                        )}
                      >
                        <option value="all">All types</option>
                        <option value="diocese">Diocese</option>
                        <option value="parish">Parish</option>
                        <option value="seminary">Seminary</option>
                        <option value="school">School</option>
                      </select>
                    </FilterField>

                    <FilterField label="Assignment status">
                      <select value={assignmentFilter} onChange={(e) => setAssignmentFilter(e.target.value)} className={selectField(assignmentFilter !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}>
                        <option value="all">All assignments</option>
                        <option value="assigned">Assigned</option>
                        <option value="unassigned">Unassigned</option>
                      </select>
                    </FilterField>

                    <FilterField label="Institution">
                      <select
                        value={institutionFilter}
                        onChange={(e) => setInstitutionFilter(e.target.value)}
                        className={selectField(
                          institutionFilter !== 'all',
                          'h-11 w-full rounded-2xl px-4 text-sm font-bold',
                        )}
                      >
                        <option value="all">All institutions</option>
                        {accountInstitutionOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </FilterField>
                  </FilterModal>
                </div>
                  </div>

                <div className="overflow-x-auto px-5 pb-5 md:px-7 md:pb-7">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80">
                        <th className="pb-3.5 font-bold text-gray-400 text-[10px] uppercase tracking-widest w-[24%]">
                          Full Name
                        </th>
                        <th className="pb-3.5 font-bold text-gray-400 text-[10px] uppercase tracking-widest w-[14%]">
                          Role
                        </th>
                        <th className="pb-3.5 font-bold text-gray-400 text-[10px] uppercase tracking-widest w-[24%]">Institution</th>
                        <th className="pb-3.5 font-bold text-gray-400 text-[10px] uppercase tracking-widest w-[13%]">Institution Type</th>
                        <th className="pb-3.5 font-bold text-gray-400 text-[10px] uppercase tracking-widest w-[20%]">Email Address</th>
                        <th className="pb-3.5 font-bold text-gray-400 text-[10px] uppercase tracking-widest text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAccounts.length > 0 ? (
                        filteredAccounts.map((account) => (
                          <tr
                            key={account.id}
                            onClick={() => setViewAccount(account)}
                            className="group cursor-pointer transition-colors hover:bg-gold-50/45"
                          >
                            <td className="py-4 pr-4 text-gray-800 text-sm font-semibold">
                              <div className="flex items-center gap-3">
                                <Avatar
                                  name={account.leader || account.email}
                                  photoUrl={account.avatarUrl || account.photoURL}
                                  size={32}
                                  className="shadow-sm"
                                />
                                <span>{getFormattedFullName(account.leader)}</span>
                              </div>
                            </td>
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
                            <td className="py-4 pr-4">
                              <div className={`text-sm font-bold ${account.assignmentStatus === 'unassigned' ? 'text-amber-700' : 'text-gray-900'}`}>{account.entity || 'No Parish'}</div>
                              {account.assignmentStatus === 'unassigned' && <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-700">Unassigned</span>}
                            </td>
                            <td className="py-4 pr-4 text-gray-600 text-sm font-medium capitalize">
                              <span className="inline-flex rounded-full border border-gold-200 bg-gold-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-gold-700">
                                {account.entityType || 'Institution'}
                              </span>
                            </td>
                            <td className="py-4 pr-4 text-gray-500 font-mono text-xs">{account.email}</td>
                            <td className="py-4 text-right">
                              <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                                {viewMode === 'active' && (
                                  account.assignmentStatus === 'unassigned' ? (
                                    <button onClick={(e) => { e.stopPropagation(); sessionStorage.setItem('priest_reassignment_prefill', JSON.stringify({ action: 'assign', priestId: account.id })); onNavigate?.('priest-aitwin'); }} className="rounded-lg px-2 py-1.5 text-[10px] font-black text-amber-700 hover:bg-amber-50" title="Assign Parish">Assign Parish</button>
                                  ) : null
                                )}
                                {viewMode === 'active' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditClick(account);
                                    }}
                                    className="rounded-lg p-2 text-slate-400 transition-all hover:bg-gold-50 hover:text-gold-700"
                                    title="Edit Account"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleArchiveAccount(account.id);
                                  }}
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
                </section>
              </div>
            )}

            {/* ── Read-only user detail modal (Edit / Archive in the corner) ── */}
            {viewAccount &&
              (() => {
                const isArchived = viewAccount.status === 'archived' || viewAccount.status === 'inactive';
                const Field = ({
                  icon: Icon,
                  label,
                  value,
                }: {
                  icon: React.ElementType;
                  label: string;
                  value?: any;
                }) => (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </p>
                    <p className="mt-1.5 break-words text-sm font-bold text-gray-900">
                      {value === undefined || value === null || value === '' ? '—' : value}
                    </p>
                  </div>
                );
                return (
                  <div
                    className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
                    onClick={() => setViewAccount(null)}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
                    >
                      {/* Centered profile header */}
                      <div className="relative bg-slate-950 px-6 pb-8 pt-6 text-white">
                        <div className="absolute right-5 top-5 flex shrink-0 items-center gap-1">
                          {!isArchived && (
                            <button
                              onClick={() => {
                                const acc = viewAccount;
                                setViewAccount(null);
                                handleEditClick(acc);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white hover:text-slate-900"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </button>
                          )}
                          <button
                            onClick={() => {
                              handleArchiveAccount(viewAccount.id);
                              setViewAccount(null);
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                              isArchived
                                ? 'text-white/70 hover:bg-emerald-500 hover:text-white'
                                : 'text-white/70 hover:bg-rose-500 hover:text-white'
                            }`}
                          >
                            {isArchived ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                            {isArchived ? 'Restore' : 'Archive'}
                          </button>
                          <button
                            onClick={() => setViewAccount(null)}
                            className="rounded-xl p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                        <div className="mx-auto flex max-w-md flex-col items-center pt-8 text-center">
                          <div className="rounded-full bg-gradient-to-br from-gold-300 via-gold-500 to-gold-600 p-1.5 shadow-[0_18px_45px_rgba(212,175,55,0.32)]">
                            <Avatar
                              name={getFormattedFullName(viewAccount.leader) || viewAccount.email}
                              photoUrl={viewAccount.avatarUrl}
                              size={104}
                              className="border-4 border-slate-950 ring-2 ring-gold-400/70"
                            />
                          </div>
                          <h3 className="mt-4 max-w-full truncate font-serif text-3xl font-bold text-white">
                            {getFormattedFullName(viewAccount.leader) || viewAccount.email}
                          </h3>
                          <div className="mt-3 flex max-w-full flex-wrap items-center justify-center gap-2">
                            <span className="rounded-full border border-gold-400/35 bg-gold-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-gold-300">
                              {viewAccount.role}
                            </span>
                            <span
                              className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                                isArchived
                                  ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-300/20'
                                  : 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-300/20'
                              }`}
                            >
                              {isArchived ? 'Archived' : 'Active'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Body */}
                      <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-6 sm:grid-cols-2">
                        <Field icon={Mail} label="Email Address" value={viewAccount.email} />
                        <Field icon={Shield} label="Access Role" value={viewAccount.role} />
                        <Field
                          icon={Cake}
                          label="Birthday"
                          value={
                            viewAccount.birthday
                              ? new Date(viewAccount.birthday).toLocaleDateString('en-US', {
                                  month: 'long',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : ''
                          }
                        />
                        <Field
                          icon={CheckCircle}
                          label="Registration Status"
                          value={viewAccount.onboardingCompleted ? 'Registered' : 'Unregistered'}
                        />
                        <Field icon={Building2} label="Assigned Institution" value={viewAccount.entity} />
                        <Field
                          icon={Building2}
                          label="Institution Type"
                          value={viewAccount.entityType || 'Institution'}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

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
                currentUser={user}
              />
            )}

            {activeTab === 'data-management' &&
              (permissions.download_csv === true ||
                permissions.upload_csv_admin === true ||
                permissions.upload_csv_entity === true) && <DataManagementControl />}

            {activeTab === 'liturgical-validator' && permissions.validate_liturgical_calendar === true && (
              <LiturgicalValidatorControl />
            )}

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
                  <p className="text-sm text-gray-500 font-medium">
                    Manage the credentials used to protect your account.
                  </p>
                </div>

                <div className="max-w-xl">
                  <div className="relative overflow-hidden rounded-[32px] border border-gray-100 bg-gray-50/50 p-10">
                    <div className="absolute -mr-16 -mt-16 h-32 w-32 rounded-full bg-[#D4AF37]/5 blur-2xl right-0 top-0" />
                    <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D4AF37]/15 text-[#9A7715]">
                      <Shield className="h-6 w-6" />
                    </div>
                    <h4 className="relative z-10 mt-6 text-lg font-bold text-gray-900">Change Account Password</h4>
                    <p className="relative z-10 mt-2 text-sm leading-relaxed text-gray-500">
                      Continue to the dedicated security page to verify your current password and review password
                      requirements.
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigate?.('change-password')}
                      className="relative z-10 mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#D4AF37] px-8 py-4 font-bold text-slate-950 shadow-lg shadow-[#D4AF37]/20 transition-all hover:bg-[#E2BF43] active:scale-[0.98]"
                    >
                      Open Change Password
                      <ArrowRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Duplicate-priest warning modal */}
      {duplicatePriestModal.open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start gap-4 bg-amber-50 px-6 py-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100">
                <svg
                  className="h-6 w-6 text-amber-700"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-slate-950">Parish Priest Already Assigned</h2>
                <p className="mt-0.5 text-xs font-semibold text-amber-700">
                  Each parish should have only one assigned priest.
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Parish</p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">{duplicatePriestModal.parishName}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                  Currently Assigned Priest
                </p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">{duplicatePriestModal.existingPriest}</p>
              </div>
              <p className="text-sm leading-relaxed text-slate-500">
                This parish cannot be assigned to another priest here. Use Parish Priest Reassignment to transfer,
                swap, rotate, or relieve the current priest without losing assignment history.
              </p>
            </div>

            {/* Actions */}
            <div className="border-t border-slate-100 px-6 pb-6 pt-4 space-y-2">
              <button
                type="button"
                onClick={(event) => {
                  setDuplicatePriestModal({
                    open: false,
                    existingPriest: '',
                    existingPriestEmail: '',
                    parishName: '',
                    onProceed: () => {},
                  });
                  void handleSaveAccount(event as unknown as React.FormEvent, true);
                }}
                className="w-full rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-black text-white transition-colors hover:bg-slate-800"
              >
                Create as Unassigned &amp; Continue to Reassignment
              </button>

              <div>
                <button
                  type="button"
                  onClick={() =>
                    setDuplicatePriestModal({
                      open: false,
                      existingPriest: '',
                      existingPriestEmail: '',
                      parishName: '',
                      onProceed: () => {},
                    })
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Choose Another Parish
                </button>
              </div>
              <button type="button" onClick={() => { setDuplicatePriestModal({ open: false, existingPriest: '', existingPriestEmail: '', parishName: '', onProceed: () => {} }); closeModal(); }} className="w-full px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-700">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
