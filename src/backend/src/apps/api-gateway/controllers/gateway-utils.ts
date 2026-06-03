import { Response } from 'express';

export const applyDownstreamCookies = (response: Response, headers: Headers) => {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = typeof getSetCookie === 'function' ? getSetCookie.call(headers) : [];

  if (cookies.length > 0) {
    response.setHeader('Set-Cookie', cookies);
  }
};
