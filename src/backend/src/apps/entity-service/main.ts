import { bootstrapHttpApp } from '../../shared/bootstrap/bootstrap-http-app';
import { SERVICE_PORTS } from '../../shared/http/service-urls';
import { EntityServiceModule } from './entity-service.module';

void bootstrapHttpApp(EntityServiceModule, {
  port: SERVICE_PORTS.entity,
});
