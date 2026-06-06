import { bootstrapHttpApp } from '../../shared/bootstrap/bootstrap-http-app';
import { SERVICE_PORTS } from '../../shared/http/service-urls';
import { AnnouncementServiceModule } from './announcement-service.module';

void bootstrapHttpApp(AnnouncementServiceModule, {
  port: SERVICE_PORTS.announcement,
});
