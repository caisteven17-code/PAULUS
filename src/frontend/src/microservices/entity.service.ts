/**
 * Entity Service — microservice responsible for exposing the master list of
 * diocesan entities (parishes, schools, seminaries).
 *
 * Owns: entity catalogue; reads from the shared constants.
 */

import type { Parish, DiocesanSchool, Seminary } from '../types';
import { ALL_PARISHES, INITIAL_SEMINARIES, INITIAL_SCHOOLS } from '../constants';

export const entityService = {
  getParishes(): Parish[] {
    return ALL_PARISHES as Parish[];
  },

  getSchools(): DiocesanSchool[] {
    return INITIAL_SCHOOLS as DiocesanSchool[];
  },

  getSeminaries(): Seminary[] {
    return INITIAL_SEMINARIES as Seminary[];
  },

  getAll(): { parishes: Parish[]; schools: DiocesanSchool[]; seminaries: Seminary[] } {
    return {
      parishes: this.getParishes(),
      schools: this.getSchools(),
      seminaries: this.getSeminaries(),
    };
  },
};
