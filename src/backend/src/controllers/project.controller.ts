import { Controller, Get, Post, Delete, Body, Query, Param, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ProjectService } from '../services/project.service';
import { Project, Donation, ProjectExpense } from '../types';

@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

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
  async saveProject(@Body() project: Project, @Res() res: Response) {
    try {
      const saved = await this.projectService.saveProject(project);
      return res.status(HttpStatus.OK).json(saved);
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: error?.message ?? 'Project save failed.',
      });
    }
  }

  @Delete(':id')
  async deleteProject(@Param('id') id: string, @Res() res: Response) {
    await this.projectService.deleteProject(id);
    return res.status(HttpStatus.OK).json({ ok: true });
  }

  @Get('donations')
  async getDonations(@Query('projectId') projectId: string, @Res() res: Response) {
    const donations = await this.projectService.getDonations(projectId);
    return res.status(HttpStatus.OK).json(donations);
  }

  @Post('donations')
  async saveDonation(@Body() donation: Donation, @Res() res: Response) {
    const saved = await this.projectService.saveDonation(donation);
    return res.status(HttpStatus.OK).json(saved);
  }

  @Get('expenses')
  async getExpenses(@Query('projectId') projectId: string, @Res() res: Response) {
    const expenses = await this.projectService.getExpenses(projectId);
    return res.status(HttpStatus.OK).json(expenses);
  }

  @Post('expenses')
  async saveExpense(@Body() expense: ProjectExpense, @Res() res: Response) {
    const saved = await this.projectService.saveExpense(expense);
    return res.status(HttpStatus.OK).json(saved);
  }
}
