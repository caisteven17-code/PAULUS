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
  createdAt: number;
}

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
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  async getAnnouncements(): Promise<Announcement[]> {
    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[announcement.service] getAnnouncements:', error.message);
      return [];
    }

    return (data ?? []).map((row) => this.toAnnouncement(row));
  }

  async createAnnouncement(announcement: Omit<Announcement, 'id' | 'createdAt'>): Promise<Announcement | null> {
    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('announcements')
      .insert({
        title: announcement.title,
        content: announcement.content,
        author: announcement.author,
        author_role: announcement.authorRole,
        priority: announcement.priority,
        category: announcement.category,
      })
      .select()
      .single();

    if (error || !data) {
      console.error('[announcement.service] createAnnouncement:', error?.message);
      return null;
    }

    return this.toAnnouncement(data);
  }

  async deleteAnnouncement(id: string): Promise<void> {
    const { error } = await this.supabaseService.admin.schema('diocese').from('announcements').delete().eq('id', id);

    if (error) {
      console.error('[announcement.service] deleteAnnouncement:', error.message);
    }
  }
}
