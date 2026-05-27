'use client';

import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Search, Building2, School, GraduationCap, AlertTriangle, ArrowRight } from 'lucide-react';
import { Parish, Seminary, DiocesanSchool, EntityClass } from '../../types';
import { VICARIATES, CLASSES } from '../../constants';

interface EntityManagementControlProps {
  parishes: Parish[];
  seminaries: Seminary[];
  schools: DiocesanSchool[];
  onUpdateParishes: (parishes: Parish[]) => void;
  onUpdateSeminaries: (seminaries: Seminary[]) => void;
  onUpdateSchools: (schools: DiocesanSchool[]) => void;
  onNavigate?: (page: string) => void;
}

const stripVicariatePrefix = (name: string) => name.replace('Vicariate of ', '');

export function EntityManagementControl({
  parishes,
  seminaries,
  schools,
  onUpdateParishes,
  onUpdateSeminaries,
  onUpdateSchools,
  onNavigate
}: EntityManagementControlProps) {
  const [activeSubTab, setActiveSubTab] = useState<'parishes' | 'seminaries' | 'schools'>('parishes');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<any | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<any | null>(null);
  const [showSuccess, setShowSuccess] = useState<{show: boolean, message: string}>({ show: false, message: '' });

  // Form state
  const [formState, setFormState] = useState({
    name: '',
    vicariate: VICARIATES[0],
    class: CLASSES[0],
    address: ''
  });

  const handleOpenModal = (entity?: any) => {
    if (entity) {
      setEditingEntity(entity);
      setFormState({
        name: entity.name || '',
        vicariate: entity.vicariate || VICARIATES[0],
        class: entity.class || CLASSES[0],
        address: entity.address || ''
      });
    } else {
      setEditingEntity(null);
      setFormState({
        name: '',
        vicariate: VICARIATES[0],
        class: CLASSES[0],
        address: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const id = editingEntity ? editingEntity.id : Math.random().toString(36).substr(2, 9);
    
    const baseData = {
      id,
      name: formState.name,
      vicariate: formState.vicariate,
      class: formState.class,
      address: formState.address
    };

    if (activeSubTab === 'parishes') {
      const newParish: Parish = { 
        ...baseData,
        class: formState.class as EntityClass,
        pastor: editingEntity?.pastor || '',
        contactNumber: editingEntity?.contactNumber || '',
        email: editingEntity?.email || ''
      };
      if (editingEntity) {
        onUpdateParishes(parishes.map(p => p.id === id ? newParish : p));
        setShowSuccess({ show: true, message: 'Parish updated successfully!' });
      } else {
        onUpdateParishes([...parishes, newParish]);
        setShowSuccess({ show: true, message: 'Parish created successfully!' });
      }
    } else if (activeSubTab === 'seminaries') {
      const newSeminary: Seminary = { 
        ...baseData,
        class: formState.class as EntityClass,
        rector: editingEntity?.rector || '',
        enrollment: editingEntity?.enrollment || 0,
        capacity: editingEntity?.capacity || 0,
        staff: editingEntity?.staff || 0
      };
      if (editingEntity) {
        onUpdateSeminaries(seminaries.map(s => s.id === id ? newSeminary : s));
        setShowSuccess({ show: true, message: 'Seminary updated successfully!' });
      } else {
        onUpdateSeminaries([...seminaries, newSeminary]);
        setShowSuccess({ show: true, message: 'Seminary created successfully!' });
      }
    } else {
      const newSchool: DiocesanSchool = { 
        ...baseData,
        class: formState.class as EntityClass,
        principal: editingEntity?.principal || '',
        level: editingEntity?.level || 'K-12',
        enrollment: editingEntity?.enrollment || 0,
        capacity: editingEntity?.capacity || 0,
        staff: editingEntity?.staff || 0
      };
      if (editingEntity) {
        onUpdateSchools(schools.map(s => s.id === id ? newSchool : s));
        setShowSuccess({ show: true, message: 'School updated successfully!' });
      } else {
        onUpdateSchools([...schools, newSchool]);
        setShowSuccess({ show: true, message: 'School created successfully!' });
      }
    }

    setTimeout(() => setShowSuccess({ show: false, message: '' }), 3000);
    setIsModalOpen(false);
  };

  const handleDelete = () => {
    if (!entityToDelete) return;
    
    if (activeSubTab === 'parishes') {
      onUpdateParishes(parishes.filter(p => p.id !== entityToDelete.id));
      setShowSuccess({ show: true, message: 'Parish deleted successfully!' });
    } else if (activeSubTab === 'seminaries') {
      onUpdateSeminaries(seminaries.filter(s => s.id !== entityToDelete.id));
      setShowSuccess({ show: true, message: 'Seminary deleted successfully!' });
    } else {
      onUpdateSchools(schools.filter(s => s.id !== entityToDelete.id));
      setShowSuccess({ show: true, message: 'School deleted successfully!' });
    }

    setTimeout(() => setShowSuccess({ show: false, message: '' }), 3000);
    setIsDeleteModalOpen(false);
    setEntityToDelete(null);
  };

  const filteredData = () => {
    const query = searchQuery.toLowerCase();
    if (activeSubTab === 'parishes') {
      return parishes.filter(p => p.name.toLowerCase().includes(query) || p.vicariate.toLowerCase().includes(query));
    } else if (activeSubTab === 'seminaries') {
      return seminaries.filter(s => s.name.toLowerCase().includes(query) || s.vicariate.toLowerCase().includes(query));
    } else {
      return schools.filter(s => s.name.toLowerCase().includes(query) || s.vicariate.toLowerCase().includes(query));
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-[120] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="p-8 text-center space-y-6">
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto border border-rose-100">
                <AlertTriangle className="w-8 h-8 text-rose-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-gray-900">Delete Entity</h3>
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete <span className="font-bold text-gray-900">"{entityToDelete?.name}"</span>? 
                  This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDelete}
                  className="flex-1 px-6 py-3 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/20 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-[110] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="bg-[#1A1A1A] p-8 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
              <h3 className="text-2xl font-bold relative z-10">
                {editingEntity ? `Edit ${activeSubTab.slice(0, -1)}` : `Add New ${activeSubTab.slice(0, -1)}`}
              </h3>
              <p className="text-white/50 text-sm mt-1 relative z-10">
                Enter the details for the {activeSubTab.slice(0, -1)} below.
              </p>
            </div>
            
            <form onSubmit={handleSave} className="p-8 space-y-6">
              <div className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Name</label>
                  <input 
                    type="text" 
                    required
                    value={formState.name}
                    onChange={(e) => setFormState({...formState, name: e.target.value})}
                    placeholder={`e.g. ${activeSubTab === 'parishes' ? 'St. Jude Parish' : activeSubTab === 'seminaries' ? 'Holy Cross Seminary' : 'San Pablo School'}`}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all placeholder:text-gray-400"
                  />
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Vicariate</label>
                  <div className="relative">
                    <select 
                      required
                      value={formState.vicariate}
                      onChange={(e) => setFormState({...formState, vicariate: e.target.value})}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all appearance-none"
                    >
                      {VICARIATES.map(v => (
                        <option key={v} value={v}>{stripVicariatePrefix(v)}</option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ArrowRight className="w-4 h-4 text-gray-400 rotate-90" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Address</label>
                  <input 
                    type="text" 
                    required
                    value={formState.address}
                    onChange={(e) => setFormState({...formState, address: e.target.value})}
                    placeholder="Full address"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all placeholder:text-gray-400"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-6 py-3 bg-[#D4AF37] text-white rounded-xl font-bold hover:bg-[#B5952F] transition-colors shadow-lg shadow-[#D4AF37]/20 text-sm"
                >
                  {editingEntity ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-10">
        <div className="space-y-1">
          <h3 className="text-2xl font-bold text-gray-900">Entity Management</h3>
          <p className="text-sm text-gray-500">Manage parishes, seminaries, and schools.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex p-1 bg-gray-100 rounded-xl">
            <button 
              onClick={() => setActiveSubTab('parishes')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'parishes' ? 'bg-white text-[#D4AF37] shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Parishes
            </button>
            <button 
              onClick={() => setActiveSubTab('seminaries')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'seminaries' ? 'bg-white text-[#D4AF37] shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Seminaries
            </button>
            <button 
              onClick={() => setActiveSubTab('schools')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'schools' ? 'bg-white text-[#D4AF37] shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <School className="w-3.5 h-3.5" />
              Schools
            </button>
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="bg-[#D4AF37] hover:bg-[#B5952F] text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-[#D4AF37]/20 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add {activeSubTab === 'parishes' ? 'Parish' : activeSubTab === 'seminaries' ? 'Seminary' : 'School'}
          </button>
        </div>
      </div>

      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input 
          type="text" 
          placeholder={`Search ${activeSubTab}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all placeholder:text-gray-400"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-4">Name & Address</th>
              <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vicariate</th>
              <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right pr-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredData().map((item: any) => (
              <tr key={item.id} className="group hover:bg-gray-50/50 transition-colors">
                <td className="py-5 pl-4">
                  <div className="flex flex-col">
                    <span className="text-gray-900 font-bold text-sm">{item.name}</span>
                    <span className="text-gray-400 text-[11px] mt-0.5">{item.address}</span>
                  </div>
                </td>
                <td className="py-5">
                  <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    {stripVicariatePrefix(item.vicariate)}
                  </span>
                </td>
                <td className="py-5 text-right pr-4">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleOpenModal(item)}
                      className="text-[#D4AF37] hover:bg-[#FDF6E3] p-2 rounded-xl transition-all"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        setEntityToDelete(item);
                        setIsDeleteModalOpen(true);
                      }}
                      className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredData().length === 0 && (
              <tr>
                <td colSpan={3} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                      <Search className="w-8 h-8 text-gray-300" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-gray-900 font-bold">No entities found</p>
                      <p className="text-sm text-gray-500">Try adjusting your search or add a new one.</p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
