// Pure normalization helpers extracted from entity.service.ts — no dependency
// on SupabaseService or any other injected state. Kept as plain functions
// (not class methods) so entity.service.ts stays focused on I/O.

export function clusterFromVicariate(vicariate: any): 1 | 2 | 3 {
  const value = String(vicariate ?? '').toLowerCase();
  if (value.includes('holy family') || value.includes('san isidro')) return 2;
  if (value.includes('san pedro') || value.includes('sta. rosa')) return 3;
  return 1;
}

export function normalizeEntityResponse(entity: any): any {
  if (!entity) return entity;
  const normalized: any = { ...entity };

  // Normalize institution_id to id if present
  if (entity.institution_id && !entity.id) {
    normalized.id = entity.institution_id;
  }

  // Normalize snake_case to camelCase for subsidy_type
  if (entity.subsidy_type) {
    normalized.subsidyType = entity.subsidy_type;
  }

  if (entity.institution_code !== undefined) {
    normalized.institutionCode = entity.institution_code ?? '';
    normalized.iafrSourceCode = entity.institution_code ?? '';
    normalized.iafr_source_code = entity.institution_code ?? '';
  } else if (entity.institutionCode !== undefined) {
    normalized.institution_code = entity.institutionCode ?? '';
    normalized.iafrSourceCode = entity.institutionCode ?? '';
    normalized.iafr_source_code = entity.institutionCode ?? '';
  }

  return normalized;
}

export function normalizeSchoolData(school: any): any {
  let normalized = school;

  // If school has vicariate instead of cluster (pre-migration data), convert it
  if (school.vicariate && !school.cluster) {
    // Map vicariate names to clusters
    const vicariateToCluster: Record<string, number> = {
      'San Pablo': 1,
      'Holy Family': 2,
      'San Isidro Labrador': 3,
    };
    normalized = {
      ...school,
      cluster: vicariateToCluster[school.vicariate] || 1,
    };
  }

  // Use full entity response normalization (handles id, subsidy_type, etc.)
  return normalizeEntityResponse(normalized);
}

export function isUuid(value: any): boolean {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeInstitutionClass(value: any): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.trim().match(/^(?:Class\s*)?([A-E])$/i);
  return match ? match[1].toUpperCase() : undefined;
}

export function fromInstitutionClass(value: any): string | undefined {
  const normalized = normalizeInstitutionClass(value);
  return normalized ? `Class ${normalized}` : undefined;
}

export function institutionFieldsForResponse(institution: any): any {
  if (!institution) return {};
  const response: any = { ...institution };

  if (institution.latitude !== undefined) response.lat = institution.latitude;
  if (institution.longitude !== undefined) response.lng = institution.longitude;
  if (institution.institution_code !== undefined) {
    response.institutionCode = institution.institution_code ?? '';
    response.iafrSourceCode = institution.institution_code ?? '';
    response.iafr_source_code = institution.institution_code ?? '';
  }

  const className = fromInstitutionClass(institution.class);
  if (className) response.class = className;

  delete response.id;
  delete response.latitude;
  delete response.longitude;
  return response;
}

export function calculateAge(birthDate: string | null): number {
  if (!birthDate) return 0;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
