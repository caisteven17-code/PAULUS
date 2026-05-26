'use client';

import React, { useState } from 'react';
import { 
  Church, GraduationCap, BookOpen, Map as MapIcon, Target, ChevronLeft, ChevronRight,
  Activity, TrendingUp, TrendingDown, ArrowRight, PieChart as PieChartIcon, Bell, AlertCircle, CheckCircle, Sparkles, ShieldCheck, Upload
} from 'lucide-react';
import { motion } from 'motion/react';
import { SubmissionTracker } from '../components/projects/SubmissionTracker';
import { ClassificationManagement, ClassificationRecord } from '../components/ui/ClassificationManagement';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip 
} from 'recharts';
import type { Role } from '../App';

interface HomeProps {
  onNavigate: (page: string) => void;
  role?: Role;
}

const mockAnnouncements = [
  {
    id: '1',
    title: 'Financial Reporting Deadline Extended',
    description: 'The monthly financial submission deadline for April has been extended to April 20th. Please ensure all documents are submitted through the portal.',
    type: 'info',
    date: new Date('2026-04-18'),
    priority: 'high'
  },
  {
    id: '2',
    title: 'Diocesan Assembly Scheduled for May',
    description: 'Annual diocesan assembly will be held on May 5th at the Cathedral. All parish leaders, seminary rectors, and school principals are invited to attend.',
    type: 'event',
    date: new Date('2026-04-17'),
    priority: 'medium'
  },
  {
    id: '3',
    title: 'New Parish Classification Guidelines Released',
    description: 'Updated parish classification guidelines for 2026 are now available in the Settings section. Review the new criteria for Class A-E designations.',
    type: 'update',
    date: new Date('2026-04-16'),
    priority: 'medium'
  },
  {
    id: '4',
    title: 'Training Session: Financial Management Best Practices',
    description: 'Join us for a webinar on May 2nd at 2:00 PM on financial management best practices for parishes. Registration is open at the diocesan office.',
    type: 'event',
    date: new Date('2026-04-15'),
    priority: 'medium'
  },
  {
    id: '5',
    title: 'Special Collection: Building Fund Campaign',
    description: 'The Diocese launches the 2026 Building Fund Campaign. Donations support renovation and maintenance of our diocesan facilities.',
    type: 'info',
    date: new Date('2026-04-14'),
    priority: 'medium'
  },
  {
    id: '6',
    title: 'Pastoral Letter: Year of Faith Initiative',
    description: 'Bishop releases pastoral letter launching the "Year of Faith" initiative. All parishes are encouraged to organize faith-building activities.',
    type: 'update',
    date: new Date('2026-04-13'),
    priority: 'medium'
  },
  {
    id: '7',
    title: 'Easter Celebration Schedule Released',
    description: 'Official schedule for Easter celebrations at the Cathedral and diocesan parishes has been published. Please coordinate with your parishioners.',
    type: 'event',
    date: new Date('2026-04-12'),
    priority: 'medium'
  },
  {
    id: '8',
    title: 'New Financial Accountability Standards',
    description: 'Effective May 1st, all parishes must implement new financial accountability standards. Training materials are available in the Settings portal.',
    type: 'update',
    date: new Date('2026-04-10'),
    priority: 'high'
  },
  {
    id: '9',
    title: 'Bishop Appointments for Diocesan Roles',
    description: 'Bishop announces new appointments for Diocesan Vicar for Education and Vicar for Finance. Details available on the diocesan website.',
    type: 'info',
    date: new Date('2026-04-09'),
    priority: 'medium'
  },
  {
    id: '10',
    title: 'Maintenance Alert: System Updates Scheduled',
    description: 'The Financial Analytics System will undergo maintenance on April 25th from 10 PM to 2 AM. No access during this period.',
    type: 'update',
    date: new Date('2026-04-08'),
    priority: 'medium'
  }
];

