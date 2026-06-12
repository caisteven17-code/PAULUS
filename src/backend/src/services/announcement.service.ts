import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  author: string;
  authorRole: string;
  priority: 'low' | 'medium' | 'high';
  category: 'general' | 'financial' | 'administrative' | 'event';
  status: 'draft' | 'active' | 'past' | 'archived';
  pinned: boolean;
  startDate: number;
  endDate: number | null;
  publishedAt: number | null;
  archivedAt: number | null;
  archivedBy: string | null;
  createdAt: number;
}

const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

@Injectable()
export class AnnouncementService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private toAnnouncement(row: any): Announcement {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      author: row.author,
      authorRole: row.author_role,
      priority: row.priority,
      category: row.category,
      status: row.status,
      pinned: row.pinned === true,
      startDate: new Date(row.start_date).getTime(),
      endDate: row.end_date ? new Date(row.end_date).getTime() : null,
      publishedAt: row.published_at ? new Date(row.published_at).getTime() : null,
      archivedAt: row.archived_at ? new Date(row.archived_at).getTime() : null,
      archivedBy: row.archived_by ?? null,
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  private async writeAuditLog(payload: {
    userName: string;
    userRole: string;
    action: string;
    detail: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const { error } = await this.supabaseService.admin
      .schema('diocese')
      .from('audit_logs')
      .insert({
        user_name: payload.userName,
        user_role: payload.userRole,
        is_system: false,
        category: 'system',
        severity: 'info',
        action: payload.action,
        detail: payload.detail,
        entity: 'announcement',
        metadata: payload.metadata ?? null,
      });

    if (error) console.error('[announcement.service] writeAuditLog:', error.message);
  }

  // ── Lazy maintenance jobs (run before returning lists) ──────────────────────

  private async transitionExpiredToPost(): Promise<void> {
    const { error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .update({ status: 'past' })
      .eq('status', 'active')
      .not('end_date', 'is', null)
      .lt('end_date', new Date().toISOString());

    if (error) console.error('[announcement.service] transitionExpiredToPost:', error.message);
  }

  private async purgeOldPastAnnouncements(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
    const { error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .update({ status: 'archived', archived_at: new Date().toISOString(), archived_by: 'System (auto)' })
      .eq('status', 'past')
      .lt('end_date', cutoff);

    if (error) console.error('[announcement.service] purgeOldPastAnnouncements:', error.message);
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  async getAnnouncements(): Promise<Announcement[]> {
    await this.transitionExpiredToPost();

    const now = new Date().toISOString();
    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .select('*')
      .eq('status', 'active')
      .lte('start_date', now)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[announcement.service] getAnnouncements:', error.message);
      return [];
    }

    // Filter out those where end_date has passed (belt-and-suspenders).
    // Pinned-first ordering happens here (not in SQL) so the query still works
    // on databases where migration 194 has not been applied yet.
    return (data ?? [])
      .filter((row) => !row.end_date || new Date(row.end_date).getTime() >= Date.now())
      .map((row) => this.toAnnouncement(row))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }

  /** Published announcements whose start_date is still in the future. */
  async getScheduledAnnouncements(): Promise<Announcement[]> {
    const now = new Date().toISOString();
    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .select('*')
      .eq('status', 'active')
      .gt('start_date', now)
      .is('deleted_at', null)
      .order('start_date', { ascending: true });

    if (error) {
      console.error('[announcement.service] getScheduledAnnouncements:', error.message);
      return [];
    }

    return (data ?? []).map((row) => this.toAnnouncement(row));
  }

  async getDrafts(): Promise<Announcement[]> {
    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .select('*')
      .eq('status', 'draft')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[announcement.service] getDrafts:', error.message);
      return [];
    }

    return (data ?? []).map((row) => this.toAnnouncement(row));
  }

  async getPastAnnouncements(): Promise<Announcement[]> {
    await this.transitionExpiredToPost();
    await this.purgeOldPastAnnouncements();

    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .select('*')
      .eq('status', 'past')
      .is('deleted_at', null)
      .order('end_date', { ascending: false });

    if (error) {
      console.error('[announcement.service] getPastAnnouncements:', error.message);
      return [];
    }

    return (data ?? []).map((row) => this.toAnnouncement(row));
  }

  async getArchivedAnnouncements(): Promise<Announcement[]> {
    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .select('*')
      .eq('status', 'archived')
      .is('deleted_at', null)
      .order('archived_at', { ascending: false });

    if (error) {
      console.error('[announcement.service] getArchivedAnnouncements:', error.message);
      return [];
    }

    return (data ?? []).map((row) => this.toAnnouncement(row));
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

  async createAnnouncement(body: {
    title: string;
    content: string;
    author: string;
    authorRole: string;
    priority: Announcement['priority'];
    category: Announcement['category'];
    status: 'draft' | 'active';
    startDate?: string;
    endDate?: string;
  }): Promise<Announcement | null> {
    const isPublishing = body.status === 'active';
    const now = new Date().toISOString();

    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .insert({
        title: body.title,
        content: body.content,
        author: body.author,
        author_role: body.authorRole,
        priority: body.priority,
        category: body.category,
        status: body.status,
        start_date: body.startDate ?? now,
        end_date: body.endDate ?? null,
        published_at: isPublishing ? now : null,
      })
      .select()
      .single();

    if (error || !data) {
      console.error('[announcement.service] createAnnouncement:', error?.message);
      return null;
    }

    await this.writeAuditLog({
      userName: body.author,
      userRole: body.authorRole,
      action: isPublishing ? 'Published Announcement' : 'Saved Announcement as Draft',
      detail: `"${body.title}" was ${isPublishing ? 'published' : 'saved as draft'}`,
      metadata: { announcement_id: data.id, title: body.title, status: body.status },
    });

    return this.toAnnouncement(data);
  }

  async publishDraft(id: string, userName: string, userRole: string): Promise<Announcement | null> {
    const now = new Date().toISOString();

    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .update({ status: 'active', published_at: now })
      .eq('id', id)
      .eq('status', 'draft')
      .select()
      .single();

    if (error || !data) {
      console.error('[announcement.service] publishDraft:', error?.message);
      return null;
    }

    await this.writeAuditLog({
      userName,
      userRole,
      action: 'Published Draft Announcement',
      detail: `Draft "${data.title}" was published`,
      metadata: { announcement_id: id, title: data.title },
    });

    return this.toAnnouncement(data);
  }

  async hardDeleteAnnouncement(
    id: string,
    userName: string,
    userRole: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    // Fetch the row first to check grace period and snapshot content
    const { data: row, error: fetchError } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !row) {
      return { ok: false, reason: 'Announcement not found.' };
    }

    // Drafts can be hard deleted anytime
    const isDraft = row.status === 'draft';

    if (!isDraft) {
      // Grace period check: published_at must exist and be within 5 minutes
      if (!row.published_at) {
        return { ok: false, reason: 'Cannot delete: announcement has no published_at timestamp.' };
      }
      const age = Date.now() - new Date(row.published_at).getTime();
      if (age > GRACE_PERIOD_MS) {
        return { ok: false, reason: 'Grace period has expired. Use archive instead.' };
      }
    }

    const { error: deleteError } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[announcement.service] hardDeleteAnnouncement:', deleteError.message);
      return { ok: false, reason: 'Delete failed.' };
    }

    // Always write an audit log — this is the only permanent record after hard delete
    await this.writeAuditLog({
      userName,
      userRole,
      action: isDraft ? 'Deleted Draft Announcement' : 'Permanently Deleted Announcement (Grace Period)',
      detail: `"${row.title}" was permanently deleted by ${userName}`,
      metadata: {
        announcement_id: id,
        title: row.title,
        content: row.content,
        author: row.author,
        author_role: row.author_role,
        was_draft: isDraft,
        published_at: row.published_at,
        deleted_by: userName,
        deleted_at: new Date().toISOString(),
      },
    });

    return { ok: true };
  }

  async archiveAnnouncement(id: string, userName: string, userRole: string): Promise<{ ok: boolean }> {
    const now = new Date().toISOString();

    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .update({ status: 'archived', archived_at: now, archived_by: userName })
      .eq('id', id)
      .in('status', ['active', 'past'])
      .select('title')
      .single();

    if (error || !data) {
      console.error('[announcement.service] archiveAnnouncement:', error?.message);
      return { ok: false };
    }

    await this.writeAuditLog({
      userName,
      userRole,
      action: 'Archived Announcement',
      detail: `"${data.title}" was archived by ${userName}`,
      metadata: { announcement_id: id, archived_by: userName },
    });

    return { ok: true };
  }

  async restoreAnnouncement(id: string, userName: string, userRole: string): Promise<{ ok: boolean }> {
    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .update({ status: 'active', archived_at: null, archived_by: null })
      .eq('id', id)
      .eq('status', 'archived')
      .select('title')
      .single();

    if (error || !data) {
      console.error('[announcement.service] restoreAnnouncement:', error?.message);
      return { ok: false };
    }

    await this.writeAuditLog({
      userName,
      userRole,
      action: 'Restored Archived Announcement',
      detail: `"${data.title}" was restored from archive by ${userName}`,
      metadata: { announcement_id: id, restored_by: userName },
    });

    return { ok: true };
  }

  async setPinned(
    id: string,
    pinned: boolean,
    userName: string,
    userRole: string,
  ): Promise<Announcement | null> {
    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .update({ pinned, pinned_at: pinned ? new Date().toISOString() : null })
      .eq('id', id)
      .eq('status', 'active')
      .select()
      .single();

    if (error || !data) {
      console.error('[announcement.service] setPinned:', error?.message);
      return null;
    }

    await this.writeAuditLog({
      userName,
      userRole,
      action: pinned ? 'Pinned Announcement' : 'Unpinned Announcement',
      detail: `"${data.title}" was ${pinned ? 'pinned to' : 'unpinned from'} the top of the board by ${userName}`,
      metadata: { announcement_id: id, pinned },
    });

    return this.toAnnouncement(data);
  }

  async updateAnnouncement(
    id: string,
    body: {
      title?: string;
      content?: string;
      priority?: Announcement['priority'];
      category?: Announcement['category'];
      startDate?: string;
      endDate?: string;
    },
    userName: string,
    userRole: string,
  ): Promise<Announcement | null> {
    const updates: Record<string, any> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.category !== undefined) updates.category = body.category;
    if (body.startDate !== undefined) updates.start_date = body.startDate;
    if ('endDate' in body) updates.end_date = body.endDate ?? null;

    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      console.error('[announcement.service] updateAnnouncement:', error?.message);
      return null;
    }

    await this.writeAuditLog({
      userName,
      userRole,
      action: 'Edited Announcement',
      detail: `"${data.title}" was edited by ${userName}`,
      metadata: { announcement_id: id, changes: body },
    });

    return this.toAnnouncement(data);
  }
}
