'use client';

import React, { useState } from 'react';
import { Search, Plus, ShieldCheck, Trash, Edit2, ShieldAlert } from 'lucide-react';
import { UserRole } from '../../types';
import { ALL_PERMISSIONS, PREDEFINED_ROLE_IDS } from '../../constants';

interface UserRoleControlProps {
  roles: UserRole[];
  onUpdateRoles: (roles: UserRole[]) => void;
  accounts?: any[];
}

export function UserRoleControl({ roles, onUpdateRoles, accounts = [] }: UserRoleControlProps) {
  // Enforce that exactly one viewing permission is true for every role at any time
  const sanitizedRoles = React.useMemo(() => {
    return roles.map(role => {
      const permissions = { ...role.permissions };
      const viewingKeys = ['view_diocese', 'view_parish', 'view_seminary', 'view_school', 'view_school_cluster', 'view_school_all'];
      
      // Find the first viewing key that is explicitly true, default to 'view_diocese' if none are set
      let activeViewingKey = viewingKeys.find(key => (permissions as any)[key] === true);
      if (!activeViewingKey) {
        if (role.id.includes('parish')) activeViewingKey = 'view_parish';
        else if (role.id.includes('seminary') || role.id.includes('rector')) activeViewingKey = 'view_seminary';
        else if (role.id.includes('school') || role.id.includes('principal') || role.id.includes('supervisor') || role.id.includes('officer')) {
          if (role.id.includes('superintendent')) activeViewingKey = 'view_school_all';
          else if (role.id.includes('supervisor')) activeViewingKey = 'view_school_cluster';
          else activeViewingKey = 'view_school';
        }
        else activeViewingKey = 'view_diocese';
      }

      viewingKeys.forEach(key => {
        (permissions as any)[key] = (key === activeViewingKey);
      });

      // Enforce mutual exclusivity: manage_announcements and view_announcements cannot both be true
      if ((permissions as any)['manage_announcements'] === true) {
        (permissions as any)['view_announcements'] = false;
      }

      // Enforce mutual exclusivity: manage_projects and view_projects cannot both be true
      if ((permissions as any)['manage_projects'] === true) {
        (permissions as any)['view_projects'] = false;
      }

      return {
        ...role,
        permissions
      };
    });
  }, [roles]);

  const [selectedRoleId, setSelectedRoleId] = useState(sanitizedRoles[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showSuccess, setShowSuccess] = useState<{show: boolean, message: string}>({ show: false, message: '' });
  const [tempRole, setTempRole] = useState<UserRole | null>(null);
  const [validationError, setValidationError] = useState<string>('');
  const [roleForm, setRoleForm] = useState({ 
    name: '', 
    color: '#D4AF37',
    permissions: Object.keys(sanitizedRoles[0].permissions).reduce((acc, key) => ({ ...acc, [key]: false }), {})
  });

  const selectedRole = sanitizedRoles.find(r => r.id === selectedRoleId) || sanitizedRoles[0];
  const isPredefined = PREDEFINED_ROLE_IDS.includes(selectedRole.id);

  const startEditing = () => {
    setTempRole({ ...selectedRole });
    setValidationError('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setTempRole(null);
    setValidationError('');
  };

  const saveChanges = () => {
    if (!tempRole) return;

    const trimmedName = tempRole.name.trim();
    const nameLower = trimmedName.toLowerCase();

    if (!trimmedName) {
      setValidationError('Role name cannot be empty.');
      return;
    }

    const isDuplicate = sanitizedRoles.some(
      r => r.id !== tempRole.id && r.name.trim().toLowerCase() === nameLower
    );
    if (isDuplicate) {
      setValidationError(`A role with the name "${trimmedName}" already exists.`);
      return;
    }

    const updatedRole = { ...tempRole, name: trimmedName };
    onUpdateRoles(sanitizedRoles.map(r => r.id === tempRole.id ? updatedRole : r));
    setShowSuccess({ show: true, message: 'Role updated successfully!' });
    setTimeout(() => setShowSuccess({ show: false, message: '' }), 3000);
    setIsEditing(false);
    setTempRole(null);
    setValidationError('');
  };

  const togglePermission = (permId: string) => {
    if (isPredefined || !isEditing || !tempRole) return; 

    const isViewingPerm = ['view_diocese', 'view_parish', 'view_seminary', 'view_school', 'view_school_cluster', 'view_school_all'].includes(permId);

    if (isViewingPerm) {
      const updatedPermissions = { ...tempRole.permissions };
      ['view_diocese', 'view_parish', 'view_seminary', 'view_school', 'view_school_cluster', 'view_school_all'].forEach(id => {
        (updatedPermissions as any)[id] = (id === permId);
      });

      // Auto-enable appropriate sub-dashboard switches based on selection
      (updatedPermissions as any)['view_parish_dashboard'] = (permId === 'view_diocese' || permId === 'view_parish');
      (updatedPermissions as any)['view_seminary_dashboard'] = (permId === 'view_diocese' || permId === 'view_seminary');
      (updatedPermissions as any)['view_school_dashboard'] = (permId === 'view_diocese' || permId === 'view_school');

      if (permId !== 'view_diocese') {
        const RESTRICTED_IDS = [
          'digital_twin', 
          'upload_csv_admin', 
          'manage_entities', 
          'view_priests', 
          'manage_assignments', 
          'create_users', 
          'manage_roles', 
          'manage_announcements',
          'view_audit_logs'
        ];
        RESTRICTED_IDS.forEach(id => {
          if ((permId === 'view_parish' || permId === 'view_seminary') && id === 'view_priests') {
            return;
          }
          (updatedPermissions as any)[id] = false;
        });
      }
      setTempRole({
        ...tempRole,
        permissions: updatedPermissions
      });
    } else if (permId === 'manage_announcements' || permId === 'view_announcements') {
      // Radio-group: only one announcement permission can be active at a time
      const updatedPermissions = { ...tempRole.permissions } as any;
      updatedPermissions['manage_announcements'] = (permId === 'manage_announcements') ? !updatedPermissions['manage_announcements'] : false;
      updatedPermissions['view_announcements']   = (permId === 'view_announcements')   ? !updatedPermissions['view_announcements']   : false;
      // If we're enabling one, disable the other
      if (permId === 'manage_announcements' && updatedPermissions['manage_announcements']) {
        updatedPermissions['view_announcements'] = false;
      } else if (permId === 'view_announcements' && updatedPermissions['view_announcements']) {
        updatedPermissions['manage_announcements'] = false;
      }
      setTempRole({ ...tempRole, permissions: updatedPermissions });
    } else if (permId === 'manage_projects' || permId === 'view_projects') {
      // Radio-group: only one project permission can be active at a time
      const updatedPermissions = { ...tempRole.permissions } as any;
      updatedPermissions['manage_projects'] = (permId === 'manage_projects') ? !updatedPermissions['manage_projects'] : false;
      updatedPermissions['view_projects']   = (permId === 'view_projects')   ? !updatedPermissions['view_projects']   : false;
      // If we're enabling one, disable the other
      if (permId === 'manage_projects' && updatedPermissions['manage_projects']) {
        updatedPermissions['view_projects'] = false;
      } else if (permId === 'view_projects' && updatedPermissions['view_projects']) {
        updatedPermissions['manage_projects'] = false;
      }
      setTempRole({ ...tempRole, permissions: updatedPermissions });
    } else {
      setTempRole({
        ...tempRole,
        permissions: {
          ...tempRole.permissions,
          [permId]: !tempRole.permissions[permId as keyof typeof tempRole.permissions]
        }
      });
    }
  };

  const handleOpenCreateModal = () => {
    setRoleForm({ 
      name: '', 
      color: '#' + Math.floor(Math.random()*16777215).toString(16),
      permissions: Object.keys(sanitizedRoles[0].permissions).reduce((acc, key) => ({ ...acc, [key]: false }), {})
    });
    setValidationError('');
    setIsModalOpen(true);
  };

  const handleSaveNewRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleForm.name) return;

    const trimmedName = roleForm.name.trim();
    const nameLower = trimmedName.toLowerCase();

    const isDuplicate = sanitizedRoles.some(
      r => r.name.trim().toLowerCase() === nameLower
    );
    if (isDuplicate) {
      setValidationError(`A role with the name "${trimmedName}" already exists.`);
      return;
    }

    const id = nameLower.replace(/\s+/g, '_');
    const newRole = {
      id,
      name: trimmedName,
      color: roleForm.color,
      permissions: { ...roleForm.permissions }
    };
    onUpdateRoles([...sanitizedRoles, newRole]);
    setSelectedRoleId(id);
    setShowSuccess({ show: true, message: 'Role created successfully!' });
    setTimeout(() => setShowSuccess({ show: false, message: '' }), 3000);
    setValidationError('');
    setIsModalOpen(false);
  };

  const handleDeleteRole = () => {
    if (isPredefined) {
      alert('Core system roles cannot be deleted.');
      return;
    }
    if (sanitizedRoles.length <= 1) {
      alert('Cannot delete the last role.');
      return;
    }
    
    const newRoles = sanitizedRoles.filter(r => r.id !== selectedRole.id);
    onUpdateRoles(newRoles);
    setSelectedRoleId(newRoles[0].id);
    setShowSuccess({ show: true, message: 'Role deleted successfully!' });
    setTimeout(() => setShowSuccess({ show: false, message: '' }), 3000);
    setIsDeleteModalOpen(false);
  };

  const assignedAccounts = React.useMemo(() => {
    if (!accounts) return [];
    return accounts.filter((acc: any) => acc.roleId === selectedRole.id);
  }, [accounts, selectedRole.id]);

  const isAssigned = assignedAccounts.length > 0;

  const filteredRoles = sanitizedRoles.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden flex h-[700px] relative">
      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-[120] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="p-8 text-center space-y-6">
              {isAssigned ? (
                <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto border border-amber-100">
                  <ShieldAlert className="w-8 h-8 text-amber-500" />
                </div>
              ) : (
                <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto border border-rose-100">
                  <Trash className="w-8 h-8 text-rose-500" />
                </div>
              )}
              
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-gray-900">
                  {isAssigned ? 'Role In Use' : 'Delete Role'}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed text-center">
                  {isAssigned ? (
                    <>
                      Cannot delete the <span className="font-bold text-gray-900">"{selectedRole.name}"</span> role because it is currently assigned to <span className="font-bold text-gray-900">{assignedAccounts.length} user account(s)</span>:
                      <span className="block bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs text-gray-600 font-semibold mt-3 max-h-28 overflow-y-auto text-left space-y-1">
                        {assignedAccounts.map((acc: any) => (
                          <span key={acc.id} className="block truncate">
                            • {acc.leader} ({acc.email})
                          </span>
                        ))}
                      </span>
                      <span className="block text-xs text-amber-600 font-semibold mt-3">
                        Please reassign these users to a different role first.
                      </span>
                    </>
                  ) : (
                    <>
                      Are you sure you want to delete the <span className="font-bold text-gray-900">"{selectedRole.name}"</span> role? This action cannot be undone.
                    </>
                  )}
                </p>
              </div>
              
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors text-sm"
                >
                  {isAssigned ? 'Close' : 'Cancel'}
                </button>
                {!isAssigned && (
                  <button 
                    onClick={handleDeleteRole}
                    className="flex-1 px-6 py-3 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/20 text-sm"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Role Creation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-[110] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="bg-[#1A1A1A] p-8 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <h3 className="text-2xl font-bold">Create New Role</h3>
                  <p className="text-white/50 text-sm mt-1">Define a new set of permissions for users.</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-white/40 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>
            </div>
            <form onSubmit={handleSaveNewRole} className="flex flex-col h-[600px]">
              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {validationError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-600 px-5 py-4 rounded-2xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                    {validationError}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Role Name</label>
                    <input
                      type="text"
                      required
                      value={roleForm.name}
                      onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all placeholder:text-gray-400"
                      placeholder="e.g. Parish Volunteer"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Role Color</label>
                    <div className="flex items-center gap-4 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
                      <input
                        type="color"
                        value={roleForm.color}
                        onChange={(e) => setRoleForm({ ...roleForm, color: e.target.value })}
                        className="w-10 h-10 border-0 p-0 bg-transparent cursor-pointer rounded-lg overflow-hidden shadow-inner"
                      />
                      <span className="text-sm text-gray-600 font-mono font-bold">{roleForm.color.toUpperCase()}</span>
                    </div>
                  </div>
                </div>

                {/* ── PERMISSIONS SECTION ── */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                    <h4 className="text-sm font-bold text-gray-900">Assign Permissions</h4>
                  </div>

                  {(() => {
                    const permissionsObj = roleForm.permissions as any;
                    const isDioceseSelected  = permissionsObj.view_diocese  === true;
                    const isParishSelected   = permissionsObj.view_parish   === true;
                    const isSeminarySelected = permissionsObj.view_seminary === true;
                    const isSchoolSelected   = permissionsObj.view_school === true || permissionsObj.view_school_cluster === true || permissionsObj.view_school_all === true;
                    const anyLevelSelected   = isDioceseSelected || isParishSelected || isSeminarySelected || isSchoolSelected;

                    const RESTRICTED_IDS = [
                      'digital_twin','upload_csv_admin','manage_entities',
                      'view_priests','manage_assignments','create_users','manage_roles',
                      'manage_announcements','view_audit_logs'
                    ];

                    const selectLevel = (levelId: string) => {
                      const updated = { ...roleForm.permissions } as any;
                      ['view_diocese','view_parish','view_seminary','view_school','view_school_cluster','view_school_all'].forEach(id => {
                        updated[id] = (id === levelId);
                      });
                      updated['view_parish_dashboard']   = (levelId === 'view_diocese' || levelId === 'view_parish');
                      updated['view_seminary_dashboard'] = (levelId === 'view_diocese' || levelId === 'view_seminary');
                      updated['view_school_dashboard']   = (levelId === 'view_diocese' || levelId === 'view_school' || levelId === 'view_school_cluster' || levelId === 'view_school_all');
                      if (levelId !== 'view_diocese') {
                        RESTRICTED_IDS.forEach(id => {
                          if ((levelId === 'view_parish' || levelId === 'view_seminary') && id === 'view_priests') return;
                          updated[id] = false;
                        });
                      }
                      setRoleForm({ ...roleForm, permissions: updated });
                    };

                    const togglePerm = (id: string) => {
                      const updated = { ...roleForm.permissions } as any;
                      if (id === 'manage_announcements' || id === 'view_announcements') {
                        // Radio-group: only one announcement permission active at a time
                        const isCurrentlyOn = updated[id] === true;
                        updated['manage_announcements'] = (id === 'manage_announcements') ? !isCurrentlyOn : false;
                        updated['view_announcements']   = (id === 'view_announcements')   ? !isCurrentlyOn : false;
                      } else if (id === 'manage_projects' || id === 'view_projects') {
                        // Radio-group: only one project permission active at a time
                        const isCurrentlyOn = updated[id] === true;
                        updated['manage_projects'] = (id === 'manage_projects') ? !isCurrentlyOn : false;
                        updated['view_projects']   = (id === 'view_projects')   ? !isCurrentlyOn : false;
                      } else {
                        updated[id] = !updated[id];
                      }
                      setRoleForm({ ...roleForm, permissions: updated });
                    };

                    const levelCards = [
                      { id: 'view_diocese',  label: 'Diocesan Level',  desc: 'Full access across the entire diocese.',           icon: '🏛️', colorRing: 'ring-amber-400',   colorBg: 'bg-amber-50',   colorText: 'text-amber-700',   colorDot: 'bg-amber-400' },
                      { id: 'view_parish',   label: 'Parish Level',    desc: 'Access limited to an assigned parish.',             icon: '⛪',  colorRing: 'ring-emerald-400', colorBg: 'bg-emerald-50', colorText: 'text-emerald-700', colorDot: 'bg-emerald-400' },
                      { id: 'view_seminary', label: 'Seminary Level',  desc: 'Access limited to an assigned seminary.',           icon: '📖',  colorRing: 'ring-blue-400',    colorBg: 'bg-blue-50',    colorText: 'text-blue-700',    colorDot: 'bg-blue-400' },
                      { id: 'view_school',   label: 'School Level',    desc: 'Access limited to an assigned school or cluster.',  icon: '🏫',  colorRing: 'ring-purple-400',  colorBg: 'bg-purple-50',  colorText: 'text-purple-700',  colorDot: 'bg-purple-400' },
                    ];

                    const isLevelSelected = (card: { id: string }) =>
                      card.id === 'view_school' ? isSchoolSelected : permissionsObj[card.id] === true;

                    interface DashSwitch { id: string; name: string; desc: string }
                    const dashSwitches: DashSwitch[] = [];
                    if (isDioceseSelected || isParishSelected)   dashSwitches.push({ id: 'view_parish_dashboard',   name: 'Parish Dashboard',   desc: 'Allow viewing parish-level financial summaries and operational reports.' });
                    if (isDioceseSelected || isSeminarySelected) dashSwitches.push({ id: 'view_seminary_dashboard', name: 'Seminary Dashboard', desc: 'Allow viewing seminary-level financial summaries and educational timelines.' });
                    if (isDioceseSelected || isSchoolSelected)   dashSwitches.push({ id: 'view_school_dashboard',   name: 'School Dashboard',   desc: 'Allow viewing school-level financial summaries and academic metrics.' });

                    interface PermItem { id: string; name: string; desc: string }
                    interface PermGroup { label: string; icon: string; items: PermItem[] }
                    const permGroups: PermGroup[] = [];

                    if (anyLevelSelected) {
                      const dataItems: PermItem[] = [
                        { id: 'download_csv',       name: 'Download CSV Templates', desc: 'Download blank CSV templates for data entry.' },
                        { id: 'upload_csv_entity',  name: 'Upload Entity CSV',      desc: 'Upload updated CSVs for their specific entity.' },
                      ];
                      if (isDioceseSelected) dataItems.push({ id: 'upload_csv_admin', name: 'Upload Master CSV', desc: 'Upload and process master CSV templates for the diocese.' });
                      permGroups.push({ label: 'Data Access', icon: '📊', items: dataItems });

                      const projectItems: PermItem[] = [
                        { id: 'view_projects',    name: 'View Projects',    desc: 'View project lists and details.' },
                        { id: 'manage_projects',  name: 'Manage Projects',  desc: 'Create, edit, and manage diocesan and entity projects.' },
                      ];
                      permGroups.push({ label: 'Projects', icon: '📁', items: projectItems });

                      if (isDioceseSelected || isParishSelected || isSeminarySelected) {
                        const priestItems: PermItem[] = [
                          { id: 'view_priests', name: 'View Priest Profiles', desc: 'View priest health trackers, assignments, and personnel dashboards.' },
                        ];
                        if (isDioceseSelected) priestItems.push({ id: 'manage_assignments', name: 'Priest Assignment Simulator', desc: 'Launch scenario planning and simulate clergy assignments.' });
                        permGroups.push({ label: 'Priest Management', icon: '⛪', items: priestItems });
                      }

                      const announcementItems: PermItem[] = [
                        { id: 'view_announcements', name: 'View Announcements', desc: 'View announcements and news bulletins.' },
                      ];
                      if (isDioceseSelected || isParishSelected || isSeminarySelected) {
                        announcementItems.push({ id: 'manage_announcements', name: 'Manage Announcements', desc: 'Create, edit, and publish announcements.' });
                      }
                      permGroups.push({ label: 'Announcements', icon: '📣', items: announcementItems });

                      if (isDioceseSelected) {
                        permGroups.push({
                          label: 'Advanced Tools', icon: '⚡',
                          items: [
                            { id: 'digital_twin',     name: 'Digital Twin',    desc: 'Launch scenario simulations and mirror other institution dashboards.' },
                            { id: 'manage_entities',  name: 'Manage Entities', desc: 'Manage and configure diocesan institutions, parishes, and schools.' },
                          ]
                        });
                        permGroups.push({
                          label: 'User & System Management', icon: '🔐',
                          items: [
                            { id: 'create_users',    name: 'Manage User Accounts', desc: 'Add, update, or remove staff accounts in the system.' },
                            { id: 'manage_roles',    name: 'Manage User Roles',    desc: 'Change what each staff member is allowed to see and do in the system.' },
                            { id: 'view_audit_logs', name: 'View Activity History', desc: 'See a record of all actions taken by staff members in the system.' },
                          ]
                        });
                      }
                    }

                    return (
                      <div className="space-y-7">

                        {/* STEP 1: Level Selector */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#1A1A1A] text-white text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Select Access Level</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {levelCards.map(card => {
                              const sel = isLevelSelected(card);
                              return (
                                <button
                                  key={card.id}
                                  type="button"
                                  onClick={() => selectLevel(card.id)}
                                  className={`flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                                    sel ? `${card.colorBg} ${card.colorRing} ring-2` : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'
                                  }`}
                                >
                                  <span className="text-xl mt-0.5">{card.icon}</span>
                                  <div className="flex-1">
                                    <div className={`text-sm font-bold ${sel ? card.colorText : 'text-gray-700'}`}>{card.label}</div>
                                    <div className="text-[11px] text-gray-400 mt-0.5 leading-snug">{card.desc}</div>
                                  </div>
                                  {sel && <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${card.colorDot}`} />}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* School sub-level scope */}
                        {isSchoolSelected && (
                          <div className="ml-2 pl-4 border-l-2 border-purple-200 space-y-2">
                            <div className="text-[10px] font-bold text-purple-500 uppercase tracking-widest mb-2">School Access Scope</div>
                            {[
                              { id: 'view_school',         name: 'Assigned School Only', desc: 'View records specific to one assigned school.' },
                              { id: 'view_school_cluster', name: 'Cluster of Schools',   desc: 'View records for an assigned cluster of schools.' },
                              { id: 'view_school_all',     name: 'All Schools',          desc: 'View records for all schools in the diocese.' },
                            ].map(sub => {
                              const isSubChecked = permissionsObj[sub.id] === true;
                              return (
                                <label key={sub.id} className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                                  isSubChecked ? 'border-purple-200 bg-purple-50/50' : 'border-transparent hover:bg-gray-50'
                                }`}>
                                  <input
                                    type="radio"
                                    name="school_sub_level_create"
                                    checked={isSubChecked}
                                    onChange={() => {
                                      const updated = { ...roleForm.permissions } as any;
                                      ['view_diocese','view_parish','view_seminary','view_school','view_school_cluster','view_school_all'].forEach(id => {
                                        updated[id] = (id === sub.id);
                                      });
                                      updated['view_school_dashboard'] = true;
                                      const RESTRICTED_IDS = [
                                        'digital_twin','upload_csv_admin','manage_entities',
                                        'view_priests','manage_assignments','create_users','manage_roles',
                                        'manage_announcements','view_audit_logs'
                                      ];
                                      RESTRICTED_IDS.forEach(id => {
                                        updated[id] = false;
                                      });
                                      setRoleForm({ ...roleForm, permissions: updated });
                                    }}
                                    className="mt-0.5 w-4 h-4 accent-purple-500"
                                  />
                                  <div>
                                    <div className="text-xs font-bold text-gray-700">{sub.name}</div>
                                    <div className="text-[10px] text-gray-400 mt-0.5">{sub.desc}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}

                        {/* STEP 2: Dashboard Access */}
                        {anyLevelSelected && dashSwitches.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-[#1A1A1A] text-white text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Dashboard Access</span>
                            </div>
                            <div className="bg-amber-50/40 border border-amber-100 rounded-2xl p-4 space-y-3">
                              <p className="text-[11px] text-amber-700 font-medium">Toggle which dashboards this role can access.</p>
                              {dashSwitches.map(sw => {
                                const isToggled = permissionsObj[sw.id] === true;
                                return (
                                  <div key={sw.id} className="flex items-center justify-between gap-4 py-2.5 border-b border-amber-100/60 last:border-0">
                                    <div>
                                      <div className="text-sm font-bold text-gray-800">{sw.name}</div>
                                      <div className="text-[11px] text-gray-500 mt-0.5">{sw.desc}</div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => togglePerm(sw.id)}
                                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isToggled ? 'bg-[#D4AF37]' : 'bg-gray-200'}`}
                                    >
                                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isToggled ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* STEP 3: Additional Permissions */}
                        {anyLevelSelected && permGroups.length > 0 && (
                          <div className="space-y-5">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-[#1A1A1A] text-white text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
                              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Additional Permissions</span>
                            </div>
                            {permGroups.map(group => (
                              <div key={group.label}>
                                <div className="flex items-center gap-2 mb-2.5">
                                  <span className="text-base">{group.icon}</span>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{group.label}</span>
                                </div>
                                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50 shadow-sm">
                                  {group.items.map(item => {
                                    const isOn = permissionsObj[item.id] === true;
                                    const isAnnouncementItem = item.id === 'manage_announcements' || item.id === 'view_announcements';
                                    const isProjectItem = item.id === 'manage_projects' || item.id === 'view_projects';
                                    return (
                                      <div key={item.id} className="flex items-center justify-between gap-6 px-5 py-4">
                                        <div>
                                          <div className="text-sm font-bold text-gray-900">{item.name}</div>
                                          <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.desc}</div>
                                        </div>
                                        {(isAnnouncementItem && isDioceseSelected) || isProjectItem ? (
                                          // Radio button — only one option at a time
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = { ...roleForm.permissions } as any;
                                              if (isAnnouncementItem) {
                                                updated['manage_announcements'] = item.id === 'manage_announcements' ? !isOn : false;
                                                updated['view_announcements']   = item.id === 'view_announcements'   ? !isOn : false;
                                              } else {
                                                updated['manage_projects'] = item.id === 'manage_projects' ? !isOn : false;
                                                updated['view_projects']   = item.id === 'view_projects'   ? !isOn : false;
                                              }
                                              setRoleForm({ ...roleForm, permissions: updated });
                                            }}
                                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                                              isOn ? 'border-[#22C55E] bg-[#22C55E]/10' : 'border-gray-300 bg-white'
                                            }`}
                                          >
                                            {isOn && <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />}
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => togglePerm(item.id)}
                                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isOn ? 'bg-[#22C55E]' : 'bg-gray-200'}`}
                                          >
                                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isOn ? 'translate-x-4' : 'translate-x-0'}`} />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Prompt when no level selected */}
                        {!anyLevelSelected && (
                          <div className="text-center py-8 text-gray-400 text-sm font-medium border-2 border-dashed border-gray-100 rounded-2xl">
                            ☝️ Select an access level above to configure permissions.
                          </div>
                        )}

                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="p-8 border-t border-gray-100 bg-gray-50/50 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-[#D4AF37] text-white rounded-xl font-bold hover:bg-[#B5952F] transition-all shadow-lg shadow-[#D4AF37]/20 text-sm"
                >
                  Create Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Left Sidebar - Roles List */}
      <div className={`w-80 bg-[#F9FAFB] border-r border-gray-200 flex flex-col flex-shrink-0 transition-opacity ${isEditing ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="p-8 border-b border-gray-200 bg-white">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-5 flex items-center gap-2.5 ml-1">
            <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
            System Roles
          </h3>
          <div className="relative group">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#D4AF37] transition-colors" />
            <input
              type="text"
              placeholder="Search roles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all placeholder:text-gray-400"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {filteredRoles.map(role => (
            <button
              key={role.id}
              onClick={() => setSelectedRoleId(role.id)}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all text-left group border ${
                selectedRoleId === role.id 
                  ? 'bg-white text-gray-900 shadow-lg shadow-gray-200/50 border-gray-100' 
                  : 'text-gray-500 hover:bg-white hover:text-gray-900 hover:shadow-md border-transparent'
              }`}
            >
              <div className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm ring-2 ring-offset-2 ring-transparent group-hover:ring-gray-100 transition-all" style={{ backgroundColor: role.color }} />
              <div className="flex flex-col min-w-0">
                <span className={`text-sm font-bold truncate ${selectedRoleId === role.id ? 'text-gray-900' : 'text-gray-600'}`}>{role.name}</span>
                {PREDEFINED_ROLE_IDS.includes(role.id) && (
                  <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">System Default</span>
                )}
              </div>
            </button>
          ))}
        </div>
        <div className="p-8 border-t border-gray-200 bg-white">
          <button 
            onClick={handleOpenCreateModal}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4 text-[#D4AF37]" />
            Create Role
          </button>
        </div>
      </div>

      {/* Right Content - Permissions */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        <div className="px-10 py-8 border-b border-gray-200 flex-shrink-0 bg-white z-10 flex items-center justify-between">
          <div className="flex items-center gap-6">
            {isEditing && tempRole ? (
              <div className="flex items-center gap-5">
                <div className="relative group">
                  <input 
                    type="color" 
                    value={tempRole.color} 
                    onChange={e => setTempRole({...tempRole, color: e.target.value})}
                    className="w-10 h-10 border-0 p-0 bg-transparent cursor-pointer rounded-full overflow-hidden shadow-inner"
                  />
                  <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl">
                    Change Color
                  </div>
                </div>
                <input 
                  type="text" 
                  value={tempRole.name} 
                  onChange={e => setTempRole({...tempRole, name: e.target.value})}
                  className="text-3xl font-serif font-bold text-gray-900 border-b-2 border-[#D4AF37] focus:outline-none bg-transparent px-1 pb-1"
                  placeholder="Role Name"
                  autoFocus
                />
              </div>
            ) : (
              <>
                <div className="w-5 h-5 rounded-full shadow-sm" style={{ backgroundColor: selectedRole.color }} />
                <div>
                  <div className="flex items-center gap-4">
                    <h2 className="text-3xl font-serif font-bold text-gray-900">{selectedRole.name}</h2>
                    {isPredefined && (
                      <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                        Predefined
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1.5 font-medium">
                    {isPredefined 
                      ? 'System-defined role. Permissions are locked for security.' 
                      : 'Edit role settings and permissions for this group.'}
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {showSuccess.show && (
              <span className="text-emerald-600 text-sm font-bold animate-in fade-in slide-in-from-right-2 mr-3">
                {showSuccess.message}
              </span>
            )}
            {validationError && isEditing && (
              <span className="text-rose-500 text-sm font-bold animate-in fade-in mr-3">
                {validationError}
              </span>
            )}
            {!isPredefined && (
              <>
                {!isEditing ? (
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={startEditing}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-all active:scale-95"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit Role
                    </button>
                    <button 
                      onClick={() => setIsDeleteModalOpen(true)}
                      className="text-rose-500 hover:text-rose-700 p-2.5 rounded-xl hover:bg-rose-50 transition-all"
                      title="Delete Role"
                    >
                      <Trash className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={cancelEditing}
                      className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all active:scale-95"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={saveChanges}
                      className="px-6 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                    >
                      Save Changes
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-gray-50/50">
          <div className="max-w-4xl space-y-12">
            {(() => {
              const activePermissionsState = isEditing && tempRole ? tempRole.permissions : selectedRole.permissions;
              const isDioceseSelected = activePermissionsState.view_diocese === true;
              const isParishSelected = activePermissionsState.view_parish === true;
              const isSeminarySelected = activePermissionsState.view_seminary === true;
              const isSchoolSelected = activePermissionsState.view_school === true || activePermissionsState.view_school_cluster === true || activePermissionsState.view_school_all === true;
              const RESTRICTED_IDS = [
                'digital_twin', 
                'upload_csv_admin', 
                'manage_entities', 
                'view_priests', 
                'manage_assignments', 
                'create_users', 
                'manage_roles', 
                'manage_announcements',
                'view_audit_logs'
              ];
              
              const filteredPermissions = ALL_PERMISSIONS.map(category => {
                const filtered = category.permissions.filter(perm => {
                  if (perm.id === 'view_priests') {
                    return isDioceseSelected || isParishSelected || isSeminarySelected;
                  }
                  const DIOCESAN_ONLY_IDS = [
                    'digital_twin', 
                    'upload_csv_admin', 
                    'manage_entities', 
                    'manage_assignments', 
                    'create_users', 
                    'manage_roles', 
                    'manage_announcements',
                    'view_audit_logs'
                  ];
                  if (DIOCESAN_ONLY_IDS.includes(perm.id)) {
                    return isDioceseSelected;
                  }
                  return true;
                });
                return { ...category, permissions: filtered };
              }).filter(category => category.permissions.length > 0);

              return (
                <>
                {filteredPermissions.map((category, idx) => (
                <React.Fragment key={idx}>
                <div>
                  <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-5 flex items-center gap-2.5 ml-1">
                    {category.icon && <category.icon className="w-4 h-4" />}
                    {category.category}
                  </h3>
                  <div className="bg-white border border-gray-100 rounded-[24px] overflow-hidden divide-y divide-gray-50 shadow-sm">
                    {category.permissions.map(perm => {
                      const isViewingCategory = category.category === 'Access Level';
                      const isAnnouncementCategory = category.category === 'Announcements';
                      const isProjectsCategory = category.category === 'Projects';
                      const isEnabled = isViewingCategory && perm.id === 'view_school'
                        ? (activePermissionsState.view_school === true || activePermissionsState.view_school_cluster === true || activePermissionsState.view_school_all === true)
                        : activePermissionsState[perm.id as keyof typeof activePermissionsState];
                      const canEdit = !isPredefined && isEditing;
                      
                      return (
                        <React.Fragment key={perm.id}>
                          <div 
                            onClick={() => {
                              if (canEdit) togglePermission(perm.id);
                            }}
                            className={`p-6 flex items-center justify-between gap-8 transition-all ${
                              canEdit ? 'hover:bg-gray-50/30 cursor-pointer' : ''
                            } ${
                              !isEnabled && !canEdit ? 'opacity-40' : 'opacity-100'
                            }`}
                          >
                            <div className="flex-1 pr-10">
                              <div className="text-sm font-bold text-gray-900 mb-1.5">{perm.name}</div>
                              <div className="text-sm text-gray-500 leading-relaxed font-medium">{perm.description}</div>
                            </div>
                            {isViewingCategory ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (canEdit) togglePermission(perm.id);
                                }}
                                disabled={!canEdit}
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                  !canEdit ? 'cursor-not-allowed' : 'cursor-pointer'
                                } ${
                                  isEnabled ? 'border-[#22C55E] bg-[#22C55E]/10' : 'border-gray-300 bg-white'
                                }`}
                              >
                                {isEnabled && (
                                  <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
                                )}
                              </button>
                            ) : (isAnnouncementCategory && isDioceseSelected) || isProjectsCategory ? (
                              // Radio button for Announcements — only one can be selected
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (canEdit) togglePermission(perm.id);
                                }}
                                disabled={!canEdit}
                                aria-pressed={!!isEnabled}
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                  !canEdit ? 'cursor-not-allowed' : 'cursor-pointer'
                                } ${
                                  isEnabled ? 'border-[#22C55E] bg-[#22C55E]/10' : 'border-gray-300 bg-white'
                                }`}
                              >
                                {isEnabled && (
                                  <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (canEdit) togglePermission(perm.id);
                                }}
                                disabled={!canEdit}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-all duration-300 ease-in-out focus:outline-none ${
                                  !canEdit ? 'cursor-not-allowed' : 'cursor-pointer focus:ring-4 focus:ring-[#22C55E]/20 focus:ring-offset-0'
                                } ${
                                  isEnabled ? 'bg-[#22C55E]' : 'bg-gray-200'
                                }`}
                              >
                                <span
                                  aria-hidden="true"
                                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-300 ease-in-out ${
                                    isEnabled ? 'translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            )}
                          </div>

                          {isViewingCategory && perm.id === 'view_school' && isEnabled && (
                            <div className="ml-10 pl-6 border-l-2 border-gray-100 py-2 space-y-2.5 bg-gray-50/20 my-2 mr-6 rounded-r-xl">
                              {[
                                { id: 'view_school', name: 'Assigned School Only', description: 'Allows the user to view records specific to their assigned school.' },
                                { id: 'view_school_cluster', name: 'Cluster School', description: 'Allows the user to view assigned cluster schools.' },
                                { id: 'view_school_all', name: 'All Schools', description: 'Allows the user to view all schools in the diocese.' }
                              ].map(sub => {
                                const isSubChecked = activePermissionsState[sub.id as keyof typeof activePermissionsState] === true;
                                return (
                                  <label 
                                    key={sub.id} 
                                    onClick={() => {
                                      if (canEdit) {
                                        const updatedPermissions = { ...tempRole!.permissions } as any;
                                        ['view_diocese', 'view_parish', 'view_seminary', 'view_school', 'view_school_cluster', 'view_school_all'].forEach(id => {
                                          updatedPermissions[id] = (id === sub.id);
                                        });
                                        updatedPermissions['view_school_dashboard'] = true;
                                        const RESTRICTED_IDS = [
                                          'digital_twin', 
                                          'upload_csv_admin', 
                                          'manage_entities', 
                                          'view_priests', 
                                          'manage_assignments', 
                                          'create_users', 
                                          'manage_roles', 
                                          'manage_announcements',
                                          'view_audit_logs'
                                        ];
                                        RESTRICTED_IDS.forEach(id => {
                                          updatedPermissions[id] = false;
                                        });
                                        setTempRole({
                                          ...tempRole!,
                                          permissions: updatedPermissions
                                        });
                                      }
                                    }}
                                    className={`flex items-start gap-4 p-4 rounded-2xl border border-transparent transition-all ${
                                      canEdit ? 'hover:bg-gray-50/50 cursor-pointer hover:border-gray-100' : ''
                                    } ${
                                      !isSubChecked && !canEdit ? 'opacity-40' : 'opacity-100'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name="school_sub_level_details"
                                      checked={isSubChecked}
                                      disabled={!canEdit}
                                      onChange={() => {}}
                                      className={`mt-0.5 w-4 h-4 border-gray-300 text-[#D4AF37] focus:ring-[#D4AF37] accent-[#D4AF37] ${
                                        canEdit ? 'cursor-pointer' : 'cursor-not-allowed'
                                      }`}
                                    />
                                    <div>
                                      <div className="text-sm font-bold text-gray-800">{sub.name}</div>
                                      <div className="text-xs text-gray-500 mt-1 leading-relaxed">{sub.description}</div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
                {/* ── Dashboard Access — right after Viewing Permissions ── */}
                {category.category === 'Access Level' && (isDioceseSelected || isParishSelected || isSeminarySelected || isSchoolSelected) && (() => {
                  const dashItems = [
                    ...(isDioceseSelected || isParishSelected   ? [{ id: 'view_parish_dashboard',   name: 'Parish Dashboard',   description: 'Allows viewing and accessing parish-level financial summaries and operational reports.' }]   : []),
                    ...(isDioceseSelected || isSeminarySelected ? [{ id: 'view_seminary_dashboard', name: 'Seminary Dashboard', description: 'Allows viewing and accessing seminary-level financial summaries and educational timelines.' }] : []),
                    ...(isDioceseSelected || isSchoolSelected   ? [{ id: 'view_school_dashboard',   name: 'School Dashboard',   description: 'Allows viewing and accessing school-level financial summaries and academic metrics.' }]       : []),
                  ];
                  const canEditDash = !isPredefined && isEditing;
                  return (
                    <div>
                      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-5 flex items-center gap-2.5 ml-1">
                        📊 Dashboard Access
                      </h3>
                      <div className="bg-white border border-gray-100 rounded-[24px] overflow-hidden divide-y divide-gray-50 shadow-sm">
                        {dashItems.map(sw => {
                          const isToggled = activePermissionsState[sw.id as keyof typeof activePermissionsState] === true;
                          return (
                            <div
                              key={sw.id}
                              onClick={() => { if (canEditDash && tempRole) setTempRole({ ...tempRole, permissions: { ...tempRole.permissions, [sw.id]: !isToggled } }); }}
                              className={`p-6 flex items-center justify-between gap-8 transition-all ${
                                canEditDash ? 'hover:bg-gray-50/30 cursor-pointer' : ''
                              } ${
                                !isToggled && !canEditDash ? 'opacity-40' : 'opacity-100'
                              }`}
                            >
                              <div className="flex-1 pr-10">
                                <div className="text-sm font-bold text-gray-900 mb-1.5">{sw.name}</div>
                                <div className="text-sm text-gray-500 leading-relaxed font-medium">{sw.description}</div>
                              </div>
                              <button
                                type="button"
                                disabled={!canEditDash}
                                onClick={(e) => { e.stopPropagation(); if (canEditDash && tempRole) setTempRole({ ...tempRole, permissions: { ...tempRole.permissions, [sw.id]: !isToggled } }); }}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-all duration-300 ease-in-out focus:outline-none ${
                                  !canEditDash ? 'cursor-not-allowed' : 'cursor-pointer focus:ring-4 focus:ring-[#22C55E]/20 focus:ring-offset-0'
                                } ${
                                  isToggled ? 'bg-[#22C55E]' : 'bg-gray-200'
                                }`}
                              >
                                <span aria-hidden="true" className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-300 ease-in-out ${
                                  isToggled ? 'translate-x-5' : 'translate-x-0'
                                }`} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                </React.Fragment>
              ))}

                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
