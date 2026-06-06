'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Plus,
  Trash2,
  Edit2,
  X,
  Send,
  User,
  Calendar,
  Megaphone,
  Wallet,
  ClipboardList,
  CalendarDays,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../firebase';
import { formatDate } from '../lib/format';
import { INITIAL_ROLES } from '../constants';
import { usePermissions } from '../hooks/usePermissions';

interface Announcement {
  id: string;
  title: string;
  content: string;
  author: string;
  authorRole: string;
  createdAt: number;
  priority: 'low' | 'medium' | 'high';
  category: 'general' | 'financial' | 'administrative' | 'event';
}

const PRIORITY_STYLES = {
  low: {
    badge: 'bg-sky-50 text-sky-700 border-sky-100',
    rail: 'border-sky-400',
    label: 'Routine',
  },
  medium: {
    badge: 'bg-amber-50 text-amber-700 border-amber-100',
    rail: 'border-amber-400',
    label: 'Important',
  },
  high: {
    badge: 'bg-rose-50 text-rose-700 border-rose-100',
    rail: 'border-rose-400',
    label: 'Urgent',
  },
} as const;

const CATEGORY_META = {
  general: { icon: Megaphone, label: 'General' },
  financial: { icon: Wallet, label: 'Financial' },
  administrative: { icon: ClipboardList, label: 'Administrative' },
  event: { icon: CalendarDays, label: 'Event' },
} as const;

