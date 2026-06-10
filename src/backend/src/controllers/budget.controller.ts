import { Controller, Get, Post, Body, Query, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { BudgetService } from '../services/budget.service';

@Controller('budgets')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

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
  async saveBudgets(@Body() body: any, @Res() res: Response) {
    const saved = await this.budgetService.saveBudgets(body ?? {});
    if (!saved) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Failed to save budget. Check the institution and year.' });
    }
    return res.status(HttpStatus.CREATED).json(saved);
  }
}
