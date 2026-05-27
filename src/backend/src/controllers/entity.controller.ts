import { Controller, Get, Post, Patch, Delete, Body, Query, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { EntityService } from '../services/entity.service';

@Controller('entities')
export class EntityController {
  constructor(private readonly entityService: EntityService) {}

  @Get('parishes')
  getParishes() {
    return this.entityService.getParishes();
  }

  @Get('schools')
  getSchools() {
    return this.entityService.getSchools();
  }

  @Get('seminaries')
  getSeminaries() {
    return this.entityService.getSeminaries();
  }

  @Get('all')
  getAll() {
    return this.entityService.getAll();
  }

  @Get('admin')
  async getAdminEntities(
    @Query('type') type: 'parish' | 'seminary' | 'school' | undefined,
    @Query('all') all: string,
    @Res() res: Response,
  ) {
    try {
      const data = await this.entityService.getAdminEntities(type, all === 'true');
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }

  @Post('admin')
  async createAdminEntity(@Body() body: any, @Res() res: Response) {
    try {
      const { type, ...entity } = body;
      const data = await this.entityService.createAdminEntity(type, entity);
      return res.status(HttpStatus.CREATED).json(data);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }

  @Patch('admin')
  async updateAdminEntity(@Body() body: any, @Res() res: Response) {
    try {
      const { type, id, ...updates } = body;
      const data = await this.entityService.updateAdminEntity(type, id, updates);
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }

  @Delete('admin')
  async deleteAdminEntity(@Body() body: any, @Res() res: Response) {
    try {
      const { type, id } = body;
      const data = await this.entityService.deleteAdminEntity(type, id);
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }
}
