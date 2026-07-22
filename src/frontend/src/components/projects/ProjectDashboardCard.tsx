'use client';

import React from 'react';
import { ArrowUpRight, Building2, CalendarDays, Church, Clock3, GraduationCap, School, Target } from 'lucide-react';
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
  const entityLabel = project.entityName ?? project.entityId;
  const daysRemaining = Math.max(
    0,
    Math.ceil((new Date(project.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
  );
  const statusLabel = project.status.replace('-', ' ');
  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'diocese':
        return <Building2 className="w-3 h-3" />;
      case 'parish':
        return <Church className="w-3 h-3" />;
      case 'seminary':
        return <GraduationCap className="w-3 h-3" />;
      case 'school':
        return <School className="w-3 h-3" />;
      default:
        return <Building2 className="w-3 h-3" />;
    }
  };

  return (
    <motion.button
      type="button"
      whileHover={{ y: -5 }}
      onClick={() => onClick(project)}
      className="group relative flex h-full min-h-[420px] w-full cursor-pointer flex-col overflow-hidden rounded-[30px] border border-slate-200 bg-white text-left shadow-sm transition-all duration-500 hover:border-gold-400/60 hover:shadow-2xl hover:shadow-slate-200/70"
    >
      <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-gold-400 via-gold-500 to-slate-950" />
      <div className="absolute right-[-74px] top-[-74px] h-40 w-40 rounded-full bg-gold-400/10 transition-transform duration-700 group-hover:scale-125" />

      <div className="relative z-10 flex flex-1 flex-col p-6">
        <div className="mb-6 flex items-start justify-between gap-4 pr-9">
          <div className="min-w-0">
            <div className="mb-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-500">
              {getEntityIcon(project.entityType)}
              <span className="truncate text-[9px] font-black uppercase tracking-[0.14em]">{entityLabel}</span>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gold-600">{project.category}</p>
            <h3 className="mt-2 break-words font-serif text-2xl font-bold leading-[1.08] text-slate-950 transition-colors group-hover:text-gold-700">
              {project.name}
            </h3>
          </div>
          <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 shadow-sm">
            {statusLabel}
          </span>
        </div>

        <div className="mb-6 grid grid-cols-[110px_minmax(0,1fr)] gap-4">
          <div className="flex aspect-square flex-col items-center justify-center rounded-full border border-gold-400/40 bg-[#fbfaf6]">
            <span className="font-serif text-4xl font-bold leading-none text-slate-950">{Math.round(progress)}%</span>
            <span className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Funded</span>
          </div>
          <div className="flex min-w-0 flex-col justify-center">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Raised To Date</p>
            <p className="mt-1 truncate font-serif text-3xl font-bold leading-none text-slate-950">
              {formatCurrency(project.currentAmount)}
            </p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100 shadow-inner">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressWidth}%` }}
                transition={{ duration: 1.2, ease: 'circOut' }}
                className={`h-full rounded-full ${progress >= 100 ? 'bg-green-500' : 'bg-gradient-to-r from-gold-400 to-gold-600'}`}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-gold-600">
              <Target className="h-4 w-4" />
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Goal</p>
            </div>
            <p className="truncate text-sm font-black text-slate-950">{formatCurrency(project.targetAmount)}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-gold-600">
              <Clock3 className="h-4 w-4" />
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Left</p>
            </div>
            <p className="text-sm font-black text-slate-950">{daysRemaining} days</p>
          </div>
        </div>

        <div className="mt-auto pt-6">
          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-slate-400">
                <CalendarDays className="h-4 w-4" />
                <span className="text-[9px] font-black uppercase tracking-[0.18em]">Timeline</span>
              </div>
              <p className="truncate text-xs font-bold text-slate-500">
                {new Date(project.startDate).toLocaleDateString()} to {new Date(project.endDate).toLocaleDateString()}
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-lg shadow-slate-900/15 transition-all group-hover:bg-gold-500 group-hover:text-black">
              <ArrowUpRight className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>
    </motion.button>
  );
}
