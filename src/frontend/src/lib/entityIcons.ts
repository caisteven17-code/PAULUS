import { Church, GraduationCap, School } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Single source of truth for institution-type icons so a parish, seminary, or
// school is represented by the SAME glyph everywhere (home snapshot, entity
// management, archives, etc.) instead of a different icon per screen.
export const ENTITY_TYPE_ICON: Record<'parish' | 'seminary' | 'school', LucideIcon> = {
  parish: Church,
  seminary: GraduationCap,
  school: School,
};
