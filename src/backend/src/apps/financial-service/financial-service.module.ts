import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FinancialController } from '../../controllers/financial.controller';
import { FinancialService } from '../../services/financial.service';
import { AuditLogService } from '../../services/audit-log.service';
import { SupabaseService } from '../../services/supabase.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [FinancialController],
  providers: [SupabaseService, FinancialService, AuditLogService],
})
export class FinancialServiceModule {}
