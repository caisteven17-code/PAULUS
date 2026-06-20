import { Controller, Get, Post, Patch, Delete, Body, Query, Param, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { EntityService } from '../services/entity.service';
import { AuditLogService } from '../services/audit-log.service';

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

function caller(req: Request) {
  return {
    name: (req.headers['x-user-name'] as string) || 'Unknown',
    role: (req.headers['x-user-role'] as string) || 'unknown',
  };
}

@Controller('entities')
export class EntityController {
  constructor(
    private readonly entityService: EntityService,
    private readonly auditLogService: AuditLogService,
  ) {}

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

  @Get('geo')
  async getGeoInstitutions(@Res() res: Response) {
    try {
      const data = await this.entityService.getGeoInstitutions();
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }

  @Get('financial-profiles')
  async getFinancialProfiles(@Query('type') type: 'parish' | 'seminary' | 'school' | undefined, @Res() res: Response) {
    try {
      const data = await this.entityService.getFinancialProfiles(type as any);
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }

  @Get('health-records')
  async getPriestHealthRecords(@Res() res: Response) {
    try {
      const data = await this.entityService.getPriestHealthRecords();
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }

  @Post('health-records')
  async savePriestHealthRecord(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      const data = await this.entityService.savePriestHealthRecord(body);
      const { name, role } = caller(req);
      await this.auditLogService.logEvent({
        userName: name,
        userRole: role,
        category: 'users',
        severity: 'info',
        action: 'Health Record Saved',
        detail: `Priest health record saved by ${name}`,
        ipAddress: clientIp(req),
        metadata: { priestId: body.priestId, recordId: data?.id },
      });
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }

  @Delete('health-records/:id')
  async deletePriestHealthRecord(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    try {
      await this.entityService.deletePriestHealthRecord(id);
      const { name, role } = caller(req);
      await this.auditLogService.logEvent({
        userName: name,
        userRole: role,
        category: 'users',
        severity: 'warning',
        action: 'Health Record Deleted',
        detail: `Priest health record ${id} deleted by ${name}`,
        ipAddress: clientIp(req),
        metadata: { recordId: id },
      });
      return res.status(HttpStatus.OK).json({ ok: true });
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
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
  async createAdminEntity(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      const { type, ...entity } = body;
      const data = await this.entityService.createAdminEntity(type, entity);
      const { name, role } = caller(req);
      await this.auditLogService.logEvent({
        userName: name,
        userRole: role,
        category: 'system',
        severity: 'success',
        action: 'Institution Created',
        detail: `New ${type} "${entity.name || 'unknown'}" created by ${name}`,
        entity: entity.name || undefined,
        ipAddress: clientIp(req),
        metadata: { type, name: entity.name },
      });
      return res.status(HttpStatus.CREATED).json(data);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }

  @Patch('admin')
  async updateAdminEntity(
    @Body() body: any,
    @Query('type') typeParam: 'parish' | 'seminary' | 'school' | undefined,
    @Query('id') idParam: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const { type, id, ...updates } = body ?? {};
      const data = await this.entityService.updateAdminEntity(type ?? typeParam, id ?? idParam, updates);
      const { name, role } = caller(req);
      await this.auditLogService.logEvent({
        userName: name,
        userRole: role,
        category: 'system',
        severity: 'info',
        action: 'Institution Updated',
        detail: `${type ?? typeParam} updated by ${name}`,
        ipAddress: clientIp(req),
        metadata: { type: type ?? typeParam, id: id ?? idParam, updates },
      });
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }

  @Patch('my-institution')
  async updateOwnInstitution(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      const { type, id, contactNumber, email } = body;
      const data = await this.entityService.updateOwnInstitution(type, id, contactNumber, email);
      const { name, role } = caller(req);
      await this.auditLogService.logEvent({
        userName: name,
        userRole: role,
        category: 'system',
        severity: 'info',
        action: 'Institution Contact Updated',
        detail: `${name} updated contact details for their ${type}`,
        ipAddress: clientIp(req),
        metadata: { type, id, hasContactNumber: !!contactNumber, hasEmail: !!email },
      });
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }

  @Delete('admin')
  async deleteAdminEntity(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      const { type, id, hard } = body;
      const data = await this.entityService.deleteAdminEntity(type, id, hard === true);
      const { name, role } = caller(req);
      await this.auditLogService.logEvent({
        userName: name,
        userRole: role,
        category: 'system',
        severity: hard === true ? 'error' : 'warning',
        action: hard === true ? 'Institution Permanently Deleted' : 'Institution Archived',
        detail: `${type} ${id} was ${hard === true ? 'permanently deleted' : 'archived'} by ${name}`,
        ipAddress: clientIp(req),
        metadata: { type, id, hard: hard === true },
      });
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }
}
