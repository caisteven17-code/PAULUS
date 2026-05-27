'use client';

import React, { useState } from 'react';
import { Plus, X, Edit2, Trash2, Calendar, Users, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface Fiesta {
  id: string;
  primaryPatron: string;
  secondaryPatron?: string;
  date: string;
  expectedImpact: 'low' | 'medium' | 'high';
  estimatedCollectionIncrease?: number;
}

interface FiestaManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  fiestas: Fiesta[];
  onSave: (fiestas: Fiesta[]) => void;
  entityName?: string;
}

export function FiestaManagementModal({
  isOpen,
  onClose,
  fiestas: initialFiestas,
  onSave,
  entityName = 'Parish',
}: FiestaManagementModalProps) {
  const [fiestas, setFiestas] = useState<Fiesta[]>(initialFiestas);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    primaryPatron: string;
    secondaryPatron: string;
    date: string;
    expectedImpact: 'low' | 'medium' | 'high';
    estimatedCollectionIncrease: number;
  }>({
    primaryPatron: '',
    secondaryPatron: '',
    date: '',
    expectedImpact: 'medium',
    estimatedCollectionIncrease: 0,
  });

  const resetForm = () => {
    setFormData({
      primaryPatron: '',
      secondaryPatron: '',
      date: '',
      expectedImpact: 'medium',
      estimatedCollectionIncrease: 0,
    });
    setEditingId(null);
    setIsAddingNew(false);
  };

  const handleAddOrEdit = () => {
    if (!formData.primaryPatron || !formData.date) {
      alert('Please fill in Primary Patron and Date');
      return;
    }

    if (editingId) {
      setFiestas(fiestas.map(f => 
        f.id === editingId 
          ? { ...f, ...formData }
          : f
      ));
    } else {
      setFiestas([...fiestas, {
        id: Date.now().toString(),
        ...formData,
      }]);
    }

    resetForm();
  };

  const handleEdit = (fiesta: Fiesta) => {
    setFormData({
      primaryPatron: fiesta.primaryPatron,
      secondaryPatron: fiesta.secondaryPatron || '',
      date: fiesta.date,
      expectedImpact: fiesta.expectedImpact,
      estimatedCollectionIncrease: fiesta.estimatedCollectionIncrease || 0,
    });
    setEditingId(fiesta.id);
    setIsAddingNew(true);
  };

  const handleDelete = (id: string) => {
    setFiestas(fiestas.filter(f => f.id !== id));
  };

  const handleSave = () => {
    onSave(fiestas);
    onClose();
  };

  const impactColors = {
    low: 'bg-blue-50 border-blue-200 text-blue-700',
    medium: 'bg-amber-50 border-amber-200 text-amber-700',
    high: 'bg-green-50 border-green-200 text-green-700',
  };

  const impactLabels = {
    low: '📊 Low Impact',
    medium: '📈 Medium Impact',
    high: '📊 High Impact',
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-gold-50 to-gold-100/50 border-b border-gold-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Fiesta Management</h2>
            <p className="text-sm text-gray-600">{entityName} - Configure patron saints and fiesta dates</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-bold mb-1">About Fiesta Impact</p>
              <p>Fiesta dates help the system understand seasonal patterns in your collections. This improves forecasting accuracy.</p>
            </div>
          </div>

          {/* Fiestas List */}
          <div className="space-y-3">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gold-600" />
              Configured Fiestas ({fiestas.length})
            </h3>

            {fiestas.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                <p>No fiestas configured yet. Add one to get started.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {fiestas.map((fiesta, index) => (
                  <motion.div
                    key={fiesta.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between hover:shadow-md transition-shadow"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{fiesta.primaryPatron}</span>
                        {fiesta.secondaryPatron && (
                          <>
                            <span className="text-gray-400">+</span>
                            <span className="text-gray-600">{fiesta.secondaryPatron}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-600">
                        <span>📅 {new Date(fiesta.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
                        <span className={`px-2 py-1 rounded border text-xs font-bold ${impactColors[fiesta.expectedImpact]}`}>
                          {impactLabels[fiesta.expectedImpact]}
                        </span>
                        {fiesta.estimatedCollectionIncrease && fiesta.estimatedCollectionIncrease > 0 && (
                          <span className="text-green-700 font-bold">+₱{fiesta.estimatedCollectionIncrease.toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(fiesta)}
                        className="p-2 text-gray-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(fiesta.id)}
                        className="p-2 text-gray-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Add/Edit Form */}
          <div className="border-t pt-6">
            <button
              onClick={() => {
                setIsAddingNew(!isAddingNew);
                if (isAddingNew) resetForm();
              }}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold transition-colors ${
                isAddingNew
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-gold-500 text-black hover:bg-gold-600'
              }`}
            >
              <Plus className="w-5 h-5" />
              {isAddingNew ? 'Cancel' : 'Add New Fiesta'}
            </button>

            {isAddingNew && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 space-y-4 p-4 bg-gray-50 rounded-lg"
              >
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Primary Patron Saint *
                  </label>
                  <input
                    type="text"
                    value={formData.primaryPatron}
                    onChange={(e) => setFormData({ ...formData, primaryPatron: e.target.value })}
                    placeholder="e.g., San Jose, San Miguel, Our Lady of Peace"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Secondary Patron Saint (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.secondaryPatron}
                    onChange={(e) => setFormData({ ...formData, secondaryPatron: e.target.value })}
                    placeholder="e.g., San Jose"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Fiesta Date *
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Expected Collection Impact
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['low', 'medium', 'high'] as const).map((impact) => (
                      <button
                        key={impact}
                        onClick={() => setFormData({ ...formData, expectedImpact: impact })}
                        className={`py-2 rounded-lg font-bold text-sm transition-all ${
                          formData.expectedImpact === impact
                            ? `${impactColors[impact]} ring-2 ring-offset-2 ring-gold-500`
                            : `${impactColors[impact]} opacity-50 hover:opacity-75`
                        }`}
                      >
                        {impactLabels[impact]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Estimated Collection Increase (₱) - Optional
                  </label>
                  <input
                    type="number"
                    value={formData.estimatedCollectionIncrease}
                    onChange={(e) => setFormData({ ...formData, estimatedCollectionIncrease: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g., 50000"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave blank to estimate automatically based on impact level</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={resetForm}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-bold py-2 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddOrEdit}
                    className="flex-1 bg-gold-500 hover:bg-gold-600 text-black font-bold py-2 rounded-lg transition-colors"
                  >
                    {editingId ? 'Update Fiesta' : 'Add Fiesta'}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-bold py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 bg-gold-500 hover:bg-gold-600 text-black font-bold py-2 rounded-lg transition-colors"
          >
            Save Changes
          </button>
        </div>
      </motion.div>
    </div>
  );
}
