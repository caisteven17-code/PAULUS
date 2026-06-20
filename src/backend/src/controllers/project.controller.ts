import { Controller, Get, Post, Delete, Body, Query, Param, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { ProjectService } from '../services/project.service';
import { AuditLogService } from '../services/audit-log.service';
import { Project, Donation, ProjectExpense } from '../types';

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

@Controller('projects')
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  async getProjects(
    @Query('entityId') entityId: string,
    @Query('entityType') entityType: string,
    @Res() res: Response,
  ) {
    const projects = await this.projectService.getProjects(entityId, entityType);
    return res.status(HttpStatus.OK).json(projects);
  }

  @Post()
  async saveProject(@Body() project: Project, @Req() req: Request, @Res() res: Response) {
    try {
      const saved = await this.projectService.saveProject(project);
      const { name, role } = caller(req);
      const isNew = !project.id;
      await this.auditLogService.logEvent({
        userName: name,
        userRole: role,
        category: 'projects',
        severity: isNew ? 'success' : 'info',
        action: isNew ? 'Project Created' : 'Project Updated',
        detail: isNew
          ? `New project "${saved.name}" created for ${saved.entityName}`
          : `Project "${saved.name}" was updated by ${name}`,
        entity: saved.entityName || undefined,
        ipAddress: clientIp(req),
        metadata: { projectId: saved.id, name: saved.name, entityType: saved.entityType, status: saved.status },
      });
      return res.status(HttpStatus.OK).json(saved);
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: error?.message ?? 'Project save failed.' });
    }
  }

  @Delete(':id')
  async deleteProject(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { name, role } = caller(req);
    await this.projectService.deleteProject(id);
    await this.auditLogService.logEvent({
      userName: name,
      userRole: role,
      category: 'projects',
      severity: 'warning',
      action: 'Project Deleted',
      detail: `Project ${id} was deleted by ${name}`,
      ipAddress: clientIp(req),
      metadata: { projectId: id },
    });
    return res.status(HttpStatus.OK).json({ ok: true });
  }

  @Get('donations')
  async getDonations(@Query('projectId') projectId: string, @Res() res: Response) {
    const donations = await this.projectService.getDonations(projectId);
    return res.status(HttpStatus.OK).json(donations);
  }

  @Post('donations')
  async saveDonation(@Body() donation: Donation, @Req() req: Request, @Res() res: Response) {
    const saved = await this.projectService.saveDonation(donation);
    const { name, role } = caller(req);
    const isNew = !donation.id;
    await this.auditLogService.logEvent({
      userName: name,
      userRole: role,
      category: 'projects',
      severity: isNew ? 'success' : 'info',
      action: isNew ? 'Donation Added' : 'Donation Updated',
      detail: isNew
        ? `Donation of ₱${Number(saved.amount).toLocaleString()} added by ${saved.donorName || 'Anonymous'}`
        : `Donation record updated by ${name}`,
      ipAddress: clientIp(req),
      metadata: { donationId: saved.id, projectId: saved.projectId, amount: saved.amount, donorName: saved.donorName },
    });
    return res.status(HttpStatus.OK).json(saved);
  }

  @Get('expenses')
  async getExpenses(@Query('projectId') projectId: string, @Res() res: Response) {
    const expenses = await this.projectService.getExpenses(projectId);
    return res.status(HttpStatus.OK).json(expenses);
  }

  @Post('expenses')
  async saveExpense(@Body() expense: ProjectExpense, @Req() req: Request, @Res() res: Response) {
    const saved = await this.projectService.saveExpense(expense);
    const { name, role } = caller(req);
    const isNew = !expense.id;
    await this.auditLogService.logEvent({
      userName: name,
      userRole: role,
      category: 'projects',
      severity: isNew ? 'success' : 'info',
      action: isNew ? 'Expense Added' : 'Expense Updated',
      detail: isNew
        ? `Project expense of ₱${Number(saved.amount).toLocaleString()} recorded — ${saved.description}`
        : `Expense record updated by ${name}`,
      ipAddress: clientIp(req),
      metadata: { expenseId: saved.id, projectId: saved.projectId, amount: saved.amount, description: saved.description },
    });
    return res.status(HttpStatus.OK).json(saved);
  }
}