export function Announcements() {
  const { permissions } = usePermissions();
  const { user } = useAuth();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Announcement['category']>('all');

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    priority: 'medium' as Announcement['priority'],
    category: 'general' as Announcement['category'],
  });

  useEffect(() => {
    fetch('/api/announcements', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Announcement[]) => setAnnouncements(data))
      .catch(() => setAnnouncements([]));
  }, []);

  if (!permissions.view_announcements && !permissions.manage_announcements) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-12 rounded-[40px] border border-slate-100 shadow-xl max-w-md text-center space-y-6">
          <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mx-auto">
            <Bell className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-slate-950">Access Denied</h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            Your account role does not have viewing permissions for Diocesan Announcements. Please contact your diocesan
            administrator to request access.
          </p>
        </div>
      </div>
    );
  }

  const canCreateAnnouncements = permissions.manage_announcements;

  const announcementCounts = useMemo(() => {
    return {
      total: announcements.length,
      urgent: announcements.filter((announcement) => announcement.priority === 'high').length,
      events: announcements.filter((announcement) => announcement.category === 'event').length,
    };
  }, [announcements]);

  const resetForm = useCallback(() => {
    setFormData({
      title: '',
      content: '',
      priority: 'medium',
      category: 'general',
    });
    setEditingId(null);
  }, []);

  const handleAddAnnouncement = useCallback(async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      alert('Please fill in all fields');
      return;
    }

    if (editingId) {
      // Optimistic local update for edits (no PATCH endpoint yet)
      setAnnouncements((prev) =>
        prev.map((announcement) =>
          announcement.id === editingId
            ? {
                ...announcement,
                title: formData.title,
                content: formData.content,
                priority: formData.priority,
                category: formData.category,
              }
            : announcement,
        ),
      );
    } else {
      try {
        const res = await fetch('/api/announcements', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formData.title,
            content: formData.content,
            author: user?.name || "Chancellor's Office",
            authorRole: user?.role || 'admin',
            priority: formData.priority,
            category: formData.category,
          }),
        });
        if (res.ok) {
          const created: Announcement = await res.json();
          setAnnouncements((prev) => [created, ...prev]);
        } else {
          // Fallback: optimistic insert
          const newAnnouncement: Announcement = {
            id: Math.random().toString(36).substr(2, 9),
            title: formData.title,
            content: formData.content,
            author: user?.name || "Chancellor's Office",
            authorRole: user?.role || 'admin',
            createdAt: Date.now(),
            priority: formData.priority,
            category: formData.category,
          };
          setAnnouncements((prev) => [newAnnouncement, ...prev]);
        }
      } catch {
        // Fallback: optimistic insert
        const newAnnouncement: Announcement = {
          id: Math.random().toString(36).substr(2, 9),
          title: formData.title,
          content: formData.content,
          author: user?.name || "Chancellor's Office",
          authorRole: user?.role || 'admin',
          createdAt: Date.now(),
          priority: formData.priority,
          category: formData.category,
        };
        setAnnouncements((prev) => [newAnnouncement, ...prev]);
      }
    }

    resetForm();
    setShowForm(false);
  }, [editingId, formData, resetForm, user]);

  const handleDelete = useCallback(async (id: string) => {
    if (confirm('Delete this announcement?')) {
      // Optimistic remove
      setAnnouncements((prev) => prev.filter((announcement) => announcement.id !== id));
      try {
        await fetch('/api/announcements?id=' + encodeURIComponent(id), {
          method: 'DELETE',
          credentials: 'include',
        });
      } catch {
        // If delete fails, re-fetch to restore state
        fetch('/api/announcements', { credentials: 'include' })
          .then((res) => (res.ok ? res.json() : []))
          .then((data: Announcement[]) => setAnnouncements(data))
          .catch(() => {});
      }
    }
  }, []);

  const handleEdit = useCallback((announcement: Announcement) => {
    setFormData({
      title: announcement.title,
      content: announcement.content,
      priority: announcement.priority,
      category: announcement.category,
    });
    setEditingId(announcement.id);
    setShowForm(true);
  }, []);

  const filteredAnnouncements =
    filter === 'all' ? announcements : announcements.filter((announcement) => announcement.category === filter);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.08),_transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] pt-6 pb-20 px-4 md:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="rounded-[36px] border border-white/70 bg-white/85 backdrop-blur-xl shadow-[0_24px_80px_rgba(15,23,42,0.08)] p-6 md:p-8 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-3 rounded-full bg-slate-950 px-4 py-2 text-white mb-5">
                <Bell className="w-4 h-4 text-gold-500" />
                <span className="text-[10px] font-black uppercase tracking-[0.28em]">Announcement Board</span>
              </div>
              <h1 className="text-3xl md:text-5xl font-serif font-bold tracking-tight text-slate-950">
                Chancellor&apos;s Board
              </h1>
              <p className="mt-3 text-sm md:text-base text-slate-600 max-w-2xl leading-relaxed">
                Central posting space for diocesan updates, directives, financial notices, and event reminders.
              </p>
            </div>

            {canCreateAnnouncements && (
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="inline-flex items-center justify-center gap-3 rounded-2xl bg-gold-500 hover:bg-gold-600 text-church-green-dark px-6 py-4 font-bold text-[11px] uppercase tracking-[0.22em] transition-all shadow-xl shadow-gold-500/20"
              >
                <Plus className="w-4 h-4" />
                New Announcement
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            {[
              {
                label: 'Total Posts',
                value: announcementCounts.total,
                tone: 'bg-slate-50 text-slate-700 border-slate-200',
              },
              {
                label: 'Urgent Notices',
                value: announcementCounts.urgent,
                tone: 'bg-rose-50 text-rose-700 border-rose-200',
              },
              {
                label: 'Event Updates',
                value: announcementCounts.events,
                tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
              },
            ].map((item) => (
              <div key={item.label} className={`rounded-3xl border px-5 py-4 ${item.tone}`}>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] opacity-70">{item.label}</p>
                <p className="mt-2 text-3xl font-serif font-bold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          {(['all', 'general', 'financial', 'administrative', 'event'] as const).map((category) => {
            const isActive = filter === category;
            const meta = category === 'all' ? null : CATEGORY_META[category];
            const Icon = meta?.icon;

            return (
              <button
                key={category}
                onClick={() => setFilter(category)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] transition-all ${
                  isActive
                    ? 'bg-slate-950 text-white border-slate-950 shadow-lg'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {Icon ? <Icon className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                {category === 'all' ? 'All Posts' : meta?.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setShowForm(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 20 }}
                onClick={(event) => event.stopPropagation()}
                className="bg-white rounded-[32px] shadow-2xl max-w-3xl w-full p-6 md:p-8 border border-slate-100"
              >
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-600 mb-2">
                      Announcement Editor
                    </p>
                    <h2 className="text-3xl font-serif font-bold text-slate-950">
                      {editingId ? 'Edit Announcement' : 'New Announcement'}
                    </h2>
                  </div>
                  <button
                    onClick={() => setShowForm(false)}
                    className="p-2 hover:bg-slate-100 rounded-2xl transition-colors"
                  >
                    <X className="w-6 h-6 text-slate-500" />
                  </button>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 mb-3">
                      Title
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                      placeholder="Announcement title"
                      className="w-full px-5 py-4 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 outline-none text-sm font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 mb-3">
                      Content
                    </label>
                    <textarea
                      value={formData.content}
                      onChange={(event) => setFormData({ ...formData, content: event.target.value })}
                      placeholder="Announcement content"
                      rows={7}
                      className="w-full px-5 py-4 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 outline-none resize-none text-sm font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 mb-3">
                        Category
                      </label>
                      <select
                        value={formData.category}
                        onChange={(event) =>
                          setFormData({ ...formData, category: event.target.value as Announcement['category'] })
                        }
                        className="w-full px-5 py-4 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 outline-none text-sm font-medium"
                      >
                        <option value="general">General</option>
                        <option value="financial">Financial</option>
                        <option value="administrative">Administrative</option>
                        <option value="event">Event</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 mb-3">
                        Priority
                      </label>
                      <select
                        value={formData.priority}
                        onChange={(event) =>
                          setFormData({ ...formData, priority: event.target.value as Announcement['priority'] })
                        }
                        className="w-full px-5 py-4 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 outline-none text-sm font-medium"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
                    <button
                      onClick={() => setShowForm(false)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-900 px-5 py-4 rounded-2xl transition-colors font-bold text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddAnnouncement}
                      className="flex-1 flex items-center justify-center gap-2 bg-slate-950 hover:bg-slate-800 text-white px-5 py-4 rounded-2xl transition-colors font-bold text-sm"
                    >
                      <Send className="w-4 h-4" />
                      {editingId ? 'Update Announcement' : 'Publish Announcement'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {filteredAnnouncements.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-[32px] border border-dashed border-slate-200 bg-white/80 p-16 text-center"
              >
                <Bell className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-lg font-serif font-bold text-slate-900">No announcements yet</p>
                <p className="text-slate-500 mt-1">Posts in this category will appear here once published.</p>
              </motion.div>
            ) : (
              filteredAnnouncements.map((announcement, index) => {
                const priority = PRIORITY_STYLES[announcement.priority];
                const Icon = CATEGORY_META[announcement.category].icon;

                return (
                  <motion.button
                    key={announcement.id}
                    type="button"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: index * 0.04 }}
                    onClick={() => setSelectedAnnouncement(announcement)}
                    className={`w-full text-left bg-white rounded-[30px] border-l-4 ${priority.rail} p-6 border-t border-r border-b border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-900/5 transition-all`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${priority.badge}`}
                            >
                              {priority.label}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                              {CATEGORY_META[announcement.category].label}
                            </span>
                          </div>
                          <h3 className="font-bold text-xl text-slate-950 leading-tight">{announcement.title}</h3>
                          <p className="text-slate-600 mt-3 line-clamp-2 leading-relaxed">{announcement.content}</p>
                          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-slate-500">
                            <div className="flex items-center gap-1.5">
                              <User className="w-4 h-4" />
                              {announcement.author}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4" />
                              {formatDate(new Date(announcement.createdAt))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {canCreateAnnouncements && (
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleEdit(announcement);
                            }}
                            className="p-3 hover:bg-slate-100 rounded-2xl transition-colors"
                          >
                            <Edit2 className="w-4 h-4 text-blue-600" />
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDelete(announcement.id);
                            }}
                            className="p-3 hover:bg-rose-50 rounded-2xl transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-rose-600" />
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.button>
                );
              })
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {selectedAnnouncement && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setSelectedAnnouncement(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 20 }}
                onClick={(event) => event.stopPropagation()}
                className="bg-white rounded-[32px] shadow-2xl max-w-3xl w-full p-6 md:p-8 max-h-[85vh] overflow-y-auto border border-slate-100"
              >
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${PRIORITY_STYLES[selectedAnnouncement.priority].badge}`}
                      >
                        {PRIORITY_STYLES[selectedAnnouncement.priority].label}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        {CATEGORY_META[selectedAnnouncement.category].label}
                      </span>
                    </div>
                    <h2 className="text-3xl font-serif font-bold text-slate-950 leading-tight">
                      {selectedAnnouncement.title}
                    </h2>
                    <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <User className="w-4 h-4" />
                        {selectedAnnouncement.author}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />
                        {formatDate(new Date(selectedAnnouncement.createdAt))}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedAnnouncement(null)}
                    className="p-2 hover:bg-slate-100 rounded-2xl transition-colors shrink-0"
                  >
                    <X className="w-6 h-6 text-slate-500" />
                  </button>
                </div>

                <div className="rounded-[28px] border border-slate-100 bg-slate-50/70 p-6">
                  <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{selectedAnnouncement.content}</p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
