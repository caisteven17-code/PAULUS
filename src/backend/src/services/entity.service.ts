import { Injectable } from '@nestjs/common';
import { Parish, DiocesanSchool, Seminary } from '../types';
import { ALL_PARISHES, INITIAL_SEMINARIES, INITIAL_SCHOOLS } from '../constants';
import { SupabaseService } from './supabase.service';

type EntityType = 'parish' | 'seminary' | 'school';

@Injectable()
export class EntityService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private tableFor(type: string | null): string | null {
    if (type === 'parish')   return 'parishes';
    if (type === 'seminary') return 'seminaries';
    if (type === 'school')   return 'diocesan_schools';
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
      parishes:   this.getParishes(),
      schools:    this.getSchools(),
      seminaries: this.getSeminaries(),
    };
  }

  // Live database administrative calls (falling back to constants)
  async getAdminEntities(type?: EntityType, includeAll = false): Promise<any> {
    const table = this.tableFor(type ?? null);
    if (table) {
      let q: any = this.supabaseService.supabaseServer.from(table).select('*').order('name');
      if (!includeAll) q = q.eq('status', 'active');

      const { data, error } = await q;
      if (error || !data?.length) {
        return type === 'parish'   ? this.getParishes()   :
               type === 'seminary' ? this.getSeminaries() :
                                     this.getSchools();
      }
      return data;
    }

    const [par, sem, sch] = await Promise.all([
      this.supabaseService.supabaseServer.from('parishes')       .select('*').eq('status', 'active').order('name'),
      this.supabaseService.supabaseServer.from('seminaries')     .select('*').eq('status', 'active').order('name'),
      this.supabaseService.supabaseServer.from('diocesan_schools').select('*').eq('status', 'active').order('name'),
    ]);

    if (par.error) {
      return this.getAll();
    }

    return {
      parishes:   par.data ?? [],
      seminaries: sem.data ?? [],
      schools:    sch.data ?? [],
    };
  }

  async createAdminEntity(type: EntityType, entity: any): Promise<any> {
    const table = this.tableFor(type);
    if (!table) throw new Error('Invalid type');

    const { data, error } = await this.supabaseService.supabaseServer.from(table).insert(entity).select().single();
    if (error) throw error;
    return data;
  }

  async updateAdminEntity(type: EntityType, id: string, updates: any): Promise<any> {
    const table = this.tableFor(type);
    if (!table || !id) throw new Error('type and id are required');

    const { data, error } = await this.supabaseService.supabaseServer
      .from(table)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
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

  async deleteAdminEntity(type: EntityType, id: string, hardDelete = false): Promise<any> {
    const table = this.tableFor(type);
    if (!table || !id) throw new Error('type and id are required');

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
