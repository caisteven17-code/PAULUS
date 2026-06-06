import { bootstrapHttpApp } from '../../shared/bootstrap/bootstrap-http-app';
import { SERVICE_PORTS } from '../../shared/http/service-urls';
import { AuditLogServiceModule } from './audit-log-service.module';

void bootstrapHttpApp(AuditLogServiceModule, {
  port: SERVICE_PORTS.auditLog,
});
