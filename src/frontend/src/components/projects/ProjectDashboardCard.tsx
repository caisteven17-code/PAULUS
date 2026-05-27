'use client';

import React from 'react';
import { ArrowUpRight, Building2, CalendarDays, Church, GraduationCap, School } from 'lucide-react';
import { Project } from '../../types';
import { motion } from 'motion/react';
import { formatCurrency } from '../../lib/format';

interface ProjectDashboardCardProps {
  project: Project;
  onClick: (project: Project) => void;
}

export function ProjectDashboardCard({ project, onClick }: ProjectDashboardCardProps) {
  const progress = project.targetAmount > 0 ? (project.currentAmount / project.targetAmount) * 100 : 0;
  const progressWidth = Math.min(progress, 100);
  const daysRemaining = Math.max(0, Math.ceil((new Date(project.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
  const statusLabel = project.status.replace('-', ' ');
  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'diocese': return <Building2 className="w-3 h-3" />;
      case 'parish': return <Church className="w-3 h-3" />;
      case 'seminary': return <GraduationCap className="w-3 h-3" />;
      case 'school': return <School className="w-3 h-3" />;
      default: return <Building2 className="w-3 h-3" />;
    }
  };

  return (
    <motion.div
      whileHover={{ y: -6, boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }}
      onClick={() => onClick(project)}
      className="bg-white rounded-[40px] border border-gray-100 p-8 shadow-sm hover:shadow-2xl hover:shadow-gold-500/10 transition-all duration-500 cursor-pointer group relative overflow-hidden h-full flex flex-col"
    >
      <div className="absolute top-0 right-0 w-48 h-48 bg-gold-500/5 rounded-full -mr-24 -mt-24 transition-transform duration-700 group-hover:scale-150 group-hover:bg-gold-500/10" />
      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none" />

      <div className="flex justify-between items-start mb-8 relative z-10 gap-4">
        <div className="flex-1 space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-md">
              {getEntityIcon(project.entityType)}
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider truncate max-w-[120px]">
                {project.entityId}
              </span>
            </div>
            <span className="text-[10px] font-bold text-gold-600 uppercase tracking-[0.3em] truncate">
              {project.category}
            </span>
          </div>
          <h3 className="text-2xl font-serif font-bold text-church-black group-hover:text-gold-600 transition-colors leading-[1.1] tracking-tight break-words">
            {project.name}
          </h3>
        </div>
        <div className="shrink-0 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-right shadow-sm transition-all duration-500 group-hover:scale-105">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">Status</p>
          <p className="mt-1 text-sm font-bold capitalize text-church-black">{statusLabel}</p>
        </div>
      </div>

      <div className="space-y-8 relative z-10 flex-1 flex flex-col justify-between">
        <div className="space-y-8">
          <div className="flex items-center justify-between gap-4">
            <div className="rounded-full bg-gray-100 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-gray-500">
              Record Summary
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
              Ends {new Date(project.endDate).toLocaleDateString()}
            </p>
          </div>

          <div>
            <div className="flex justify-between items-end mb-4 gap-2">
              <div className="space-y-1 min-w-0">
                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-[0.2em] block truncate">Raised To Date</span>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-3xl font-serif font-bold text-church-black leading-none">{formatCurrency(project.currentAmount)}</span>
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Recorded</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-2xl font-serif font-bold text-gold-600 leading-none">{Math.round(progress)}%</span>
              </div>
            </div>
            <div className="h-3 bg-gray-50 rounded-full overflow-hidden shadow-inner relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressWidth}%` }}
                transition={{ duration: 1.5, ease: 'circOut' }}
                className={`h-full rounded-full shadow-lg relative ${progress >= 100 ? 'bg-gradient-to-r from-green-400 to-green-600' : 'bg-gradient-to-r from-gold-400 to-gold-600'}`}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse" />
              </motion.div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100/50 group-hover:bg-white group-hover:shadow-md transition-all duration-500">
              <p className="text-[9px] text-gray-400 uppercase font-bold tracking-[0.2em] mb-2">Target Goal</p>
              <p className="text-base font-bold text-church-black">{formatCurrency(project.targetAmount)}</p>
            </div>
            <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100/50 group-hover:bg-white group-hover:shadow-md transition-all duration-500">
              <p className="text-[9px] text-gray-400 uppercase font-bold tracking-[0.2em] mb-2">Time Remaining</p>
              <p className="text-base font-bold text-church-black">{daysRemaining} Days</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100/50 group-hover:bg-white group-hover:shadow-md transition-all duration-500">
              <div className="mb-3 flex items-center gap-2 text-gold-600">
                <CalendarDays className="w-4 h-4" />
                <p className="text-[9px] text-gray-400 uppercase font-bold tracking-[0.2em]">Start Date</p>
              </div>
              <p className="text-base font-bold text-church-black">{new Date(project.startDate).toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-gray-100 flex items-center justify-between mt-auto">
          <div className="flex items-center gap-3 text-gray-400">
            <div className="w-8 h-8 rounded-xl bg-gold-500/10 flex items-center justify-center text-gold-600">
              {getEntityIcon(project.entityType)}
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] block leading-none">Managed By</span>
              <span className="text-[8px] font-bold text-gray-300 uppercase tracking-widest mt-1 block">{project.entityId}</span>
            </div>
          </div>
          <motion.div
            whileHover={{ scale: 1.1, x: 5 }}
            className="w-12 h-12 rounded-2xl bg-church-green-dark text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-xl shadow-church-green-dark/20"
          >
            <ArrowUpRight className="w-6 h-6" />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
