import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Headers,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ScenarioService,
  CreateInstitutionScenarioDto,
  CreatePriestScenarioDto,
  CreateDigitalTwinScenarioDto,
} from '../../../services/scenario.service';
import { AuditLogService } from '../../../services/audit-log.service';
import * as jwt from 'jsonwebtoken';

function callerFromReq(req: Request) {
  return {
    name: (req.headers['x-user-name'] as string) || 'Unknown',
    role: (req.headers['x-user-role'] as string) || 'unknown',
  };
}

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return (req.socket as any)?.remoteAddress ?? 'unknown';
}

@Controller('scenarios')
export class ScenarioGatewayController {
  constructor(
    private readonly scenarioService: ScenarioService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private extractUserIdFromAuth(authorization: string | undefined): string {
    if (!authorization) throw new BadRequestException('Missing authorization header');

    try {
      const token = authorization.replace('Bearer ', '');

      // Demo/offline sessions send `Bearer demo-<userId>` (see frontend api-client)
      if (token.startsWith('demo-')) {
        const demoUserId = token.slice('demo-'.length);
        if (!demoUserId) throw new BadRequestException('Invalid demo token: no user ID');
        return demoUserId;
      }

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
    @Req() req: Request,
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    const result = await this.scenarioService.createInstitutionScenario(userId, dto);
    const { name, role } = callerFromReq(req);
    await this.auditLogService.logEvent({
      userName: name,
      userRole: role,
      category: 'analytics',
      severity: 'success',
      action: 'Scenario Saved',
      detail: `Institution scenario "${dto.name}" saved for ${dto.institutionName} (${dto.institutionType}) by ${name}`,
      entity: dto.institutionName,
      ipAddress: clientIp(req),
      metadata: { scenarioId: result.id, riskLevel: dto.riskLevel, timelineMonths: dto.timelineMonths },
    });
    return result;
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
    @Req() req: Request,
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    await this.scenarioService.deleteInstitutionScenario(scenarioId, userId);
    const { name, role } = callerFromReq(req);
    await this.auditLogService.logEvent({
      userName: name,
      userRole: role,
      category: 'analytics',
      severity: 'warning',
      action: 'Scenario Deleted',
      detail: `Institution scenario ${scenarioId} deleted by ${name}`,
      ipAddress: clientIp(req),
      metadata: { scenarioId },
    });
    return { success: true };
  }

  @Patch('institution/:id/archive')
  async archiveInstitutionScenario(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') scenarioId: string,
    @Body() body: { isArchived: boolean },
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    return this.scenarioService.archiveInstitutionScenario(scenarioId, userId, body.isArchived);
  }

  // ===== DIGITAL TWIN SCENARIOS =====

  @Post('digital-twin')
  async createDigitalTwinScenario(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateDigitalTwinScenarioDto,
    @Req() req: Request,
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    const result = await this.scenarioService.createDigitalTwinScenario(userId, dto);
    const { name, role } = callerFromReq(req);
    await this.auditLogService.logEvent({
      userName: name,
      userRole: role,
      category: 'analytics',
      severity: 'success',
      action: 'Digital Twin Scenario Saved',
      detail: `Digital Twin scenario "${dto.name}" saved for ${dto.institutionName} by ${name}`,
      entity: dto.institutionName,
      ipAddress: clientIp(req),
      metadata: { scenarioId: result.id, institutionType: dto.institutionType },
    });
    return result;
  }

  @Get('digital-twin')
  async listDigitalTwinScenarios(@Headers('authorization') authorization: string | undefined) {
    const userId = this.extractUserIdFromAuth(authorization);
    return this.scenarioService.listDigitalTwinScenarios(userId);
  }

  @Get('digital-twin/:id')
  async getDigitalTwinScenario(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') scenarioId: string,
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    return this.scenarioService.getDigitalTwinScenario(scenarioId, userId);
  }

  @Delete('digital-twin/:id')
  async deleteDigitalTwinScenario(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') scenarioId: string,
    @Req() req: Request,
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    await this.scenarioService.deleteDigitalTwinScenario(scenarioId, userId);
    const { name, role } = callerFromReq(req);
    await this.auditLogService.logEvent({
      userName: name,
      userRole: role,
      category: 'analytics',
      severity: 'warning',
      action: 'Digital Twin Scenario Deleted',
      detail: `Digital Twin scenario ${scenarioId} deleted by ${name}`,
      ipAddress: clientIp(req),
      metadata: { scenarioId },
    });
    return { success: true };
  }

  // ===== PRIEST SCENARIOS =====

  @Post('priest')
  async createPriestScenario(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreatePriestScenarioDto,
    @Req() req: Request,
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    const result = await this.scenarioService.createPriestScenario(userId, dto);
    const { name, role } = callerFromReq(req);
    await this.auditLogService.logEvent({
      userName: name,
      userRole: role,
      category: 'analytics',
      severity: 'success',
      action: 'Priest Scenario Saved',
      detail: `Priest reassignment scenario "${dto.name}" saved — ${dto.priestName} → ${dto.targetParishName} by ${name}`,
      entity: dto.targetParishName,
      ipAddress: clientIp(req),
      metadata: { scenarioId: result.id, priestName: dto.priestName, targetParish: dto.targetParishName, riskBand: dto.riskBand },
    });
    return result;
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
    @Req() req: Request,
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    await this.scenarioService.deletePriestScenario(scenarioId, userId);
    const { name, role } = callerFromReq(req);
    await this.auditLogService.logEvent({
      userName: name,
      userRole: role,
      category: 'analytics',
      severity: 'warning',
      action: 'Priest Scenario Deleted',
      detail: `Priest reassignment scenario ${scenarioId} deleted by ${name}`,
      ipAddress: clientIp(req),
      metadata: { scenarioId },
    });
    return { success: true };
  }

  @Patch('priest/:id/archive')
  async archivePriestScenario(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') scenarioId: string,
    @Body() body: { isArchived: boolean },
  ) {
    const userId = this.extractUserIdFromAuth(authorization);
    return this.scenarioService.archivePriestScenario(scenarioId, userId, body.isArchived);
  }
}
