import { Controller, Get, Post, Delete, Body, Param, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { AnnouncementService } from '../services/announcement.service';

@Controller('announcements')
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Get()
  async getAnnouncements(@Res() res: Response) {
    const announcements = await this.announcementService.getAnnouncements();
    return res.status(HttpStatus.OK).json(announcements);
  }

  @Post()
  async createAnnouncement(@Body() body: any, @Res() res: Response) {
    const created = await this.announcementService.createAnnouncement(body);
    if (!created) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to create announcement.' });
    }
    return res.status(HttpStatus.CREATED).json(created);
  }

  @Delete(':id')
  async deleteAnnouncement(@Param('id') id: string, @Res() res: Response) {
    await this.announcementService.deleteAnnouncement(id);
    return res.status(HttpStatus.OK).json({ ok: true });
  }
}
