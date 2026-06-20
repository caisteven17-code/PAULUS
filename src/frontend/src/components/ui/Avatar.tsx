'use client';

import React from 'react';
import { Cpu } from 'lucide-react';
import { getInitials } from '../../lib/initials';

// Shared avatar used across the whole system so every screen renders the same
// thing: the user's photo when set, otherwise their initials on a stable color
// (never a blank person icon). Pass the natural "First Last" name.
const AVATAR_COLORS = [
  '#1a472a',
  '#D4AF37',
  '#3B82F6',
  '#7C3AED',
  '#0EA5E9',
  '#F43F5E',
  '#14B8A6',
  '#FB923C',
  '#6366F1',
];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export interface AvatarProps {
  name?: string | null;
  /** Profile photo URL (avatar_url / photoURL). When absent, initials show. */
  photoUrl?: string | null;
  /** System actor (e.g. automated audit entries) renders a CPU glyph. */
  system?: boolean;
  /** Pixel size of the (square) avatar. Defaults to 36. */
  size?: number;
  className?: string;
}

export function Avatar({ name, photoUrl, system, size = 36, className = '' }: AvatarProps) {
  const dim = { width: size, height: size };
  const base = `rounded-full flex items-center justify-center shrink-0 overflow-hidden ${className}`;

  if (system) {
    return (
      <div className={`${base} bg-gray-200`} style={dim}>
        <Cpu style={{ width: size * 0.45, height: size * 0.45 }} className="text-gray-500" />
      </div>
    );
  }

  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name ?? 'avatar'} className={`${base} object-cover`} style={dim} />;
  }

  const display = String(name ?? '').trim();
  return (
    <div
      className={`${base} text-white font-black`}
      style={{ ...dim, backgroundColor: colorFor(display || '?'), fontSize: Math.max(10, Math.round(size * 0.34)) }}
    >
      {getInitials(display)}
    </div>
  );
}
