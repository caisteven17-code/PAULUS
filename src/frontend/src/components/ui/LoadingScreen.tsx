'use client';

import React from 'react';
import { motion } from 'motion/react';
import { APP_CONFIG } from '../../constants';

/**
 * Branded full-screen loader — the Diocese crest gently bounces with a small
 * gold dot indicator beneath it, replacing the old rotating spinner.
 */
export function LoadingScreen({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-7 bg-[#0c0c0c]">
      <div className="relative flex flex-col items-center">
        <motion.img
          src={APP_CONFIG.logoPath}
          alt="Diocese of San Pablo"
          className="h-24 w-24 object-contain drop-shadow-[0_10px_28px_rgba(212,175,55,0.28)]"
          animate={{ y: [0, -18, 0] }}
          transition={{ duration: 0.95, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Shadow that squashes as the logo lands */}
        <motion.span
          className="mt-2 block h-1.5 rounded-full bg-black/60 blur-[2px]"
          animate={{ width: [44, 24, 44], opacity: [0.5, 0.25, 0.5] }}
          transition={{ duration: 0.95, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-gold-400"
            animate={{ opacity: [0.2, 1, 0.2], scale: [0.85, 1.1, 0.85] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.16, ease: 'easeInOut' }}
          />
        ))}
      </div>

      <p className="text-[11px] font-black uppercase tracking-[0.32em] text-white/30">{label}</p>
    </div>
  );
}

/**
 * Plays once when the splash finishes: the crest zooms in over a black screen,
 * which then fades out to reveal the page beneath. Render it on top of the app.
 */
export function SplashTransition({ onDone }: { onDone: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 1, 0] }}
      transition={{ duration: 1.15, times: [0, 0.5, 1], ease: 'easeInOut' }}
      onAnimationComplete={onDone}
      className="pointer-events-none fixed inset-0 z-[300] flex items-center justify-center bg-[#0c0c0c]"
    >
      <motion.img
        src={APP_CONFIG.logoPath}
        alt=""
        className="h-24 w-24 object-contain drop-shadow-[0_10px_30px_rgba(212,175,55,0.3)]"
        initial={{ scale: 0.9, opacity: 0.9 }}
        animate={{ scale: [0.9, 2.6], opacity: [0.9, 1, 0] }}
        transition={{ duration: 1.15, times: [0, 0.5, 1], ease: 'easeInOut' }}
      />
    </motion.div>
  );
}

/**
 * Login reveal — starts as opaque black with the crest (continuing the fade-in
 * the Login screen began) and fades out to reveal the dashboard beneath.
 */
export function BlackReveal({ onDone }: { onDone: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.85, delay: 0.25, ease: 'easeInOut' }}
      onAnimationComplete={onDone}
      className="pointer-events-none fixed inset-0 z-[300] flex items-center justify-center bg-black"
    >
      <motion.img
        src={APP_CONFIG.logoPath}
        alt=""
        className="h-24 w-24 object-contain drop-shadow-[0_10px_30px_rgba(212,175,55,0.3)]"
        initial={{ opacity: 1, scale: 1 }}
        animate={{ opacity: 0, scale: 1.06 }}
        transition={{ duration: 0.85, delay: 0.25, ease: 'easeInOut' }}
      />
    </motion.div>
  );
}

/**
 * In-content branded loader — the same bouncing crest, sized for cards and
 * panels (light background). Use this anywhere a page is fetching data.
 */
export function InlineLoader({ label = 'Loading', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-16 ${className}`}>
      <div className="flex flex-col items-center">
        <motion.img
          src={APP_CONFIG.logoPath}
          alt="Diocese of San Pablo"
          className="h-12 w-12 object-contain"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.span
          className="mt-1.5 block h-1 rounded-full bg-slate-300 blur-[1px]"
          animate={{ width: [26, 14, 26], opacity: [0.6, 0.3, 0.6] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-gold-500"
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.16 }}
          />
        ))}
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{label}</p>
    </div>
  );
}
