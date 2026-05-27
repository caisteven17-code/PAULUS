import { bootstrapHttpApp } from '../../shared/bootstrap/bootstrap-http-app';
import { SERVICE_PORTS } from '../../shared/http/service-urls';
import { ProjectServiceModule } from './project-service.module';

void bootstrapHttpApp(ProjectServiceModule, {
  port: SERVICE_PORTS.project,
});
