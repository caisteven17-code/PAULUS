import { Controller, Get } from '@nestjs/common';
import { createHealthPayload } from '../../../shared/health';

@Controller('health')
export class GatewayHealthController {
  @Get()
  getHealth() {
    return createHealthPayload('api-gateway');
  }
}
