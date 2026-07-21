import { Injectable } from '@nestjs/common';
import { Parish, DiocesanSchool, Seminary } from '../types';
import { ALL_PARISHES, INITIAL_SEMINARIES, INITIAL_SCHOOLS } from '../constants';
import { SupabaseService } from './supabase.service';

type EntityType = 'parish' | 'seminary' | 'school';

const MONTH_ORDER: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);

@Injectable()
export class EntityService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private tableFor(type: string | null): string | null {
    if (type === 'parish') return 'parishes';
    if (type === 'seminary') return 'seminaries';
    if (type === 'school') return 'diocesan_schools';
    return null;
  }

  getParishes(): Parish[] {
    return ALL_PARISHES as Parish[];
  }

  getSchools(): DiocesanSchool[] {
    return INITIAL_SCHOOLS as DiocesanSchool[];
  }

  getSeminaries(): Seminary[] {
    return INITIAL_SEMINARIES as Seminary[];
  }

  getAll(): { parishes: Parish[]; schools: DiocesanSchool[]; seminaries: Seminary[] } {
    return {
      parishes: this.getParishes(),
      schools: this.getSchools(),
      seminaries: this.getSeminaries(),
    };
  }

  // Live database administrative calls (falling back to constants)
  async getAdminEntities(type?: EntityType, includeAll = false): Promise<any> {
    // The portable canonical institution registry is authoritative for parish
    // management and includes newly renumbered parishes immediately.
    if (type === 'parish') {
      return this.getPortableAdminEntities('parish', includeAll);
    }

    const table = this.tableFor(type ?? null);
    if (table) {
      const entityType = type as EntityType;
      let q: any = this.supabaseService.supabaseServer.from(table).select('*').order('name');
      if (!includeAll) q = q.eq('status', 'active');

      const { data, error } = await q;
      if (this.isMissingTableError(error)) {
        return this.getPortableAdminEntities(entityType, includeAll);
      }
      if (error || !data?.length) {
        return entityType === 'parish' ? this.getParishes() : entityType === 'seminary' ? this.getSeminaries() : this.getSchools();
      }
      // Normalize data based on type
      if (entityType === 'school' && data) {
        return (await this.enrichWithInstitutionCodes(entityType, data)).map((school: any) => this.normalizeSchoolData(school));
      }
      if (entityType === 'parish' && data) {
        return (await this.enrichWithInstitutionCodes(entityType, data)).map((parish: any) => this.normalizeEntityResponse(parish));
      }
      if (entityType === 'seminary' && data) {
        return (await this.enrichWithInstitutionCodes(entityType, data)).map((seminary: any) => this.normalizeEntityResponse(seminary));
      }
      return data;
    }

    const [par, sem, sch] = await Promise.all([
      this.supabaseService.supabaseServer.from('parishes').select('*').eq('status', 'active').order('name'),
      this.supabaseService.supabaseServer.from('seminaries').select('*').eq('status', 'active').order('name'),
      this.supabaseService.supabaseServer.from('diocesan_schools').select('*').eq('status', 'active').order('name'),
    ]);

    if (this.isMissingTableError(par.error)) {
      return {
        parishes: await this.getPortableAdminEntities('parish', includeAll),
        seminaries: await this.getPortableAdminEntities('seminary', includeAll),
        schools: await this.getPortableAdminEntities('school', includeAll),
      };
    }

    if (par.error) {
      return this.getAll();
    }

    return {
      parishes: (await this.enrichWithInstitutionCodes('parish', par.data ?? [])).map((p: any) =>
        this.normalizeEntityResponse(p),
      ),
      seminaries: (await this.enrichWithInstitutionCodes('seminary', sem.data ?? [])).map((s: any) =>
        this.normalizeEntityResponse(s),
      ),
      schools: (await this.enrichWithInstitutionCodes('school', sch.data ?? [])).map((s: any) =>
        this.normalizeSchoolData(s),
      ),
    };
  }

  private async enrichWithInstitutionCodes(type: EntityType, rows: any[]): Promise<any[]> {
    if (!rows.length) return rows;

    const { data: institutions, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('institutions')
      .select('id, name, vicariate, institution_code')
      .eq('institution_type', this.domainInstitutionType(type))
      .is('deleted_at', null);

    if (error || !institutions?.length) return rows;

    const byId = new Map<string, any>();
    const byNameAndVicariate = new Map<string, any>();
    const byName = new Map<string, any>();
    const duplicateNames = new Set<string>();
    const key = (value: any) =>
      String(value ?? '')
        .trim()
        .toLowerCase();

    for (const institution of institutions) {
      if (institution.id) byId.set(institution.id, institution);

      const nameKey = key(institution.name);
      const vicariateKey = key(institution.vicariate);
      if (nameKey && vicariateKey) byNameAndVicariate.set(`${nameKey}|${vicariateKey}`, institution);

      if (nameKey) {
        if (byName.has(nameKey)) duplicateNames.add(nameKey);
        else byName.set(nameKey, institution);
      }
    }

    for (const duplicateName of duplicateNames) {
      byName.delete(duplicateName);
    }

    return rows.map((row) => {
      const existingCode = row.institution_code ?? row.institutionCode ?? row.iafr_source_code ?? row.iafrSourceCode;
      if (existingCode) return row;

      const idCandidate = this.isUuid(row.institution_id) ? row.institution_id : this.isUuid(row.id) ? row.id : null;
      const match =
        (idCandidate ? byId.get(idCandidate) : null) ??
        byNameAndVicariate.get(`${key(row.name)}|${key(row.vicariate)}`) ??
        byName.get(key(row.name));

      const institutionCode = match?.institution_code ?? '';
      return {
        ...row,
        institution_code: institutionCode,
        institutionCode,
        iafr_source_code: institutionCode,
        iafrSourceCode: institutionCode,
      };
    });
  }

  private async getPortableAdminEntities(type: EntityType, includeAll = false): Promise<any[]> {
    let q: any = this.supabaseService.admin
      .schema('diocese')
      .from('institutions')
      .select(
        'id, name, institution_code, institution_type, vicariate, district, cluster, class, address, contact_number, email, latitude, longitude, is_active, subsidy_type',
      )
      .eq('institution_type', this.domainInstitutionType(type))
      .order('name');

    if (!includeAll) q = q.eq('is_active', true).is('deleted_at', null);

    const { data, error } = await q;
    if (error || !data?.length) {
      return type === 'parish' ? this.getParishes() : type === 'seminary' ? this.getSeminaries() : this.getSchools();
    }

    return data.map((institution: any) => this.normalizePortableEntity(type, institution));
  }

  private normalizePortableEntity(type: EntityType, institution: any): any {
    const normalized: any = {
      id: institution.id,
      name: institution.name,
      institution_code: institution.institution_code ?? '',
      institutionCode: institution.institution_code ?? '',
      iafr_source_code: institution.institution_code ?? '',
      iafrSourceCode: institution.institution_code ?? '',
      vicariate: institution.vicariate ?? '',
      district: institution.district ?? '',
      class: this.fromInstitutionClass(institution.class) ?? institution.class ?? 'Class C',
      address: institution.address ?? '',
      contact_number: institution.contact_number ?? '',
      contactNumber: institution.contact_number ?? '',
      email: institution.email ?? '',
      lat: institution.latitude !== null && institution.latitude !== undefined ? Number(institution.latitude) : undefined,
      lng: institution.longitude !== null && institution.longitude !== undefined ? Number(institution.longitude) : undefined,
      status: institution.is_active === false ? 'inactive' : 'active',
      subsidy_type: institution.subsidy_type ?? 'subsidized',
      subsidyType: institution.subsidy_type ?? 'subsidized',
    };

    if (type === 'parish') {
      normalized.pastor = '';
      return normalized;
    }

    if (type === 'seminary') {
      normalized.rector = '';
      normalized.enrollment = 0;
      normalized.capacity = 0;
      normalized.staff = 0;
      return normalized;
    }

    normalized.cluster = Number(institution.cluster) || this.clusterFromVicariate(institution.vicariate);
    normalized.principal = '';
    normalized.level = 'K-12';
    normalized.enrollment = 0;
    normalized.capacity = 0;
    normalized.staff = 0;
    return normalized;
  }

  private clusterFromVicariate(vicariate: any): 1 | 2 | 3 {
    const value = String(vicariate ?? '').toLowerCase();
    if (value.includes('holy family') || value.includes('san isidro')) return 2;
    if (value.includes('san pedro') || value.includes('sta. rosa')) return 3;
    return 1;
  }

  private normalizeSchoolData(school: any): any {
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
    return this.normalizeEntityResponse(normalized);
  }

  private normalizeEntityResponse(entity: any): any {
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

  private domainInstitutionType(type: EntityType): 'parish' | 'school' | 'seminary' {
    return type;
  }

  private detailSchemaFor(type: EntityType): 'parishes' | 'schools' | 'seminaries' {
    if (type === 'parish') return 'parishes';
    if (type === 'school') return 'schools';
    return 'seminaries';
  }

  private isUuid(value: any): boolean {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private async resolveDioceseProfileId(userId?: string): Promise<string | null> {
    if (!this.isUuid(userId)) return null;

    const { data: externalProfile, error: externalError } = await this.supabaseService.admin
      .schema('diocese')
      .from('profiles')
      .select('id')
      .eq('external_auth_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!externalError && externalProfile?.id) return externalProfile.id;

    const { data: directProfile, error: directError } = await this.supabaseService.admin
      .schema('diocese')
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!directError && directProfile?.id) return directProfile.id;

    // Demo/local users and partially onboarded accounts may not yet have a
    // canonical diocesan profile. The audit log still records their displayed
    // identity, while nullable renumbering FKs remain valid.
    return null;
  }

  private normalizeInstitutionClass(value: any): string | undefined {
    if (typeof value !== 'string') return undefined;
    const match = value.trim().match(/^(?:Class\s*)?([A-E])$/i);
    return match ? match[1].toUpperCase() : undefined;
  }

  private fromInstitutionClass(value: any): string | undefined {
    const normalized = this.normalizeInstitutionClass(value);
    return normalized ? `Class ${normalized}` : undefined;
  }

  private institutionFieldsForResponse(institution: any): any {
    if (!institution) return {};
    const response: any = { ...institution };

    if (institution.latitude !== undefined) response.lat = institution.latitude;
    if (institution.longitude !== undefined) response.lng = institution.longitude;
    if (institution.institution_code !== undefined) {
      response.institutionCode = institution.institution_code ?? '';
      response.iafrSourceCode = institution.institution_code ?? '';
      response.iafr_source_code = institution.institution_code ?? '';
    }

    const className = this.fromInstitutionClass(institution.class);
    if (className) response.class = className;

    delete response.id;
    delete response.latitude;
    delete response.longitude;
    return response;
  }

  private async findInstitution(type: EntityType, entity: any): Promise<any | null> {
    const institutionType = this.domainInstitutionType(type);
    const candidates = [
      entity?.institution_id,
      this.isUuid(entity?.id) ? entity.id : null,
    ].filter(Boolean);

    for (const id of candidates) {
      const { data, error } = await this.supabaseService.admin
        .schema('diocese')
        .from('institutions')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (data) return data;
    }

    const names = [entity?.previousName, entity?.name].filter(
      (name, index, all) => typeof name === 'string' && name.trim() && all.indexOf(name) === index,
    );

    for (const name of names) {
      const { data, error } = await this.supabaseService.admin
        .schema('diocese')
        .from('institutions')
        .select('*')
        .eq('name', name)
        .eq('institution_type', institutionType)
        .is('deleted_at', null)
        .limit(1);

      if (error) throw error;
      if (data?.[0]) return data[0];
    }

    return null;
  }

  private isMissingTableError(error: any): boolean {
    return !!error && (MISSING_TABLE_CODES.has(error.code) || String(error.message ?? '').includes('schema cache'));
  }

  async previewParishRenumbering(requestedSourceCode: string): Promise<any> {
    const normalizedCode = String(requestedSourceCode ?? '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^D[1-4]-[1-9][0-9]*$/.test(normalizedCode)) {
      throw new Error('Enter the source code in D#-# format, for example D2-42.');
    }

    const { data, error } = await this.supabaseService.admin
      .schema('operations')
      .rpc('preview_parish_source_code_insert', { p_requested_source_code: normalizedCode });
    if (error) throw error;

    const changes = (data ?? []).map((row: any) => ({
      institutionId: row.institution_id,
      parishName: row.parish_name,
      oldSourceCode: row.old_source_code,
      newSourceCode: row.new_source_code,
      sequenceNumber: row.sequence_number,
    }));

    return {
      requestedSourceCode: normalizedCode,
      affectedParishCount: changes.length,
      finalSourceCode: changes.length ? changes[changes.length - 1].newSourceCode : normalizedCode,
      changes,
    };
  }

  async createParishWithRenumbering(input: any, changedBy?: string): Promise<any> {
    const requestedSourceCode = String(input?.requestedSourceCode ?? '').trim().toUpperCase().replace(/\s+/g, '');
    const actorId = await this.resolveDioceseProfileId(changedBy);

    if (!/^D[1-4]-[1-9][0-9]*$/.test(requestedSourceCode)) {
      throw new Error('Enter the source code in D#-# format, for example D2-42.');
    }
    const parish = input?.parish ?? {};
    const { data, error } = await this.supabaseService.admin
      .schema('operations')
      .rpc('create_parish_with_source_code_renumbering', {
        p_parish: {
          name: parish.name,
          district: parish.district,
          vicariate: parish.vicariate,
          class: parish.class,
          address: parish.address,
          contact_number: parish.contactNumber ?? parish.contact_number,
          email: parish.email,
          latitude: parish.lat ?? parish.latitude,
          longitude: parish.lng ?? parish.longitude,
        },
        p_requested_source_code: requestedSourceCode,
        p_changed_by: actorId,
      });
    if (error) throw error;

    const result = data as any;
    const { data: institution, error: institutionError } = await this.supabaseService.admin
      .schema('diocese')
      .from('institutions')
      .select('*')
      .eq('id', result.institutionId)
      .single();
    if (institutionError) {
      // The transactional RPC has already committed successfully. Return the
      // canonical identity from its result rather than misreporting the whole
      // operation as failed because a follow-up display read was unavailable.
      return {
        id: result.institutionId,
        name: parish.name,
        district: parish.district,
        vicariate: parish.vicariate,
        class: parish.class,
        address: parish.address,
        institutionCode: requestedSourceCode,
        iafrSourceCode: requestedSourceCode,
        status: 'active',
        renumbering: result,
      };
    }

    return {
      ...this.normalizePortableEntity('parish', institution),
      renumbering: result,
    };
  }

  async getParishRenumberingHistory(): Promise<any[]> {
    const { data, error } = await this.supabaseService.admin
      .schema('operations')
      .from('parish_renumbering_batches')
      .select('id, new_parish_id, requested_source_code, affected_parish_count, effective_at, status, executed_by, executed_at, operation_type')
      .order('executed_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async previewBulkParishReorder(district: string, order: string[]): Promise<any> {
    if (!Array.isArray(order) || order.length === 0 || order.some((id) => !this.isUuid(id))) {
      throw new Error('The proposed order must contain valid parish identifiers.');
    }
    const { data, error } = await this.supabaseService.admin
      .schema('operations')
      .rpc('preview_bulk_parish_reorder', { p_district: district, p_order: order });
    if (error) throw error;

    const changes = (data ?? []).map((row: any) => ({
      institutionId: row.institution_id,
      parishName: row.parish_name,
      oldSourceCode: row.old_source_code,
      newSourceCode: row.new_source_code,
      oldPosition: row.old_position,
      newPosition: row.new_position,
      changed: row.old_source_code !== row.new_source_code,
    }));
    return {
      district,
      parishCount: changes.length,
      affectedParishCount: changes.filter((row: any) => row.changed).length,
      changes,
    };
  }

  async executeBulkParishReorder(input: any, changedBy?: string): Promise<any> {
    const order = input?.order;
    if (!Array.isArray(order) || order.length === 0 || order.some((id: any) => !this.isUuid(id))) {
      throw new Error('The proposed order must contain valid parish identifiers.');
    }
    const actorId = await this.resolveDioceseProfileId(changedBy);
    const { data, error } = await this.supabaseService.admin
      .schema('operations')
      .rpc('execute_bulk_parish_reorder', {
        p_district: input?.district,
        p_order: order,
        p_changed_by: actorId,
      });
    if (error) throw error;
    return data;
  }

  async getPriestAssignmentWorkspace(): Promise<any> {
    const [profilesResult, institutionsResult, assignmentsResult] = await Promise.all([
      this.supabaseService.admin
        .schema('diocese')
        .from('profiles')
        .select('id, full_name, is_active')
        .eq('role_id', 'parish_priest')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('full_name'),
      this.supabaseService.admin
        .schema('diocese')
        .from('institutions')
        .select('id, name, institution_code, district, vicariate, is_active')
        .eq('institution_type', 'parish')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name'),
      this.supabaseService.admin
        .schema('operations')
        .from('priest_assignments')
        .select('id, priest_id, institution_id, start_date, end_date, status, is_active, reassignment_batch_id, previous_assignment_id, created_at')
        .eq('assignment_role', 'parish_priest')
        .is('deleted_at', null)
        .order('start_date', { ascending: false }),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (institutionsResult.error) throw institutionsResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;

    const priests = profilesResult.data ?? [];
    const parishes = institutionsResult.data ?? [];
    const assignments = assignmentsResult.data ?? [];
    const priestNames = new Map(priests.map((priest: any) => [priest.id, priest.full_name || 'Unnamed priest']));
    const parishNames = new Map(parishes.map((parish: any) => [parish.id, parish.name]));

    return {
      priests: priests.map((priest: any) => ({ id: priest.id, name: priest.full_name || 'Unnamed priest' })),
      parishes: parishes.map((parish: any) => ({
        id: parish.id,
        name: parish.name,
        institutionCode: parish.institution_code,
        district: parish.district,
        vicariate: parish.vicariate,
      })),
      assignments: assignments.map((assignment: any) => ({
        id: assignment.id,
        priestId: assignment.priest_id,
        priestName: priestNames.get(assignment.priest_id) || 'Unknown priest',
        parishId: assignment.institution_id,
        parishName: parishNames.get(assignment.institution_id) || 'Unknown parish',
        startDate: assignment.start_date,
        endDate: assignment.end_date,
        status: assignment.status,
        isActive: assignment.is_active,
        reassignmentBatchId: assignment.reassignment_batch_id,
        previousAssignmentId: assignment.previous_assignment_id,
      })),
    };
  }

  async previewPriestReassignment(moves: any[]): Promise<any> {
    if (!Array.isArray(moves) || moves.length === 0) throw new Error('Add at least one priest reassignment.');
    const { data, error } = await this.supabaseService.admin
      .schema('operations')
      .rpc('preview_priest_reassignment', { p_moves: moves });
    if (error) throw error;
    const normalized = (data ?? []).map((row: any) => ({
      priestId: row.priest_id,
      priestName: row.priest_name,
      oldAssignmentId: row.old_assignment_id,
      fromParishId: row.from_parish_id,
      fromParishName: row.from_parish_name,
      toParishId: row.to_parish_id,
      toParishName: row.to_parish_name,
      createsVacancy: row.creates_vacancy,
    }));
    return {
      assignmentCount: normalized.length,
      vacancyCount: normalized.filter((move: any) => move.createsVacancy).length,
      moves: normalized,
    };
  }

  async executePriestReassignment(moves: any[], executedBy?: string): Promise<any> {
    if (!Array.isArray(moves) || moves.length === 0) throw new Error('Add at least one priest reassignment.');
    const actorId = await this.resolveDioceseProfileId(executedBy);
    const { data, error } = await this.supabaseService.admin
      .schema('operations')
      .rpc('execute_priest_reassignment', { p_moves: moves, p_executed_by: actorId });
    if (error) throw error;
    return data;
  }

  async getPriestReassignmentHistory(): Promise<any[]> {
    const { data, error } = await this.supabaseService.admin
      .schema('operations')
      .from('priest_reassignment_batches')
      .select('id, assignment_count, vacancy_count, status, executed_by, executed_at, created_at')
      .order('executed_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  private async syncEntityDetails(type: EntityType, institutionId: string, entity: any): Promise<void> {
    const subsidyType = entity?.subsidy_type ?? entity?.subsidyType;
    const institutionCode = entity?.iafrSourceCode ?? entity?.iafr_source_code ?? entity?.institutionCode ?? entity?.institution_code;
    const payload: Record<string, any> = {
      institution_id: institutionId,
      updated_at: new Date().toISOString(),
    };

    if (subsidyType === 'subsidized' || subsidyType === 'independent') payload.subsidy_type = subsidyType;
    if (type === 'parish' && institutionCode !== undefined) {
      const normalizedCode = String(institutionCode ?? '').trim().toUpperCase().replace(/\s+/g, '');
      payload.iafr_source_code = normalizedCode || null;
    }

    if (Object.keys(payload).length <= 2) return;

    try {
      const { error } = await this.supabaseService.admin
        .schema(this.detailSchemaFor(type))
        .from('details')
        .upsert(payload, { onConflict: 'institution_id' });

      if (error) throw error;
    } catch (error) {
      console.warn(`Unable to sync subsidy_type to ${this.detailSchemaFor(type)}.details:`, error);
    }
  }

  private async syncInstitutionFields(type: EntityType, entity: any): Promise<any | null> {
    const subsidyType = entity?.subsidy_type ?? entity?.subsidyType;
    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (entity?.name !== undefined) payload.name = entity.name;
    if (entity?.address !== undefined) payload.address = entity.address;
    if (entity?.vicariate !== undefined) payload.vicariate = entity.vicariate;
    if (entity?.district !== undefined) payload.district = entity.district;
    const institutionCode = entity?.institutionCode ?? entity?.institution_code ?? entity?.iafrSourceCode ?? entity?.iafr_source_code;
    if (institutionCode !== undefined) {
      const normalizedCode = String(institutionCode ?? '').trim().toUpperCase().replace(/\s+/g, '');
      payload.institution_code = normalizedCode || null;
    }
    if (entity?.class !== undefined) {
      const normalizedClass = this.normalizeInstitutionClass(entity.class);
      if (normalizedClass) payload.class = normalizedClass;
    }
    if (entity?.lat !== undefined) payload.latitude = entity.lat;
    if (entity?.lng !== undefined) payload.longitude = entity.lng;
    if (subsidyType === 'subsidized' || subsidyType === 'independent') payload.subsidy_type = subsidyType;

    if (Object.keys(payload).length <= 1) return null;

    try {
      const existing = await this.findInstitution(type, entity);

      if (existing?.id) {
        const { data, error } = await this.supabaseService.admin
          .schema('diocese')
          .from('institutions')
          .update(payload)
          .eq('id', existing.id)
          .select('*')
          .single();

        if (error) throw error;
        await this.syncEntityDetails(type, existing.id, entity);
        return data;
      }

      if (!entity?.name) return null;

      const { data, error } = await this.supabaseService.admin
        .schema('diocese')
        .from('institutions')
        .insert({
          ...payload,
          name: entity.name,
          institution_type: this.domainInstitutionType(type),
          is_active: entity?.status === 'inactive' ? false : true,
        })
        .select('*')
        .single();

      if (error) throw error;
      await this.syncEntityDetails(type, data.id, entity);
      return data;
    } catch (error) {
      console.warn('Unable to sync entity fields to diocese.institutions:', error);
      return null;
    }
  }

  private legacyPayloadFor(type: EntityType, payload: any): any {
    const legacyPayload = { ...payload };

    // These fields are owned by diocese.institutions in the portable schema. Some legacy/detail tables do not
    // have them, so writing them directly can make the admin save fail before the central-table sync runs.
    delete legacyPayload.subsidyType;
    delete legacyPayload.subsidy_type;
    delete legacyPayload.previousName;
    delete legacyPayload.institutionCode;
    delete legacyPayload.institution_code;
    delete legacyPayload.iafrSourceCode;
    delete legacyPayload.iafr_source_code;
    delete legacyPayload.district;
    delete legacyPayload.lat;
    delete legacyPayload.lng;

    if (type === 'school') {
      delete legacyPayload.cluster;
    }

    return legacyPayload;
  }

  async createAdminEntity(type: EntityType, entity: any): Promise<any> {
    const table = this.tableFor(type);
    if (!table) throw new Error('Invalid type');
    if (type === 'parish') {
      throw new Error('New parishes must be created through the source-code preview and confirmation workflow.');
    }

    // For schools, convert cluster to vicariate if database still uses vicariate column
    let payload = entity;
    if (type === 'school' && entity.cluster && !entity.vicariate) {
      const clusterToVicariate: Record<number, string> = {
        1: 'San Pablo',
        2: 'Holy Family',
        3: 'San Isidro Labrador',
      };
      payload = {
        ...entity,
        vicariate: clusterToVicariate[entity.cluster] || 'San Pablo',
      };
      // Remove cluster if database doesn't have it yet
      const { cluster, ...payloadWithoutCluster } = payload;
      payload = payloadWithoutCluster;
    }

    const legacyPayload = this.legacyPayloadFor(type, payload);
    const { data, error } = await this.supabaseService.supabaseServer.from(table).insert(legacyPayload).select().single();
    if (this.isMissingTableError(error)) {
      const syncedInstitution = await this.syncInstitutionFields(type, payload);
      if (!syncedInstitution) throw error;
      return this.normalizePortableEntity(type, syncedInstitution);
    }
    if (error) throw error;
    const syncedInstitution = await this.syncInstitutionFields(type, { ...payload, ...data });
    const createdInstitutionFields = this.institutionFieldsForResponse(syncedInstitution);
    const normalizedData = syncedInstitution ? { ...data, ...createdInstitutionFields } : data;
    // Normalize the response
    if (type === 'school') return this.normalizeSchoolData(normalizedData);
    return this.normalizeEntityResponse(normalizedData);
  }

  async updateAdminEntity(type: EntityType, id: string, updates: any): Promise<any> {
    const table = this.tableFor(type);
    if (!table || !id) throw new Error('type and id are required');

    if (type === 'parish') {
      updates = { ...updates };
      delete updates.institutionCode;
      delete updates.institution_code;
      delete updates.iafrSourceCode;
      delete updates.iafr_source_code;

      const syncedInstitution = await this.syncInstitutionFields(type, { ...updates, id });
      if (!syncedInstitution) throw new Error('Unable to update the canonical parish record.');
      return this.normalizePortableEntity('parish', syncedInstitution);
    }

    // For schools, convert cluster to vicariate if database still uses vicariate column
    let payload = { ...updates, updated_at: new Date().toISOString() };
    if (type === 'school' && updates.cluster && !updates.vicariate) {
      const clusterToVicariate: Record<number, string> = {
        1: 'San Pablo',
        2: 'Holy Family',
        3: 'San Isidro Labrador',
      };
      payload = {
        ...payload,
        vicariate: clusterToVicariate[updates.cluster] || 'San Pablo',
      };
      // Remove cluster if database doesn't have it yet
      const { cluster, ...payloadWithoutCluster } = payload;
      payload = payloadWithoutCluster;
    }

    const { data: existingEntity } = await this.supabaseService.supabaseServer
      .from(table)
      .select('name')
      .eq('id', id)
      .maybeSingle();

    const legacyPayload = this.legacyPayloadFor(type, payload);
    console.log('[updateAdminEntity] type:', type, 'id:', id);
    console.log('[updateAdminEntity] legacyPayload:', JSON.stringify(legacyPayload, null, 2));

    const { data, error } = await this.supabaseService.supabaseServer
      .from(table)
      .update(legacyPayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (this.isMissingTableError(error)) {
        const syncedInstitution = await this.syncInstitutionFields(type, {
          ...updates,
          ...payload,
          id,
          previousName: updates.previousName ?? existingEntity?.name,
        });
        if (!syncedInstitution) throw error;
        return this.normalizePortableEntity(type, syncedInstitution);
      }
      console.error('[updateAdminEntity] Update error:', error);
      throw error;
    }
    const syncedInstitution = await this.syncInstitutionFields(type, {
      ...updates,
      ...data,
      id,
      institution_id: id,
      previousName: updates.previousName ?? existingEntity?.name,
    });
    const updatedInstitutionFields = this.institutionFieldsForResponse(syncedInstitution);
    const normalizedData = syncedInstitution ? { ...data, ...updatedInstitutionFields } : data;
    // Normalize the response
    if (type === 'school') return this.normalizeSchoolData(normalizedData);
    return this.normalizeEntityResponse(normalizedData);
  }

  async updateOwnInstitution(type: EntityType, id: string, contactNumber?: string, email?: string): Promise<any> {
    const table = this.tableFor(type);
    if (!table || !id) throw new Error('type and id are required');

    const updatePayload: any = {
      updated_at: new Date().toISOString(),
    };

    if (type === 'parish') {
      if (contactNumber !== undefined) updatePayload.contact_number = contactNumber;
      if (email !== undefined) updatePayload.email = email;
    } else {
      if (contactNumber !== undefined) {
        updatePayload.contact_number = contactNumber;
        updatePayload.contactNumber = contactNumber;
      }
      if (email !== undefined) updatePayload.email = email;
    }

    const { data, error } = await this.supabaseService.supabaseServer
      .from(table)
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getGeoInstitutions(): Promise<any[]> {
    const { data: institutions, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('institutions')
      .select('id, name, vicariate, class, latitude, longitude')
      .eq('institution_type', 'parish')
      .eq('is_active', true)
      .is('deleted_at', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('name');

    if (error || !institutions?.length) {
      return ALL_PARISHES.map((p: any) => ({
        id: p.id ?? null,
        name: p.name,
        vicariate: p.vicariate ?? '',
        class: p.class ?? '',
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        collections: p.collections ?? 0,
      }));
    }

    const ids = institutions.map((i: any) => i.id);
    const { data: records } = await this.supabaseService.admin
      .schema('parishes')
      .from('financial_records')
      .select('institution_id, net_receipts, year, month')
      .in('institution_id', ids)
      .eq('is_current_version', true)
      .is('deleted_at', null);

    const collectionsMap: Record<string, number> = {};
    (records ?? []).forEach((r: any) => {
      const existing = collectionsMap[r.institution_id];
      if (existing === undefined) {
        collectionsMap[r.institution_id] = r.net_receipts ?? 0;
      } else {
        const existingRecord = (records ?? []).find(
          (x: any) =>
            x.institution_id === r.institution_id && collectionsMap[r.institution_id] === (x.net_receipts ?? 0),
        );
        const existingYear = existingRecord?.year ?? 0;
        const existingMonth = MONTH_ORDER[existingRecord?.month ?? ''] ?? 0;
        if (r.year > existingYear || (r.year === existingYear && MONTH_ORDER[r.month] > existingMonth)) {
          collectionsMap[r.institution_id] = r.net_receipts ?? 0;
        }
      }
    });

    return institutions.map((i: any) => ({
      id: i.id,
      name: i.name,
      vicariate: i.vicariate ?? '',
      class: i.class ? `Class ${i.class}` : '',
      lat: i.latitude,
      lng: i.longitude,
      collections: collectionsMap[i.id] ?? 0,
    }));
  }

  // ─── Financial profiles (Digital Twin + What-If Simulator) ───────────────────

  async getFinancialProfiles(type?: EntityType): Promise<any[]> {
    const result: any[] = [];

    if (!type || type === 'parish') {
      const { data: institutions } = await this.supabaseService.admin
        .schema('diocese')
        .from('institutions')
        .select('id, name, vicariate, class, district, institution_code')
        .eq('institution_type', 'parish')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name');

      if (institutions?.length) {
        const ids = institutions.map((i: any) => i.id);
        const { data: records } = await this.supabaseService.admin
          .schema('parishes')
          .from('financial_records')
          .select('institution_id, net_receipts, year, month, ending_balance_after_remit, beginning_balance')
          .in('institution_id', ids)
          .eq('is_current_version', true)
          .is('deleted_at', null);

        // Group records by institution and sort desc by year/month
        const byInst: Record<string, any[]> = {};
        (records ?? []).forEach((r: any) => {
          if (!byInst[r.institution_id]) byInst[r.institution_id] = [];
          byInst[r.institution_id].push(r);
        });
        Object.values(byInst).forEach((recs) =>
          recs.sort((a, b) => {
            if (b.year !== a.year) return b.year - a.year;
            return (MONTH_ORDER[b.month] ?? 0) - (MONTH_ORDER[a.month] ?? 0);
          }),
        );

        for (const inst of institutions) {
          const recs = (byInst[inst.id] ?? []).slice(0, 6);
          const collectionsHistory = recs.map((r: any) => Number(r.net_receipts ?? 0)).reverse();
          const expensesHistory = recs
            .map((r: any) =>
              Math.max(
                0,
                Number(r.net_receipts ?? 0) +
                  Number(r.beginning_balance ?? 0) -
                  Number(r.ending_balance_after_remit ?? 0),
              ),
            )
            .reverse();
          const currentBalance = Number(recs[0]?.ending_balance_after_remit ?? 0);
          const monthlyCollections = collectionsHistory.length
            ? collectionsHistory.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, collectionsHistory.length)
            : 0;
          const monthlyExpenses = expensesHistory.length
            ? expensesHistory.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, expensesHistory.length)
            : 0;
          const { healthScore, risk } = this.computeFinancialHealthScore(
            monthlyCollections,
            monthlyExpenses,
            currentBalance,
            collectionsHistory,
          );
          const trend = this.computeCollectionTrend(collectionsHistory);

          result.push({
            id: inst.id,
            institutionCode: inst.institution_code ?? '',
            name: inst.name,
            type: 'parish',
            location: inst.vicariate ?? '',
            class: inst.class ? `Class ${inst.class}` : '',
            classRaw: inst.class ?? '',
            // Real per-institution assignment — deliberately NOT derived from
            // vicariate (the real data shows a single vicariate can span
            // multiple districts, or none), and most parishes don't have one
            // recorded yet. 'Unassigned' is honest, not a fabricated guess.
            district: inst.district ?? 'Unassigned',
            healthScore,
            risk,
            currentBalance,
            monthlyCollections,
            monthlyExpenses,
            collectionsHistory,
            expensesHistory,
            trend,
            insight: this.generateFinancialInsight(healthScore, trend),
          });
        }
      } else {
        // Fallback: use ALL_PARISHES constants
        ALL_PARISHES.forEach((p: any, i: number) => {
          const mc = Math.round((p.collections ?? 0) / 12);
          result.push(this.buildFallbackProfile(String(i + 1), p.name, 'parish', p.vicariate ?? '', p.class ?? '', mc));
        });
      }
    }

    // Schools and seminaries: read from diocese.institutions so profiles carry
    // real UUIDs and codes. Financial history stays zeroed until their
    // financial_records tables receive submissions (frontend falls back to
    // class-based estimates; ML forecast activates automatically with data).
    if (!type || type === 'school') {
      result.push(...(await this.fetchInstitutionProfiles('school')));
    }

    if (!type || type === 'seminary') {
      result.push(...(await this.fetchInstitutionProfiles('seminary')));
    }

    return result;
  }

  private async fetchInstitutionProfiles(entityType: 'school' | 'seminary'): Promise<any[]> {
    const { data: institutions } = await this.supabaseService.admin
      .schema('diocese')
      .from('institutions')
      .select('id, name, vicariate, class, institution_code')
      .eq('institution_type', entityType)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name');

    return (institutions ?? []).map((inst: any) => ({
      id: inst.id,
      institutionCode: inst.institution_code ?? '',
      name: inst.name,
      type: entityType,
      location: inst.vicariate ?? '',
      class: inst.class ? `Class ${inst.class}` : '',
      classRaw: inst.class ?? '',
      healthScore: 50,
      risk: 'Moderate',
      currentBalance: 0,
      monthlyCollections: 0,
      monthlyExpenses: 0,
      collectionsHistory: [],
      expensesHistory: [],
      trend: '0.0%',
      insight: 'Awaiting financial submissions.',
    }));
  }

  private computeFinancialHealthScore(
    income: number,
    expenses: number,
    balance: number,
    history: number[],
  ): { healthScore: number; risk: 'Low' | 'Moderate' | 'High' } {
    if (income === 0 && expenses === 0 && balance === 0) return { healthScore: 50, risk: 'Moderate' };

    const surplusRatio = income > 0 ? (income - expenses) / income : -1;
    const surplusScore = Math.max(0, Math.min(1, surplusRatio + 0.5));
    const coverageScore = expenses > 0 ? Math.min(1, balance / (expenses * 3)) : income > 0 ? 0.5 : 0;

    let consistencyScore = 0.5;
    if (history.length >= 3) {
      const avg = history.reduce((a, b) => a + b, 0) / history.length;
      if (avg > 0) {
        const variance = history.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / history.length;
        consistencyScore = Math.max(0, 1 - Math.sqrt(variance) / avg);
      }
    }

    const raw = 0.4 * surplusScore + 0.3 * coverageScore + 0.3 * consistencyScore;
    const healthScore = Math.min(99, Math.max(10, Math.round(raw * 100)));
    const risk: 'Low' | 'Moderate' | 'High' = healthScore >= 75 ? 'Low' : healthScore >= 55 ? 'Moderate' : 'High';
    return { healthScore, risk };
  }

  private computeCollectionTrend(history: number[]): string {
    if (history.length < 4) return '0.0%';
    const half = Math.floor(history.length / 2);
    const older = history.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const recent = history.slice(-half).reduce((a, b) => a + b, 0) / half;
    if (older === 0) return '0.0%';
    const pct = ((recent - older) / older) * 100;
    return pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
  }

  private generateFinancialInsight(score: number, trend: string): string {
    const up = trend.startsWith('+');
    if (score >= 80)
      return up
        ? 'Consistent collection growth with disciplined operating expenses.'
        : 'Strong reserves despite mixed collection trend.';
    if (score >= 65) return 'Stable financial position with moderate growth potential.';
    if (score >= 50) return 'Adequate reserves; monitor expense trajectory closely.';
    return 'Tight margins — financial review is recommended.';
  }

  private buildFallbackProfile(
    id: string,
    name: string,
    type: EntityType,
    location: string,
    cls: string,
    monthlyCollections: number,
  ): any {
    const monthlyExpenses = Math.round(monthlyCollections * 0.85);
    const currentBalance = monthlyCollections * 2;
    const { healthScore, risk } = this.computeFinancialHealthScore(
      monthlyCollections,
      monthlyExpenses,
      currentBalance,
      [],
    );
    return {
      id,
      name,
      type,
      location,
      class: cls,
      healthScore,
      risk,
      currentBalance,
      monthlyCollections,
      monthlyExpenses,
      collectionsHistory: Array(6).fill(monthlyCollections),
      expensesHistory: Array(6).fill(monthlyExpenses),
      trend: '0.0%',
      insight: monthlyCollections > 0 ? 'Baseline data from diocese records.' : 'Awaiting submission data.',
    };
  }

  // ─── Priest health records ────────────────────────────────────────────────────

  async getPriestHealthRecords(): Promise<any[]> {
    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('priest_health_records')
      .select('*')
      .is('deleted_at', null)
      .order('name');
    if (error) return [];
    const hydrated = await Promise.all((data ?? []).map((r: any) => this.hydrateHealthRecordDocument(r)));
    return hydrated.map((r: any) => this.mapHealthRecord(r));
  }

  async savePriestHealthRecord(record: any): Promise<any> {
    const payload: any = {
      name: record.name,
      position: record.position ?? '',
      parish: record.parish ?? '',
      birth_date: record.birthDate || null,
      last_checkup: record.lastCheckup || null,
      health_status: record.healthStatus ?? 'good',
      notes: record.notes ?? '',
      email: record.email ?? '',
      phone: record.phone ?? '',
      updated_at: new Date().toISOString(),
      ...(record.createdByUserId ? { created_by_user_id: record.createdByUserId } : {}),
    };

    // Try first with document columns; if columns don't exist yet, retry without them
    const tryInsert = async (p: any, isUpdate: boolean, id?: string) => {
      if (isUpdate) {
        const { data, error } = await this.supabaseService.admin
          .schema('diocese').from('priest_health_records').update(p).eq('id', id).select().single();
        return { data, error };
      }
      const { data, error } = await this.supabaseService.admin
        .schema('diocese').from('priest_health_records').insert(p).select().single();
      return { data, error };
    };

    const withDocs = {
      ...payload,
      ...(record.documentName ? { document_name: record.documentName } : {}),
      ...(record.documentUrl  ? { document_url:  record.documentUrl  } : {}),
    };

    const isUpdate = !!(record.id && !String(record.id).startsWith('__new'));

    let result = await tryInsert(withDocs, isUpdate, record.id);

    // If it failed because the document columns don't exist yet, retry without them
    if (result.error && result.error.message?.includes('document_')) {
      console.warn('[entity.service] document columns missing, retrying without them');
      result = await tryInsert(payload, isUpdate, record.id);
    }

    if (result.error) throw result.error;
    return this.mapHealthRecord(result.data);
  }

  async deletePriestHealthRecord(id: string): Promise<void> {
    const { error } = await this.supabaseService.admin
      .schema('diocese')
      .from('priest_health_records')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  private mapHealthRecord(r: any): any {
    return {
      id: r.id,
      name: r.name,
      position: r.position,
      parish: r.parish,
      birthDate: r.birth_date,
      age: this.calculateAge(r.birth_date),
      lastCheckup: r.last_checkup,
      healthStatus: r.health_status,
      notes: r.notes,
      email: r.email,
      phone: r.phone,
      documentUrl: r.document_url ?? '',
      documentName: r.document_name ?? '',
      createdByUserId: r.created_by_user_id ?? null,
    };
  }

  private async hydrateHealthRecordDocument(record: any): Promise<any> {
    if (!record || record.document_name || record.document_url || !record.name) return record;

    const safeName = String(record.name).replace(/[^a-zA-Z0-9._-]/g, '_');

    try {
      const { data: files, error } = await this.supabaseService.admin.storage
        .from('health-documents')
        .list(safeName, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

      if (error || !files?.length) return record;

      const latest = files
        .filter((file: any) => file?.name && file.name !== '.emptyFolderPlaceholder')
        .sort((a: any, b: any) => {
          const aTime = new Date(a.created_at ?? a.updated_at ?? 0).getTime();
          const bTime = new Date(b.created_at ?? b.updated_at ?? 0).getTime();
          return bTime - aTime;
        })[0];

      if (!latest?.name) return record;

      const storagePath = `${safeName}/${latest.name}`;
      const { data: signedData } = await this.supabaseService.admin.storage
        .from('health-documents')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

      const documentName = latest.name.replace(/^\d+_/, '');
      const documentUrl = signedData?.signedUrl ?? '';

      if (documentName || documentUrl) {
        await this.supabaseService.admin
          .schema('diocese')
          .from('priest_health_records')
          .update({
            document_name: documentName,
            document_url: documentUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', record.id);
      }

      return {
        ...record,
        document_name: documentName,
        document_url: documentUrl,
      };
    } catch (error) {
      console.warn('[entity.service] Unable to hydrate health document:', error);
      return record;
    }
  }

  private calculateAge(birthDate: string | null): number {
    if (!birthDate) return 0;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }

  async deleteAdminEntity(type: EntityType, id: string, hardDelete = false): Promise<any> {
    const table = this.tableFor(type);
    if (!table || !id) throw new Error('type and id are required');

    if (type === 'parish') {
      if (hardDelete) {
        throw new Error('Parishes with source-code history cannot be permanently deleted. Archive the parish instead.');
      }
      const now = new Date().toISOString();
      const { data, error } = await this.supabaseService.admin
        .schema('diocese')
        .from('institutions')
        .update({ is_active: false, deleted_at: now, updated_at: now })
        .eq('id', id)
        .eq('institution_type', 'parish')
        .select('*')
        .single();
      if (error) throw error;
      return this.normalizePortableEntity('parish', data);
    }

    if (hardDelete) {
      const { data, error } = await this.supabaseService.supabaseServer
        .from(table)
        .delete()
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const { data, error } = await this.supabaseService.supabaseServer
        .from(table)
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  }
}
