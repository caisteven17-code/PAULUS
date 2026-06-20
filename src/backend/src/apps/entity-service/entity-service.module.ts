import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EntityController } from '../../controllers/entity.controller';
import { LiturgicalCalendarController } from '../../controllers/liturgical-calendar.controller';
import { EntityService } from '../../services/entity.service';
import { LiturgicalCalendarService } from '../../services/liturgical-calendar.service';
import { AuditLogService } from '../../services/audit-log.service';
import { SupabaseService } from '../../services/supabase.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [EntityController, LiturgicalCalendarController],
  providers: [SupabaseService, EntityService, LiturgicalCalendarService, AuditLogService],
})
export class EntityServiceModule {}
