import { bootstrapHttpApp } from '../../shared/bootstrap/bootstrap-http-app';
import { SERVICE_PORTS } from '../../shared/http/service-urls';
import { AnalyticsServiceModule } from './analytics-service.module';

void bootstrapHttpApp(AnalyticsServiceModule, {
  port: SERVICE_PORTS.analytics,
});
