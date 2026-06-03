import { bootstrapHttpApp } from '../../shared/bootstrap/bootstrap-http-app';
import { SERVICE_PORTS } from '../../shared/http/service-urls';
import { AuthServiceModule } from './auth-service.module';

void bootstrapHttpApp(AuthServiceModule, {
  port: SERVICE_PORTS.auth,
});
