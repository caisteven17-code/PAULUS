import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProjectController } from '../../controllers/project.controller';
import { ProjectService } from '../../services/project.service';
import { AuditLogService } from '../../services/audit-log.service';
import { SupabaseService } from '../../services/supabase.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [ProjectController],
  providers: [SupabaseService, ProjectService, AuditLogService],
})
export class ProjectServiceModule {}
