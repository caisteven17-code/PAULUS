'use client';

import React from 'react';
import { motion } from 'motion/react';

interface FinancialHealthGaugeProps {
  score: number;
  size?: number;
  description?: React.ReactNode;
  zoneName?: string;
  className?: string;
}

export const FinancialHealthGauge: React.FC<FinancialHealthGaugeProps> = ({ 
  score, 
  size = 320, 
  description,
  zoneName,
  className = ""
}) => {
  const clampedScore = Math.min(Math.max(score, 0), 100);
  const finalZoneName = zoneName || (clampedScore < 33 ? "Critical Zone" : clampedScore < 66 ? "Caution Zone" : "Optimal Zone");
  const strokeWidth = 20;
  const centerX = size / 2;
  const radius = (size * 0.7) / 2;
  const centerY = radius + 35; // Increased to give more space for top labels
  
  // Rule: Automatic Color Detection based on segments
  const getSeverityColor = (val: number) => {
    if (val <= 33) return "#EF4444"; // Red
    if (val <= 66) return "#FBBF24"; // Yellow
    return "#15803D"; // Dark Green (Emerald 700)
  };

  const currentColor = getSeverityColor(clampedScore);

  // Generate tick marks
  const ticks = [];
  for (let i = 0; i <= 5; i++) {
    const val = i * 20;
    const angle = (val * 1.8) - 180;
    const rad = (angle * Math.PI) / 180;
    
    const x1 = centerX + (radius + 12) * Math.cos(rad);
    const y1 = centerY + (radius + 12) * Math.sin(rad);
    const x2 = centerX + (radius + 18) * Math.cos(rad);
    const y2 = centerY + (radius + 18) * Math.sin(rad);
    
    const labelX = centerX + (radius + 32) * Math.cos(rad);
    const labelY = centerY + (radius + 32) * Math.sin(rad);
    
    ticks.push({ x1, y1, x2, y2, labelX, labelY, value: val });
  }

  return (
    <div className={`flex flex-col items-center text-center w-full max-w-[320px] mx-auto bg-white rounded-[48px] p-8 shadow-sm border border-slate-100 ${className}`}>
      {/* Element 1 (Top): The Gauge Arc */}
      <div className="relative overflow-visible mb-[48px]" style={{ width: size, height: centerY + 15 }}>
        <svg 
          width={size} 
          height={centerY + 15} 
          viewBox={`0 0 ${size} ${centerY + 15}`} 
          className="overflow-visible"
        >
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#EF4444" />
              <stop offset="50%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#15803D" />
            </linearGradient>
          </defs>

          {/* Ticks & Labels */}
          {ticks.map((tick, i) => (
            <g key={i}>
              <line 
                x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} 
                stroke="#CBD5E1" strokeWidth="1.5" 
                strokeLinecap="round"
              />
              <text 
                x={tick.labelX} y={tick.labelY} 
                textAnchor="middle" dominantBaseline="middle" 
                className="text-[10px] font-bold fill-slate-400 tabular-nums"
              >
                {tick.value}
              </text>
            </g>
          ))}

          {/* Background Track */}
          <path
            d={`M ${centerX - radius},${centerY} A ${radius},${radius} 0 0,1 ${centerX + radius},${centerY}`}
            fill="none"
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Speedometer arc with gradient */}
          <path
            d={`M ${centerX - radius},${centerY} A ${radius},${radius} 0 0,1 ${centerX + radius},${centerY}`}
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* The Needle: Anchored at center */}
          <g 
            style={{ 
              transform: `rotate(${(clampedScore * 1.8) - 180}deg)`,
              transformOrigin: `${centerX}px ${centerY}px`,
              transition: 'transform 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            <path
              d={`M ${centerX - 12},${centerY} L ${centerX},${centerY - 4} L ${centerX + radius - 10},${centerY - 1} L ${centerX + radius - 10},${centerY + 1} L ${centerX},${centerY + 4} Z`}
              fill="#1E293B"
              className="drop-shadow-md"
            />
            {/* Pivot Dot */}
            <circle cx={centerX} cy={centerY} r="8" fill="#1E293B" stroke="#FFFFFF" strokeWidth="2.5" />
            <circle cx={centerX} cy={centerY} r="3" fill="#94A3B8" />
          </g>
        </svg>
      </div>
      
      {/* Element 2 (Middle): The Score - 48px below pivot dot */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-[24px]"
      >
        <span 
          className="text-6xl font-black tracking-tighter leading-none m-0 p-0" 
          style={{ color: currentColor }}
        >
          {clampedScore}
        </span>
      </motion.div>

      {/* Element 3 (Bottom): The Pill Button - 24px below score */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        style={{ backgroundColor: currentColor }}
        className="flex items-center gap-2 px-6 py-2 rounded-full shadow-md mb-6"
      >
        <div className="w-2 h-2 rounded-full bg-[#4ADE80] shadow-sm"></div>
        <span className="text-xs font-bold text-white tracking-tight uppercase">
          {finalZoneName}
        </span>
      </motion.div>

      {/* Footer Description */}
      {description && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="max-w-[240px] text-slate-400 text-[10px] font-medium leading-relaxed"
        >
          {typeof description === 'string' ? (
            description.split(finalZoneName).map((part, i, arr) => (
              <React.Fragment key={i}>
                {part}
                {i < arr.length - 1 && <span style={{ color: currentColor, fontWeight: 'bold' }}>{finalZoneName}</span>}
              </React.Fragment>
            ))
          ) : (
            description
          )}
        </motion.div>
      )}
    </div>
  );
};
