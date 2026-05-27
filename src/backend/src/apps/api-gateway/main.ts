import { bootstrapHttpApp } from '../../shared/bootstrap/bootstrap-http-app';
import { SERVICE_PORTS } from '../../shared/http/service-urls';
import { ApiGatewayModule } from './api-gateway.module';

void bootstrapHttpApp(ApiGatewayModule, {
  port: SERVICE_PORTS.gateway,
  globalPrefix: 'api',
  enableCors: true,
});
