export type DownstreamResult<T> = {
  status: number;
  data: T;
  headers: Headers;
};

const parseBody = async (response: Response) => {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

export const requestDownstream = async <T>(input: {
  baseUrl: string;
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string | undefined>;
  body?: unknown;
}): Promise<DownstreamResult<T>> => {
  const headers = new Headers();

  for (const [key, value] of Object.entries(input.headers ?? {})) {
    if (value) {
      headers.set(key, value);
    }
  }

  const hasBody = typeof input.body !== 'undefined';
  if (hasBody && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`${input.baseUrl}${input.path}`, {
    method: input.method ?? 'GET',
    headers,
    body: hasBody ? JSON.stringify(input.body) : undefined,
  });

  return {
    status: response.status,
    data: (await parseBody(response)) as T,
    headers: response.headers,
  };
};
