import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { ScenarioService, CreateInstitutionScenarioDto, CreatePriestScenarioDto } from '../../../services/scenario.service';
import * as jwt from 'jsonwebtoken';

@Controller('scenarios')
export class ScenarioGatewayController {
  constructor(private readonly scenarioService: ScenarioService) {}

  private extractUserIdFromAuth(authorization: string | undefined): string {
    if (!authorization) throw new BadRequestException('Missing authorization header');

    try {
      const token = authorization.replace('Bearer ', '');
      // Decode without verification (gateway trusts upstream auth)
      const decoded = jwt.decode(token) as any;
      const userId = decoded?.sub || decoded?.id;

      if (!userId) throw new BadRequestException('Invalid token: no user ID');
      return userId;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Invalid authorization token');
    }
  }

  // ===== INSTITUTION SCENARIOS =====

  @Post('institution')
  async createInstitutionScenario(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateInstitutionScenarioDto,
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    return this.scenarioService.createInstitutionScenario(userId, dto);
  }

  @Get('institution')
  async listInstitutionScenarios(@Headers('authorization') authorization: string | undefined) {
    const userId = this.extractUserIdFromAuth(authorization);
    return this.scenarioService.listInstitutionScenarios(userId);
  }

  @Get('institution/:id')
  async getInstitutionScenario(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') scenarioId: string,
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    return this.scenarioService.getInstitutionScenario(scenarioId, userId);
  }

  @Delete('institution/:id')
  async deleteInstitutionScenario(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') scenarioId: string,
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    await this.scenarioService.deleteInstitutionScenario(scenarioId, userId);
    return { success: true };
  }

  @Patch('institution/:id')
  async archiveInstitutionScenario(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') scenarioId: string,
    @Body() body: { isArchived: boolean },
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    return this.scenarioService.archiveInstitutionScenario(scenarioId, userId, body.isArchived);
  }

  // ===== PRIEST SCENARIOS =====

  @Post('priest')
  async createPriestScenario(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreatePriestScenarioDto,
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    return this.scenarioService.createPriestScenario(userId, dto);
  }

  @Get('priest')
  async listPriestScenarios(@Headers('authorization') authorization: string | undefined) {
    const userId = this.extractUserIdFromAuth(authorization);
    return this.scenarioService.listPriestScenarios(userId);
  }

  @Get('priest/:id')
  async getPriestScenario(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') scenarioId: string,
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    return this.scenarioService.getPriestScenario(scenarioId, userId);
  }

  @Delete('priest/:id')
  async deletePriestScenario(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') scenarioId: string,
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    await this.scenarioService.deletePriestScenario(scenarioId, userId);
    return { success: true };
  }

  @Patch('priest/:id')
  async archivePriestScenario(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') scenarioId: string,
    @Body() body: { isArchived: boolean },
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    return this.scenarioService.archivePriestScenario(scenarioId, userId, body.isArchived);
  }
}
