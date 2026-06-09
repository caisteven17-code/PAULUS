type ProxyOptions = {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  preserveQuery?: boolean;
};

const copyRequestHeaders = (request: Request) => {
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  const authorization = request.headers.get('authorization');
  const cookie = request.headers.get('cookie');

  if (contentType) {
    headers.set('content-type', contentType);
  }

  if (authorization) {
    headers.set('authorization', authorization);
  }

  if (cookie) {
    headers.set('cookie', cookie);
  }

  return headers;
};

const copyResponseHeaders = (source: Headers) => {
  const headers = new Headers();
  const getSetCookie = (source as Headers & { getSetCookie?: () => string[] }).getSetCookie;

  source.forEach((value, key) => {
    if (key.toLowerCase() === 'content-length') {
      return;
    }

    headers.set(key, value);
  });

  if (typeof getSetCookie === 'function') {
    for (const cookie of getSetCookie.call(source)) {
      headers.append('set-cookie', cookie);
    }
  }

  return headers;
};

export async function proxyToBackend(request: Request, options: ProxyOptions) {
  const incomingUrl = new URL(request.url);
  const targetPath = options.preserveQuery === false ? options.path : `${options.path}${incomingUrl.search}`;

  const backendBaseUrl = process.env.BACKEND_PROXY_BASE_URL?.trim() || 'http://127.0.0.1:4000/api';
  const targetUrl = `${backendBaseUrl.replace(/\/$/, '')}${targetPath}`;

  try {
    const bodyText = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
    const response = await fetch(targetUrl, {
      method: options.method ?? request.method,
      headers: copyRequestHeaders(request),
      body: bodyText,
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: copyResponseHeaders(response.headers),
    });
  } catch (error: any) {
    console.error(`[backend-proxy] error proxying to ${targetUrl}:`, error.message);
    return new Response(JSON.stringify({ error: 'Backend service unavailable.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
