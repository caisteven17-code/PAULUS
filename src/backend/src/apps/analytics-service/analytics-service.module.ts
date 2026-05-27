import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsController } from '../../controllers/analytics.controller';
import { AnalyticsService } from '../../services/analytics.service';
import { FinancialService } from '../../services/financial.service';
import { SupabaseService } from '../../services/supabase.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AnalyticsController],
  providers: [SupabaseService, FinancialService, AnalyticsService],
})
export class AnalyticsServiceModule {}
