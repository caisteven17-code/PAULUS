'use client';

import React from 'react';
import { Cpu } from 'lucide-react';
import { getInitials } from '../../lib/initials';

// Shared avatar used across the whole system: the user's photo when set,
// otherwise initials on the PAULUS black/gold identity treatment.

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
      className={`${base} bg-black text-gold-400 font-black ring-1 ring-gold-500/35`}
      style={{ ...dim, fontSize: Math.max(10, Math.round(size * 0.34)) }}
    >
      {getInitials(display)}
    </div>
  );
}
