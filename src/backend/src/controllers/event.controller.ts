import { Controller, Get, Post, Body, Query, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { EventService } from '../services/event.service';

@Controller('events')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Get()
  async getEvents(
    @Query('institutionId') institutionId: string | undefined,
    @Query('institutionName') institutionName: string | undefined,
    @Query('institutionType') institutionType: string | undefined,
    @Res() res: Response,
  ) {
    const events = await this.eventService.getEvents({ institutionId, institutionName, institutionType });
    return res.status(HttpStatus.OK).json(events);
  }

  @Post()
  async saveEvent(@Body() body: any, @Res() res: Response) {
    const saved = await this.eventService.saveEvent(body);
    if (!saved) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Failed to save event. Check the institution details.' });
    }
    return res.status(HttpStatus.CREATED).json(saved);
  }
}