const institutionStats = [
  {
    title: 'Parishes',
    value: '86',
    icon: Church,
    color: 'gold'
  },
  {
    title: 'Seminaries',
    value: '5',
    icon: BookOpen,
    color: 'emerald'
  },
  {
    title: 'Diocesan Schools',
    value: '7',
    icon: GraduationCap,
    color: 'purple'
  }
];

const financialMetrics = [
  {
    label: 'Monthly Total Collections',
    value: '₱12,458,920.00',
    trend: '+12.5%',
    trendDir: 'up',
    icon: Activity
  },
  {
    label: 'Consumable Collections',
    value: '₱8,245,150.00',
    trend: '+8.1%',
    trendDir: 'up'
  },
  {
    label: 'Monthly Disbursements',
    value: '₱10,124,772.00',
    trend: '+5.2%',
    trendDir: 'down'
  }
];

const contributionData = [
  { name: 'Parishes', value: 65, color: '#D4AF37', page: 'parish', desc: 'Primary spiritual and community hubs' },
  { name: 'Seminaries', value: 15, color: '#1a472a', page: 'seminaries', desc: 'Clergy formation and vocations' },
  { name: 'Schools', value: 20, color: '#1a472a', page: 'school', desc: 'Educational mission and youth formation' },
];

export function Home({ onNavigate, role = 'bishop' }: HomeProps) {
  return (
    <div className="flex flex-col min-h-[calc(100vh-80px)] bg-[#FDFCFB]">
      {/* Hero Section - Restored based on user image */}
      <div className="relative w-full h-[300px] md:h-[450px] lg:h-[600px] overflow-hidden bg-gray-400">
        {/* Background Image Carousel */}
        <div className="absolute inset-0">
          <img 
            src="https://images.unsplash.com/photo-1438032005730-c779502df39b?q=80&w=2000&auto=format&fit=crop" 
            alt="Diocese of San Pablo"
            className="w-full h-full object-cover opacity-60"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-black/30" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-4 py-6 md:py-12">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-3xl sm:text-5xl md:text-7xl lg:text-8xl font-serif font-bold text-white mb-3 md:mb-6 tracking-tight drop-shadow-2xl leading-tight"
          >
            Diocese of San Pablo
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-xs sm:text-base md:text-lg lg:text-2xl text-white/90 max-w-2xl md:max-w-3xl mb-4 md:mb-8 font-light leading-relaxed drop-shadow-lg"
          >
            Guiding the faithful, nurturing vocations, and educating the youth in the heart of Laguna.
          </motion.p>
          
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => document.getElementById('dashboard-section')?.scrollIntoView({ behavior: 'smooth' })}
            className="bg-gold-500 hover:bg-gold-600 text-black font-bold py-2.5 md:py-3 px-6 md:px-10 rounded-full flex items-center gap-2 md:gap-3 shadow-lg hover:shadow-xl transition-all duration-300 text-sm md:text-base"
          >
            <Target className="w-4 md:w-5 h-4 md:h-5" />
            Launch Dashboard
          </motion.button>
        </div>

        {/* Carousel Controls */}
        <button className="absolute left-8 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-black/10 hover:bg-black/30 text-white flex items-center justify-center transition-all backdrop-blur-md border border-white/10">
          <ChevronLeft className="w-8 h-8" />
        </button>
        <button className="absolute right-8 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-black/10 hover:bg-black/30 text-white flex items-center justify-center transition-all backdrop-blur-md border border-white/10">
          <ChevronRight className="w-8 h-8" />
        </button>

        {/* Pagination Dots */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-4">
          <div className="w-2.5 h-2.5 rounded-full bg-white/30" />
          <div className="w-10 h-2.5 rounded-full bg-white shadow-lg" />
          <div className="w-2.5 h-2.5 rounded-full bg-white/30" />
        </div>
      </div>

      {/* Main Content Section */}
      <div id="dashboard-section" className="w-full bg-white py-16 border-b border-gray-100 relative z-40">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8">

          {/* Recent Announcements — shown first */}
          <div className="mb-0">
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <div className="inline-flex items-center gap-3 px-6 py-2.5 bg-gray-900 text-white rounded-full text-[10px] font-black uppercase tracking-[0.3em] shadow-xl">
                    <Bell className="w-4 h-4 text-[#d4af37]" />
                    Announcements
                  </div>
                  <div className="mt-6 space-y-2">
                    <h2 className="text-4xl md:text-5xl font-serif font-bold text-gray-900 leading-[1.1]">
                      Latest <span className="text-[#d4af37] italic">Updates</span>
                    </h2>
                    <p className="text-lg text-gray-500 leading-relaxed font-light max-w-2xl">
                      Stay informed with the latest announcements from the diocese.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onNavigate('announcements')}
                  className="hidden md:flex items-center gap-2 px-6 py-3 bg-[#d4af37] text-gray-900 font-bold rounded-xl hover:bg-[#c49d1f] transition-colors"
                >
                  View All
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {mockAnnouncements.map((announcement, index) => (
                  <motion.div
                    key={announcement.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className={`p-6 rounded-2xl border transition-all duration-500 ${
                      announcement.priority === 'high'
                        ? 'bg-red-50 border-red-100 hover:shadow-lg'
                        : 'bg-white border-gray-50 hover:shadow-lg hover:border-[#d4af37]/20'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${
                        announcement.priority === 'high'
                          ? 'bg-red-100 text-red-600'
                          : 'bg-blue-100 text-blue-600'
                      }`}>
                        {announcement.priority === 'high' ? (
                          <AlertCircle className="w-5 h-5" />
                        ) : (
                          <CheckCircle className="w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 mb-2 line-clamp-2">{announcement.title}</h3>
                        <p className="text-sm text-gray-600 mb-3 line-clamp-3">{announcement.description}</p>
                        <p className="text-xs text-gray-400 font-medium">
                          {new Date(announcement.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <button
                onClick={() => onNavigate('announcements')}
                className="md:hidden w-full py-3 px-6 bg-[#d4af37] text-gray-900 font-bold rounded-xl hover:bg-[#c49d1f] transition-colors"
              >
                View All Announcements
              </button>
            </div>
          </div>

          {/* Diocesan Institutions Section */}
          <div className="mt-24 pt-20 border-t border-gray-100">
            <div className="flex items-center justify-between mb-10">
              <h3 className="text-2xl font-serif font-bold text-gray-900">Diocesan Institutions</h3>
              <div className="h-px flex-1 bg-gray-100 mx-8" />
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Institutional Snapshot</div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {institutionStats.map((card, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => {
                    if (card.title === 'Parishes') onNavigate('parish-dashboard');
                    else if (card.title === 'Seminaries') onNavigate('seminaries');
                    else if (card.title === 'Diocesan Schools') onNavigate('school');
                  }}
                  className={`bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-2xl transition-all duration-500 group text-center flex flex-col items-center cursor-pointer`}
                >
                  <div className={`w-12 md:w-14 h-12 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center mb-4 md:mb-6 transition-transform group-hover:scale-110 duration-500 ${
                    card.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                    card.color === 'blue' ? 'bg-blue-50 text-blue-600' :
                    card.color === 'gold' ? 'bg-gold-50 text-gold-600' :
                    card.color === 'amber' ? 'bg-amber-50 text-amber-600' :
                    'bg-purple-50 text-purple-600'
                  }`}>
                    <card.icon className="w-6 md:w-7 h-6 md:h-7" />
                  </div>
                  
                  <div className="text-3xl md:text-5xl font-serif font-bold text-gray-900 mb-2">{card.value}</div>
                  <div className="text-sm md:text-base font-bold text-gray-900 uppercase tracking-widest">{card.title}</div>
                  <div className="w-6 md:w-8 h-1 bg-gold-500/20 mt-3 md:mt-4 rounded-full group-hover:w-12 md:group-hover:w-16 transition-all duration-500" />
                </motion.div>
              ))}
            </div>
          </div>

          {/* Financial Stewardship Section - Restored */}
          <div className="mt-12 md:mt-16 lg:mt-20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 md:mb-10 gap-3 sm:gap-4">
              <h3 className="text-xl sm:text-2xl md:text-3xl font-serif font-bold text-gray-900">Financial Stewardship</h3>
              <div className="hidden sm:block h-px flex-1 bg-gray-100 mx-4 md:mx-8" />
              <div className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] md:tracking-[0.3em] whitespace-nowrap">Consolidated Funds</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 lg:gap-8">{financialMetrics.map((metric, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl shadow-base hover:shadow-xl transition-all duration-500 border border-gray-50 flex flex-col"
                >
                  <div className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 md:mb-4 leading-tight">
                    {metric.label}
                  </div>
                  <div className="text-2xl sm:text-3xl md:text-4xl lg:text-4xl font-black text-gray-900 mb-4 md:mb-6 tracking-tight break-words">
                    {metric.value}
                  </div>
                  <div className="flex items-center justify-between mt-auto flex-wrap gap-2">
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className={`flex items-center gap-1 px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-[10px] md:text-[11px] font-bold whitespace-nowrap ${
                        metric.trendDir === 'up' 
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-100/50' 
                          : 'bg-rose-50 text-rose-600 border border-rose-100/50'
                      }`}>
                        {metric.trendDir === 'up' ? <TrendingUp className="w-3.5 md:w-4 h-3.5 md:h-4" /> : <TrendingDown className="w-3.5 md:w-4 h-3.5 md:h-4" />}
                        {metric.trend}
                      </div>
                      <span className="text-[9px] md:text-[10px] font-black text-gray-300 uppercase tracking-widest">VS LY</span>
                    </div>
                    {metric.icon && (
                      <div className="w-10 md:w-12 h-10 md:h-12 bg-gray-50 rounded-xl md:rounded-2xl flex items-center justify-center text-gray-400 border border-gray-100 shrink-0">
                        <metric.icon className="w-5 md:w-6 h-5 md:h-6" />
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {role === 'admin' && (
            <div className="mt-24 pt-20 border-t border-gray-100">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_360px] gap-8 items-stretch">
                <div className="rounded-[2rem] bg-gradient-to-br from-[#1f1f1f] via-[#2c2c2c] to-[#111111] p-8 md:p-10 text-white shadow-2xl">
                  <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-[0.3em] border border-white/10">
                    <Sparkles className="w-4 h-4 text-[#d4af37]" />
                    Admin Sandbox
                  </div>
                  <div className="mt-6 space-y-4">
                    <h2 className="text-4xl md:text-5xl font-serif font-bold leading-[1.1]">
                      Digital Twin <span className="text-[#d4af37] italic">Simulation</span>
                    </h2>
                    <p className="text-lg text-white/70 leading-relaxed max-w-2xl">
                      Launch a temporary what-if environment for parishes, seminaries, or schools. Test projected collections, remittances, expenses, budget allocation, and file-based previews without affecting official analytics.
                    </p>
                  </div>
                  <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-[1.5rem] bg-white/5 border border-white/10 p-5">
                      <ShieldCheck className="w-5 h-5 text-[#d4af37]" />
                      <p className="mt-3 text-sm font-bold">Protected Sandbox</p>
                      <p className="mt-2 text-sm text-white/60">No database write-back unless formally submitted and approved.</p>
                    </div>
                    <div className="rounded-[1.5rem] bg-white/5 border border-white/10 p-5">
                      <Activity className="w-5 h-5 text-[#d4af37]" />
                      <p className="mt-3 text-sm font-bold">Scenario Controls</p>
                      <p className="mt-2 text-sm text-white/60">Adjust collections, disbursements, remittances, expenses, and budgets.</p>
                    </div>
                    <div className="rounded-[1.5rem] bg-white/5 border border-white/10 p-5">
                      <Upload className="w-5 h-5 text-[#d4af37]" />
                      <p className="mt-3 text-sm font-bold">Temporary File Preview</p>
                      <p className="mt-2 text-sm text-white/60">Upload a report for simulation-only impact review.</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[2rem] bg-[#faf8f4] border border-[#e8dfcf] p-8 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Simulation Flow</div>
                    <div className="mt-4 space-y-4">
                      <div className="rounded-2xl bg-white border border-gray-100 p-4">
                        <p className="text-sm font-bold text-gray-900">1. Select institution type</p>
                        <p className="mt-1 text-sm text-gray-500">Parish, Seminary, or School</p>
                      </div>
                      <div className="rounded-2xl bg-white border border-gray-100 p-4">
                        <p className="text-sm font-bold text-gray-900">2. Launch sandbox dashboard</p>
                        <p className="mt-1 text-sm text-gray-500">Review current standing, analytics, trends, and risk indicators</p>
                      </div>
                      <div className="rounded-2xl bg-white border border-gray-100 p-4">
                        <p className="text-sm font-bold text-gray-900">3. Compare outcomes</p>
                        <p className="mt-1 text-sm text-gray-500">Save or reload sandbox instances for internal planning</p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onNavigate('digital-twin')}
                    className="mt-8 w-full py-4 px-6 bg-[#d4af37] text-gray-900 font-bold rounded-2xl hover:bg-[#c49d1f] transition-colors flex items-center justify-center gap-3"
                  >
                    Open Digital Twin
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Contribution Breakdown Section - Restored */}
          <div className="mt-24 pt-20 border-t border-gray-100">
            <div className="flex flex-col lg:flex-row items-center gap-16">
              <div className="flex-1 space-y-8">
                <div className="inline-flex items-center gap-3 px-6 py-2.5 bg-gray-900 text-white rounded-full text-[10px] font-black uppercase tracking-[0.3em] shadow-xl">
                  <PieChartIcon className="w-4 h-4 text-[#d4af37]" />
                  Diocesan Contribution Mix
                </div>
                
                <div className="space-y-4">
                    <h2 className="text-4xl md:text-5xl font-serif font-bold text-gray-900 leading-[1.1]">
                      Resource & Impact <br />
                      <span className="text-[#d4af37] italic">Distribution</span>
                    </h2>
                  <p className="text-lg text-gray-500 leading-relaxed font-light max-w-xl">
                    Our mission is fueled by the collective efforts of our parishes, seminaries, and schools. This breakdown reflects the strategic allocation of resources across our diocesan pillars.
                  </p>
                </div>
                
                <div className="space-y-4">
                  {contributionData.map((item, index) => (
                    <motion.button
                      key={index}
                      onClick={() => {
                        onNavigate(item.page);
                      }}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 }}
                      className={`w-full group flex items-center justify-between p-6 bg-gray-50 hover:bg-white hover:shadow-2xl rounded-[2rem] border border-transparent hover:border-[#d4af37]/20 transition-all duration-500 text-left`}
                    >
                      <div className="flex items-center gap-6">
                        <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
                        <div>
                          <div className="text-lg font-bold text-gray-900">{item.name}</div>
                          <div className="text-xs text-gray-400 font-medium tracking-wide">{item.desc}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-2xl font-serif font-bold text-gray-900">{item.value}%</div>
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:bg-[#d4af37] group-hover:text-white transition-all duration-500">
                          <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              <div className="flex-1 w-full h-[500px] relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={contributionData}
                          cx="50%"
                          cy="50%"
                          innerRadius={130}
                          outerRadius={190}
                          paddingAngle={10}
                          dataKey="value"
                          stroke="none"
                          onClick={(data: any) => onNavigate(data.page)}
                          className="cursor-pointer outline-none"
                        >
                          {contributionData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.color}
                              className="hover:opacity-80 transition-opacity duration-500"
                            />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '24px', 
                            border: 'none', 
                            boxShadow: '0 25px 50px rgba(0,0,0,0.12)',
                            padding: '16px 24px',
                            fontFamily: 'serif'
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="absolute flex flex-col items-center text-center pointer-events-none">
                    <div className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] mb-2">Total Impact</div>
                    <div className="text-6xl font-serif font-bold text-gray-900">100%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Submission Tracking & Classification Management Section */}
          <div className="mt-24 pt-20 border-t border-gray-100">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-3 px-6 py-2.5 bg-gray-900 text-white rounded-full text-[10px] font-black uppercase tracking-[0.3em] shadow-xl">
                <Activity className="w-4 h-4 text-[#d4af37]" />
                Operations & Governance
              </div>

              <div className="space-y-4 mb-12">
                <h2 className="text-4xl md:text-5xl font-serif font-bold text-gray-900 leading-[1.1]">
                  Submission & Classification <br />
                  <span className="text-[#d4af37] italic">Oversight</span>
                </h2>
                <p className="text-lg text-gray-500 leading-relaxed font-light max-w-2xl">
                  Monitor diocesan-wide submission status and manage entity classifications. Ensure accountability and track financial reporting compliance across all parishes, seminaries, and schools.
                </p>
              </div>

              {/* Submission Tracking */}
              <div className="bg-white rounded-[2rem] shadow-xl p-8 border border-gray-50">
                <SubmissionTracker
                  submissions={[
                    { id: '1', entityName: "St. Matthew's Parish", entityType: 'parish' as const, district: 'District 1', vicariate: 'Holy Family', lastSubmissionDate: new Date('2024-04-15'), status: 'on-time' as const, monthsLate: 0, budgetSet: true, budgetAmount: 600000 },
                    { id: '2', entityName: "San Roque Parish", entityType: 'parish' as const, district: 'District 2', vicariate: 'San Pedro Apostol', lastSubmissionDate: new Date('2024-03-20'), status: 'warning' as const, monthsLate: 1, budgetSet: false },
                    { id: '3', entityName: "Our Lady of Peace", entityType: 'parish' as const, district: 'District 1', vicariate: 'Sta. Rosa De Lima', lastSubmissionDate: new Date('2024-01-10'), status: 'action-required' as const, monthsLate: 4, budgetSet: true, budgetAmount: 800000 },
                    { id: '4', entityName: "St. John Seminary", entityType: 'seminary' as const, district: 'District 3', vicariate: 'Holy Family', lastSubmissionDate: new Date('2024-04-10'), status: 'on-time' as const, monthsLate: 0, budgetSet: true, budgetAmount: 2000000 },
                    { id: '5', entityName: "Sacred Heart School", entityType: 'school' as const, district: 'District 2', vicariate: 'San Isidro Labrador', lastSubmissionDate: undefined, status: 'not-submitted' as const, monthsLate: 0, budgetSet: false },
                  ]}
                  onViewDetails={(submission) => {}}
                  onExportReport={() => {}}
                />
              </div>

              {/* Classification Management */}
              <div className="bg-white rounded-[2rem] shadow-xl p-8 border border-gray-50">
                <ClassificationManagement
                  classifications={[
                    { id: '1', entityName: "St. Matthew's Parish", currentClass: 'Class B', annualIncome: 1800000, isSubsidized: false, subsidyLocked: false, lastReviewed: '2024-03-15', recommendedAction: 'none' },
                    { id: '2', entityName: "San Roque Parish", currentClass: 'Class D', annualIncome: 450000, isSubsidized: true, subsidyLocked: true, lastReviewed: '2024-02-20', recommendedAction: 'none' },
                    { id: '3', entityName: "Our Lady of Peace", currentClass: 'Class D', annualIncome: 680000, isSubsidized: true, subsidyLocked: false, lastReviewed: '2024-01-10', recommendedAction: 'reclassify' },
                    { id: '4', entityName: "St. John Seminary", currentClass: 'Class A', annualIncome: 2800000, isSubsidized: false, subsidyLocked: false, lastReviewed: '2024-03-20', recommendedAction: 'none' },
                    { id: '5', entityName: "Sacred Heart School", currentClass: 'Class C', annualIncome: 920000, isSubsidized: false, subsidyLocked: false, lastReviewed: '2024-02-15', recommendedAction: 'none' },
                  ]}
                  onUpdateClassification={(id, updates) => {}}
                  onToggleLock={(id, locked) => {}}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
