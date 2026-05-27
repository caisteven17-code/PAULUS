import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  readonly client: SupabaseClient;
  readonly admin: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!url || !anon) {
      console.warn('Supabase URL or Anon Key is missing in backend environment.');
    }

    this.client = createClient(url, anon);
    this.admin = createClient(url, serviceRole || anon, {
      auth: { persistSession: false },
    });
  }

  get supabaseBrowser() {
    return this.client;
  }

  get supabaseServer() {
    return this.admin;
  }
}
