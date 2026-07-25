import { Controller, Get, Post, Patch, Delete, Body, Query, Param, Req, Res, HttpStatus, ForbiddenException } from '@nestjs/common';
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

const PARISH_MANAGER_ROLES = new Set(['bishop', 'chancellor', 'diocesan_oeconomus', 'admin']);
const PRIEST_REASSIGNMENT_ROLES = new Set(['bishop', 'chancellor', 'diocesan_oeconomus', 'admin']);

function requireParishManager(req: Request) {
  const role = String(req.headers['x-user-role'] ?? '').trim().toLowerCase();
  if (!PARISH_MANAGER_ROLES.has(role)) {
    throw new ForbiddenException('You do not have permission to manage parishes.');
  }
}

function requirePriestReassignmentManager(req: Request) {
  const role = String(req.headers['x-user-role'] ?? '').trim().toLowerCase();
  if (!PRIEST_REASSIGNMENT_ROLES.has(role)) {
    throw new ForbiddenException('You do not have permission to reassign Parish Priests.');
  }
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
      const status = err instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      return res.status(status).json({ error: err.message });
    }
  }

  @Get('financial-profiles')
  async getFinancialProfiles(@Query('type') type: 'parish' | 'seminary' | 'school' | undefined, @Res() res: Response) {
    try {
      const data = await this.entityService.getFinancialProfiles(type as any);
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      const status = err instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      return res.status(status).json({ error: err.message });
    }
  }

  @Get('health-records')
  async getPriestHealthRecords(@Res() res: Response) {
    try {
      const data = await this.entityService.getPriestHealthRecords();
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      const status = err instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      return res.status(status).json({ error: err.message });
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

  @Get('admin/parish-renumbering/preview')
  async previewParishRenumbering(
    @Query('sourceCode') sourceCode: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      requireParishManager(req);
      const data = await this.entityService.previewParishRenumbering(sourceCode);
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      const status = err instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      return res.status(status).json({ error: err.message });
    }
  }

  @Get('admin/parish-renumbering/history')
  async getParishRenumberingHistory(@Req() req: Request, @Res() res: Response) {
    try {
      requireParishManager(req);
      const data = await this.entityService.getParishRenumberingHistory();
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      const status = err instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      return res.status(status).json({ error: err.message });
    }
  }

  @Post('admin/parish-renumbering/execute')
  async executeParishRenumbering(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      requireParishManager(req);
      const userId = req.headers['x-user-id'] as string | undefined;
      const data = await this.entityService.createParishWithRenumbering(body, userId);
      const { name, role } = caller(req);
      try {
        await this.auditLogService.logEvent({
          userId,
          userName: name,
          userRole: role,
          category: 'system',
          severity: 'success',
          action: 'Parish Created and Source Codes Renumbered',
          detail: `${body?.parish?.name || 'New parish'} created at ${body?.requestedSourceCode} by ${name}`,
          institutionId: data?.id,
          entity: body?.parish?.name,
          ipAddress: clientIp(req),
          metadata: {
            batchId: data?.renumbering?.batchId,
          requestedSourceCode: body?.requestedSourceCode,
          affectedParishCount: data?.renumbering?.affectedParishCount,
          },
        });
      } catch (auditError) {
        // The renumbering transaction has already completed. Do not tell the
        // user it failed merely because the secondary audit write was delayed.
        console.error('Parish renumbering completed but audit logging failed:', auditError);
      }
      return res.status(HttpStatus.CREATED).json(data);
    } catch (err: any) {
      const status = err instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      return res.status(status).json({ error: err.message });
    }
  }

  @Post('admin/parish-renumbering/bulk-preview')
  async previewBulkParishReorder(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      requireParishManager(req);
      const data = await this.entityService.previewBulkParishReorder(body?.district, body?.order);
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      const status = err instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      return res.status(status).json({ error: err.message });
    }
  }

  @Post('admin/parish-renumbering/bulk-execute')
  async executeBulkParishReorder(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      requireParishManager(req);
      const userId = req.headers['x-user-id'] as string | undefined;
      const data = await this.entityService.executeBulkParishReorder(body, userId);
      const { name, role } = caller(req);
      try {
        await this.auditLogService.logEvent({
          userId,
          userName: name,
          userRole: role,
          category: 'system',
          severity: 'success',
          action: 'Parish Source Codes Bulk Reordered',
          detail: `${data?.affectedParishCount || 0} parish source code(s) reordered in ${data?.district || body?.district} by ${name}`,
          ipAddress: clientIp(req),
          metadata: {
            batchId: data?.batchId,
            district: data?.district || body?.district,
            affectedParishCount: data?.affectedParishCount,
          },
        });
      } catch (auditError) {
        console.error('Bulk parish reorder completed but audit logging failed:', auditError);
      }
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      const status = err instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      return res.status(status).json({ error: err.message });
    }
  }

  @Get('admin/priest-reassignment/workspace')
  async getPriestAssignmentWorkspace(@Req() req: Request, @Res() res: Response) {
    try {
      requirePriestReassignmentManager(req);
      const data = await this.entityService.getPriestAssignmentWorkspace();
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      const status = err instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      return res.status(status).json({ error: err.message });
    }
  }

  @Post('admin/priest-reassignment/preview')
  async previewPriestReassignment(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      requirePriestReassignmentManager(req);
      const data = await this.entityService.previewPriestReassignment(body?.moves);
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      const status = err instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      return res.status(status).json({ error: err.message });
    }
  }

  @Post('admin/priest-reassignment/execute')
  async executePriestReassignment(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      requirePriestReassignmentManager(req);
      const userId = req.headers['x-user-id'] as string | undefined;
      const data = await this.entityService.executePriestReassignment(body?.moves, userId);
      const { name, role } = caller(req);
      try {
        await this.auditLogService.logEvent({
          userId,
          userName: name,
          userRole: role,
          category: 'system',
          severity: 'success',
          action: 'Parish Priests Reassigned',
          detail: `${data?.assignmentCount || 0} Parish Priest assignment(s) changed by ${name}`,
          ipAddress: clientIp(req),
          metadata: {
            batchId: data?.batchId,
            assignmentCount: data?.assignmentCount,
            vacancyCount: data?.vacancyCount,
          },
        });
      } catch (auditError) {
        console.error('Priest reassignment completed but audit logging failed:', auditError);
      }
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      const status = err instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      return res.status(status).json({ error: err.message });
    }
  }

  @Get('admin/priest-reassignment/history')
  async getPriestReassignmentHistory(@Req() req: Request, @Res() res: Response) {
    try {
      requirePriestReassignmentManager(req);
      const data = await this.entityService.getPriestReassignmentHistory();
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      const status = err instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      return res.status(status).json({ error: err.message });
    }
  }

  @Post('admin')
  async createAdminEntity(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      const { type, ...entity } = body;
      if (type === 'parish') requireParishManager(req);
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
      const status = err instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      return res.status(status).json({ error: err.message });
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
      const resolvedType = type ?? typeParam;
      if (resolvedType === 'parish') requireParishManager(req);
      const data = await this.entityService.updateAdminEntity(resolvedType, id ?? idParam, updates);
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
      const status = err instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      return res.status(status).json({ error: err.message });
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
      if (type === 'parish') requireParishManager(req);
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
      const status = err instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      return res.status(status).json({ error: err.message });
    }
  }
}
