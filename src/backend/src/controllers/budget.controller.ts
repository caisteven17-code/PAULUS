import { Controller, Get, Post, Body, Query, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { BudgetService } from '../services/budget.service';
import { AuditLogService } from '../services/audit-log.service';

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

@Controller('budgets')
export class BudgetController {
  constructor(
    private readonly budgetService: BudgetService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  async getBudgets(
    @Query('institutionId') institutionId: string | undefined,
    @Query('institutionName') institutionName: string | undefined,
    @Query('institutionType') institutionType: string | undefined,
    @Query('year') year: string | undefined,
    @Res() res: Response,
  ) {
    const budgets = await this.budgetService.getBudgets({
      institutionId,
      institutionName,
      institutionType,
      year: year ? Number(year) : undefined,
    });
    return res.status(HttpStatus.OK).json(budgets);
  }

  @Post()
  async saveBudgets(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const saved = await this.budgetService.saveBudgets(body ?? {});
    if (!saved) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Failed to save budget. Check the institution and year.' });
    }

    const userName = (req.headers['x-user-name'] as string) || 'Unknown';
    const userRole = (req.headers['x-user-role'] as string) || 'unknown';
    const institutionName = body.institutionName || saved[0]?.institution_name || 'Unknown institution';
    const year = body.year ?? saved[0]?.year;
    const monthCount = saved.length;
    const total = saved.reduce((sum: number, b: any) => sum + Number(b.amount || 0), 0);

    await this.auditLogService.logEvent({
      userName,
      userRole,
      category: 'finance',
      severity: 'success',
      action: 'Budget Saved',
      detail: `Annual budget for ${institutionName} (${year}) saved — ${monthCount} month${monthCount !== 1 ? 's' : ''}, total ₱${total.toLocaleString()} by ${userName}`,
      entity: institutionName,
      ipAddress: clientIp(req),
      metadata: { institutionName, year, monthCount, total, institutionType: body.institutionType },
    });

    return res.status(HttpStatus.CREATED).json(saved);
  }
}
