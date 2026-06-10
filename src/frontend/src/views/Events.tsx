'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CalendarDays, Plus, X, Check, Clock, ChevronDown, AlertCircle } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';
import { apiClient } from '../lib/api-client';

interface DiocesanEvent {
  id: string;
  event_name: string;
  event_level: 'Major event' | 'Minor event';
  event_type?: string;
  start_date: string;
  end_date?: string;
  notes?: string;
  institution_id?: string;
}

const EVENT_TYPES = [
  'Parish Feast Day',
  'Fundraising Activity',
  'Community Outreach',
  'Spiritual Retreat',
  'Youth Activity',
  'Parish Meeting',
  'Mass / Liturgy',
  'Other',
];

function formatLongDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function isUpcoming(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T00:00:00') >= today;
}

const EMPTY_FORM = {
  event_name: '',
  event_level: 'Minor event' as DiocesanEvent['event_level'],
  event_type: '',
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
  notes: '',
};

export function Events() {
  const { permissions } = usePermissions();
  const canManage = permissions.manage_events === true;

  const [events, setEvents] = useState<DiocesanEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');

  useEffect(() => {
    setLoading(true);
    apiClient
      .getEvents()
      .then((data) => setEvents(data ?? []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  const upcoming = events.filter((e) => isUpcoming(e.start_date)).sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
  );
  const past = events.filter((e) => !isUpcoming(e.start_date)).sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
  );
  const displayed = filter === 'upcoming' ? upcoming : filter === 'past' ? past : events;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const saved = await apiClient.saveEvent({
        ...formData,
        end_date: formData.end_date || undefined,
        notes: formData.notes || undefined,
        event_type: formData.event_type || undefined,
      });
      setEvents((prev) => [saved, ...prev]);
      setIsModalOpen(false);
      setFormData(EMPTY_FORM);
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Failed to save event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 md:py-12">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-church-black flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-gold-400" />
              </div>
              <h1 className="text-3xl md:text-4xl font-serif font-bold text-church-black tracking-tight">
                Parish Events
              </h1>
            </div>
            <p className="text-base text-gray-500 font-medium">
              Schedule and view upcoming activities and celebrations.
            </p>
          </div>

          {canManage && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { setIsModalOpen(true); setSubmitError(null); setFormData(EMPTY_FORM); }}
              className="flex items-center gap-3 px-7 py-4 bg-church-black text-white rounded-2xl font-bold text-sm tracking-wide shadow-xl shadow-church-black/20 hover:bg-church-green-dark transition-all shrink-0"
            >
              <Plus className="w-5 h-5" />
              ADD NEW EVENT
            </motion.button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-8 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm w-fit">
          {(['upcoming', 'past', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all capitalize ${
                filter === f
                  ? 'bg-church-black text-white shadow-md'
                  : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              {f === 'upcoming' ? `Upcoming (${upcoming.length})` : f === 'past' ? `Past (${past.length})` : `All (${events.length})`}
            </button>
          ))}
        </div>

        {/* Events list */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-church-black rounded-full animate-spin" />
            <p className="text-gray-400 font-medium">Loading events…</p>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-5 bg-white rounded-3xl border border-gray-100">
            <div className="w-20 h-20 bg-gray-50 rounded-[24px] flex items-center justify-center border border-dashed border-gray-200">
              <CalendarDays className="w-9 h-9 text-gray-200" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xl font-serif font-bold text-church-black">No events found</p>
              <p className="text-sm text-gray-400">
                {filter === 'upcoming'
                  ? 'No upcoming events scheduled yet.'
                  : filter === 'past'
                  ? 'No past events recorded.'
                  : 'No events recorded yet.'}
              </p>
            </div>
            {canManage && filter === 'upcoming' && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-6 py-3 bg-church-black text-white rounded-xl text-sm font-bold hover:bg-church-green-dark transition-all"
              >
                Schedule First Event
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {displayed.map((event, idx) => {
                const upcoming = isUpcoming(event.start_date);
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ delay: idx * 0.04 }}
                    className={`bg-white rounded-3xl border shadow-sm overflow-hidden ${
                      upcoming ? 'border-green-100' : 'border-gray-100 opacity-70'
                    }`}
                  >
                    <div className="flex items-stretch">
                      {/* Color bar */}
                      <div
                        className={`w-1.5 shrink-0 ${
                          !upcoming
                            ? 'bg-gray-200'
                            : event.event_level === 'Major event'
                            ? 'bg-gold-500'
                            : 'bg-church-black'
                        }`}
                      />

                      <div className="flex-1 p-6 md:p-8">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          <div className="space-y-2 flex-1">
                            {/* Level badge */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                                  event.event_level === 'Major event'
                                    ? 'bg-gold-50 text-gold-700 border border-gold-200'
                                    : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {event.event_level}
                              </span>
                              {event.event_type && (
                                <span className="px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-blue-50 text-blue-600 border border-blue-100">
                                  {event.event_type}
                                </span>
                              )}
                              {!upcoming && (
                                <span className="px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-gray-100 text-gray-400">
                                  Completed
                                </span>
                              )}
                            </div>

                            {/* Event name — large for readability */}
                            <h2 className="text-xl md:text-2xl font-serif font-bold text-church-black leading-tight">
                              {event.event_name}
                            </h2>

                            {/* Date — written out fully for elderly users */}
                            <div className="flex items-center gap-2 text-gray-500">
                              <Clock className="w-4 h-4 shrink-0 text-gray-300" />
                              <span className="text-sm font-semibold">
                                {formatLongDate(event.start_date)}
                                {event.end_date && event.end_date !== event.start_date && (
                                  <> &mdash; {formatLongDate(event.end_date)}</>
                                )}
                              </span>
                            </div>

                            {/* Notes */}
                            {event.notes && (
                              <p className="text-sm text-gray-500 leading-relaxed pt-1 max-w-xl">
                                {event.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Add Event Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal header */}
              <div className="p-6 md:p-8 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
                <div>
                  <h2 className="text-xl md:text-2xl font-serif font-bold text-church-black tracking-tight">
                    Add New Event
                  </h2>
                  <p className="text-xs text-gray-400 font-medium mt-1">Fill in the details below.</p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-all hover:rotate-90"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">

                  {/* Event Name */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                      <CalendarDays className="w-3.5 h-3.5" />
                      Event Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.event_name}
                      onChange={(e) => setFormData({ ...formData, event_name: e.target.value })}
                      placeholder="e.g. Parish Fiesta, Youth Retreat…"
                      className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-base font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all placeholder:text-gray-300"
                    />
                  </div>

                  {/* Event Level | Event Type */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em]">
                        Event Level
                      </label>
                      <div className="relative">
                        <select
                          value={formData.event_level}
                          onChange={(e) =>
                            setFormData({ ...formData, event_level: e.target.value as DiocesanEvent['event_level'] })
                          }
                          className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all appearance-none cursor-pointer"
                        >
                          <option value="Minor event">Minor Event</option>
                          <option value="Major event">Major Event</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em]">
                        Event Type
                      </label>
                      <div className="relative">
                        <select
                          value={formData.event_type}
                          onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                          className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all appearance-none cursor-pointer"
                        >
                          <option value="">— Select type —</option>
                          {EVENT_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* Start Date | End Date */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em]">
                        Start Date
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em]">
                        End Date <span className="text-gray-300 normal-case font-medium">(optional)</span>
                      </label>
                      <input
                        type="date"
                        value={formData.end_date}
                        min={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em]">
                      Notes <span className="text-gray-300 normal-case font-medium">(optional)</span>
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Additional details about this event…"
                      rows={3}
                      className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all resize-none placeholder:text-gray-300"
                    />
                  </div>

                  {submitError && (
                    <p className="flex items-center gap-2 text-sm font-semibold text-rose-500 bg-rose-50 rounded-xl px-4 py-3">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {submitError}
                    </p>
                  )}

                  {/* Buttons */}
                  <div className="pt-2 flex flex-col-reverse sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="w-full sm:flex-1 py-4 px-6 rounded-2xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full sm:flex-[2] py-4 px-6 bg-gold-500 text-church-green-dark rounded-2xl text-sm font-bold hover:bg-gold-600 transition-all shadow-xl shadow-gold-500/20 disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                      {isSubmitting ? (
                        <div className="w-5 h-5 border-2 border-church-green-dark/30 border-t-church-green-dark rounded-full animate-spin" />
                      ) : (
                        <>
                          <Check className="w-5 h-5" />
                          SAVE EVENT
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
