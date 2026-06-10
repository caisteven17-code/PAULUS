import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { GatewayHealthController } from './controllers/gateway-health.controller';
import { AuthGatewayController } from './controllers/auth-gateway.controller';
import { EntityGatewayController } from './controllers/entity-gateway.controller';
import { FinancialGatewayController } from './controllers/financial-gateway.controller';
import { ProjectGatewayController } from './controllers/project-gateway.controller';
import { AnalyticsGatewayController } from './controllers/analytics-gateway.controller';
import { AdminGatewayController } from './controllers/admin-gateway.controller';
import { AdminEntitiesGatewayController } from './controllers/admin-entities-gateway.controller';
import { AdminRolesGatewayController } from './controllers/admin-roles-gateway.controller';
import { AnnouncementsGatewayController } from './controllers/announcements-gateway.controller';
import { EventsGatewayController } from './controllers/events-gateway.controller';
import { LiturgicalCalendarGatewayController } from './controllers/liturgical-calendar-gateway.controller';
import { AuditLogGatewayController } from './controllers/audit-log-gateway.controller';
import { ScenarioGatewayController } from './controllers/scenario-gateway.controller';
import { ScenarioService } from '../../services/scenario.service';
import { SupabaseService } from '../../services/supabase.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [
    GatewayHealthController,
    AuthGatewayController,
    EntityGatewayController,
    FinancialGatewayController,
    ProjectGatewayController,
    AnalyticsGatewayController,
    AdminGatewayController,
    AdminEntitiesGatewayController,
    AdminRolesGatewayController,
    AnnouncementsGatewayController,
    EventsGatewayController,
    LiturgicalCalendarGatewayController,
    AuditLogGatewayController,
    ScenarioGatewayController,
  ],
  providers: [ScenarioService, SupabaseService],
})
export class ApiGatewayModule {}
