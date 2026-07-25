import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FinancialController } from '../../controllers/financial.controller';
import { BudgetController } from '../../controllers/budget.controller';
import { FinancialService } from '../../services/financial.service';
import { BudgetService } from '../../services/budget.service';
import { AuditLogService } from '../../services/audit-log.service';
import { SupabaseService } from '../../services/supabase.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [FinancialController, BudgetController],
  providers: [SupabaseService, FinancialService, BudgetService, AuditLogService],
})
export class FinancialServiceModule {}
