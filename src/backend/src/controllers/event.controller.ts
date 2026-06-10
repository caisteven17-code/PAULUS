import { Controller, Get, Post, Body, Query, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { EventService } from '../services/event.service';

@Controller('events')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Get()
  async getEvents(@Query('institutionId') institutionId: string | undefined, @Res() res: Response) {
    const events = await this.eventService.getEvents(institutionId);
    return res.status(HttpStatus.OK).json(events);
  }

  @Post()
  async saveEvent(@Body() body: any, @Res() res: Response) {
    const saved = await this.eventService.saveEvent(body);
    if (!saved) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to save event.' });
    }
    return res.status(HttpStatus.CREATED).json(saved);
  }
}
