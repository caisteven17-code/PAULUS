import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Services
import { SupabaseService } from './services/supabase.service';
import { AppAuthService } from './services/auth.service';
import { EntityService } from './services/entity.service';
import { FinancialService } from './services/financial.service';
import { ProjectService } from './services/project.service';
import { AnalyticsService } from './services/analytics.service';

// Controllers
import { AuthController } from './controllers/auth.controller';
import { EntityController } from './controllers/entity.controller';
import { FinancialController } from './controllers/financial.controller';
import { ProjectController } from './controllers/project.controller';
import { AnalyticsController } from './controllers/analytics.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AuthController, EntityController, FinancialController, ProjectController, AnalyticsController],
  providers: [SupabaseService, AppAuthService, EntityService, FinancialService, ProjectService, AnalyticsService],
  exports: [SupabaseService, AppAuthService, EntityService, FinancialService, ProjectService, AnalyticsService],
})
export class AppModule {}
