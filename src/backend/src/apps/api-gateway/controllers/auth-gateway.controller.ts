import { Body, Controller, Get, Headers, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';
import { applyDownstreamCookies } from './gateway-utils';

@Controller('auth')
export class AuthGatewayController {
  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.auth,
      path: '/auth/login',
      method: 'POST',
      body,
    });

    applyDownstreamCookies(response, result.headers);
    response.status(result.status);
    return result.data;
  }

  @Post('logout')
  async logout(@Headers('authorization') authorization: string | undefined, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.auth,
      path: '/auth/logout',
      method: 'POST',
      headers: { authorization },
    });

    applyDownstreamCookies(response, result.headers);
    response.status(result.status);
    return result.data;
  }

  @Get('me')
  async me(@Headers('authorization') authorization: string | undefined, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.auth,
      path: '/auth/me',
      headers: { authorization },
    });

    response.status(result.status);
    return result.data;
  }
}
