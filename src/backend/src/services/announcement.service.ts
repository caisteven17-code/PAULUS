import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { AuditLogService } from './audit-log.service';
import { buildFieldChanges } from './field-changes';

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
  audienceType: 'general' | 'specific';
  recipientIds: string[];
  recipientCount: number;
  attachments: AnnouncementAttachment[];
}

export interface AnnouncementAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  kind: 'image' | 'document';
  displayOrder: number;
  altText: string | null;
}

const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

@Injectable()
export class AnnouncementService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private toAnnouncement(row: any): Announcement {
    const recipients = row.announcement_recipients ?? [];
    const attachments = row.announcement_attachments ?? [];
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
      audienceType: row.audience_type === 'specific' ? 'specific' : 'general',
      recipientIds: recipients.map((item: any) => item.profile_id),
      recipientCount: recipients.length,
      attachments: attachments
        .map((item: any) => ({
          id: item.id,
          originalName: item.original_name,
          mimeType: item.mime_type,
          fileSize: Number(item.file_size),
          kind: item.attachment_kind,
          displayOrder: item.display_order,
          altText: item.alt_text ?? null,
        }))
        .sort((a: AnnouncementAttachment, b: AnnouncementAttachment) => a.displayOrder - b.displayOrder),
    };
  }

  private async enrichRows(rows: any[]): Promise<any[]> {
    if (!rows.length) return rows;
    const ids = rows.map((row) => row.id);
    const [{ data: recipients }, { data: attachments }] = await Promise.all([
      this.supabaseService.admin.schema('diocese').from('announcement_recipients').select('announcement_id, profile_id').in('announcement_id', ids),
      this.supabaseService.admin.schema('diocese').from('announcement_attachments').select('id, announcement_id, original_name, mime_type, file_size, attachment_kind, display_order, alt_text').in('announcement_id', ids),
    ]);
    return rows.map((row) => ({
      ...row,
      announcement_recipients: (recipients ?? []).filter((item: any) => item.announcement_id === row.id),
      announcement_attachments: (attachments ?? []).filter((item: any) => item.announcement_id === row.id),
    }));
  }

  async resolveProfileId(authorization?: string, fallbackName?: string, fallbackId?: string): Promise<string | null> {
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (token && !token.startsWith('demo-')) {
      const { data } = await this.supabaseService.admin.auth.getUser(token);
      if (data.user) {
        const { data: profile } = await this.supabaseService.admin.schema('diocese').from('profiles')
          .select('id').eq('external_auth_id', data.user.id).maybeSingle();
        if (profile?.id) return profile.id;
        const { data: legacyAuthProfile } = await this.supabaseService.admin.schema('diocese').from('profiles')
          .select('id').eq('auth_user_id', data.user.id).maybeSingle();
        if (legacyAuthProfile?.id) return legacyAuthProfile.id;
        const { data: directProfile } = await this.supabaseService.admin.schema('diocese').from('profiles')
          .select('id').eq('id', data.user.id).maybeSingle();
        if (directProfile?.id) return directProfile.id;
      }
    }
    if (fallbackId) {
      const { data: directProfile } = await this.supabaseService.admin.schema('diocese').from('profiles')
        .select('id').eq('id', fallbackId).maybeSingle();
      if (directProfile?.id) return directProfile.id;
    }
    if (fallbackName) {
      const { data: profile } = await this.supabaseService.admin.schema('diocese').from('profiles')
        .select('id').ilike('full_name', fallbackName).limit(1).maybeSingle();
      if (profile?.id) return profile.id;
      const { data: legacyProfile } = await this.supabaseService.admin.schema('diocese').from('profiles')
        .select('id').ilike('display_name', fallbackName).limit(1).maybeSingle();
      return legacyProfile?.id ?? null;
    }
    return null;
  }

  async getAudienceOptions(): Promise<Array<{ id: string; name: string; role: string; institution: string }>> {
    const { data, error } = await this.supabaseService.admin.schema('diocese').from('profiles')
      .select('id, full_name, role_id, institutions(name)').eq('is_active', true).order('full_name');
    if (error) return [];
    return (data ?? []).map((p: any) => ({ id: p.id, name: p.full_name || 'Unnamed user', role: p.role_id || '', institution: p.institutions?.name || '' }));
  }

  private async writeAuditLog(payload: {
    userName: string;
    userRole: string;
    action: string;
    detail: string;
    severity?: 'info' | 'warning' | 'error' | 'success';
    entity?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.auditLogService.logEvent({
      userName: payload.userName,
      userRole: payload.userRole,
      category: 'announcements',
      severity: payload.severity ?? 'info',
      action: payload.action,
      detail: payload.detail,
      entity: payload.entity,
      metadata: payload.metadata,
    });
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

  async getAnnouncements(profileId: string | null = null, feed: 'all' | 'general' | 'for-me' | 'specific' = 'all'): Promise<Announcement[]> {
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
    const enriched = await this.enrichRows(data ?? []);
    return enriched
      .filter((row: any) => !row.end_date || new Date(row.end_date).getTime() >= Date.now())
      .filter((row: any) => {
        if (feed === 'general') return row.audience_type !== 'specific';
        if (feed === 'specific') return row.audience_type === 'specific';
        if (feed === 'for-me') return row.audience_type === 'specific' && profileId && row.announcement_recipients?.some((r: any) => r.profile_id === profileId);
        return row.audience_type !== 'specific' || (profileId && row.announcement_recipients?.some((r: any) => r.profile_id === profileId));
      })
      .map((row: any) => this.toAnnouncement(row))
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
    audienceType?: 'general' | 'specific';
    recipientIds?: string[];
  }): Promise<Announcement | null> {
    const isPublishing = body.status === 'active';
    const now = new Date().toISOString();

    if (isPublishing && body.audienceType === 'specific' && !body.recipientIds?.length) return null;
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
        audience_type: body.audienceType ?? 'general',
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('[announcement.service] createAnnouncement:', error?.message);
      throw new Error(error?.message || 'The announcement row was not created.');
    }

    const createdRow: any = data;
    if (body.audienceType === 'specific' && body.recipientIds?.length) {
      const recipients = [...new Set(body.recipientIds)].map((profile_id) => ({ announcement_id: createdRow.id, profile_id }));
      const { error: recipientError } = await this.supabaseService.admin.schema('diocese').from('announcement_recipients').insert(recipients);
      if (recipientError) {
        await this.supabaseService.admin.schema('diocese').from('announcements').delete().eq('id', createdRow.id);
        console.error('[announcement.service] createAnnouncement recipients:', recipientError.message);
        throw new Error(recipientError.message);
      }
      createdRow.announcement_recipients = recipients;
    }
    await this.writeAuditLog({
      userName: body.author,
      userRole: body.authorRole,
      action: isPublishing ? 'Announcement Published' : 'Announcement Saved as Draft',
      detail: `"${body.title}" was ${isPublishing ? 'published' : 'saved as draft'} by ${body.author}`,
      severity: isPublishing ? 'success' : 'info',
      metadata: { announcement_id: createdRow.id, title: body.title, status: body.status },
    });

    return this.toAnnouncement(createdRow);
  }

  async publishDraft(id: string, userName: string, userRole: string): Promise<Announcement | null> {
    const now = new Date().toISOString();

    const { data: draft } = await this.supabaseService.admin.schema('diocese').from('announcements')
      .select('audience_type').eq('id', id).eq('status', 'draft').maybeSingle();
    if (!draft) return null;
    if (draft.audience_type === 'specific') {
      const { count } = await this.supabaseService.admin.schema('diocese').from('announcement_recipients')
        .select('id', { count: 'exact', head: true }).eq('announcement_id', id);
      if (!count) return null;
    }

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
      action: 'Draft Published',
      detail: `Draft "${data.title}" was published by ${userName}`,
      severity: 'success',
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

    const { data: storedAttachments } = await this.supabaseService.admin.schema('diocese')
      .from('announcement_attachments').select('storage_path').eq('announcement_id', id);
    const { error: deleteError } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[announcement.service] hardDeleteAnnouncement:', deleteError.message);
      return { ok: false, reason: 'Delete failed.' };
    }
    const storagePaths = (storedAttachments ?? []).map((item: any) => item.storage_path).filter(Boolean);
    if (storagePaths.length) await this.supabaseService.admin.storage.from('announcement-attachments').remove(storagePaths);

    // Always write an audit log — this is the only permanent record after hard delete
    await this.writeAuditLog({
      userName,
      userRole,
      action: isDraft ? 'Announcement Draft Deleted' : 'Announcement Permanently Deleted',
      detail: `"${row.title}" was permanently deleted by ${userName}`,
      severity: 'warning',
      metadata: {
        announcement_id: id,
        title: row.title,
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
      action: 'Announcement Archived',
      detail: `"${data.title}" was archived by ${userName}`,
      severity: 'warning',
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
      action: 'Announcement Restored',
      detail: `"${data.title}" was restored from archive by ${userName}`,
      severity: 'info',
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
      action: pinned ? 'Announcement Pinned' : 'Announcement Unpinned',
      detail: `"${data.title}" was ${pinned ? 'pinned to' : 'unpinned from'} the board by ${userName}`,
      severity: 'info',
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
      audienceType?: 'general' | 'specific';
      recipientIds?: string[];
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
    if (body.audienceType !== undefined) updates.audience_type = body.audienceType;
    if (body.audienceType === 'specific' && body.recipientIds !== undefined && body.recipientIds.length === 0) return null;

    // Snapshot the row before the update so the audit log can show before -> after.
    const { data: before } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[announcement.service] updateAnnouncement:', error?.message);
      return null;
    }

    const updatedRow: any = data;
    if (body.recipientIds !== undefined) {
      await this.supabaseService.admin.schema('diocese').from('announcement_recipients').delete().eq('announcement_id', id);
      if ((body.audienceType ?? updatedRow.audience_type) === 'specific') {
        const recipients = [...new Set(body.recipientIds)].map((profile_id) => ({ announcement_id: id, profile_id }));
        if (recipients.length) await this.supabaseService.admin.schema('diocese').from('announcement_recipients').insert(recipients);
        updatedRow.announcement_recipients = recipients;
      } else updatedRow.announcement_recipients = [];
    }
    const changes = buildFieldChanges(before, updatedRow, Object.keys(updates));

    await this.writeAuditLog({
      userName,
      userRole,
      action: 'Announcement Edited',
      detail: `"${updatedRow.title}" was edited by ${userName}`,
      severity: 'info',
      metadata: { announcement_id: id, changes },
    });

    return this.toAnnouncement(updatedRow);
  }
}
