import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditLogController } from '../../controllers/audit-log.controller';
import { AuditLogService } from '../../services/audit-log.service';
import { SupabaseService } from '../../services/supabase.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AuditLogController],
  providers: [SupabaseService, AuditLogService],
})
export class AuditLogServiceModule {}
