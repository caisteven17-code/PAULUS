import { bootstrapHttpApp } from '../../shared/bootstrap/bootstrap-http-app';
import { SERVICE_PORTS } from '../../shared/http/service-urls';
import { FinancialServiceModule } from './financial-service.module';

void bootstrapHttpApp(FinancialServiceModule, {
  port: SERVICE_PORTS.financial,
});
