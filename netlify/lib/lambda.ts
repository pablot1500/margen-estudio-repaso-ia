import type { Context, Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';

type FetchHandler = (request: Request, context: Context) => Promise<Response>;

const routeParams = (pattern: string, pathname: string) => {
  const expected = pattern.split('/').filter(Boolean);
  const actual = pathname.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  expected.forEach((segment, index) => {
    if (segment.startsWith(':') && actual[index]) params[segment.slice(1)] = decodeURIComponent(actual[index]);
  });
  return params;
};

const requestUrl = (event: HandlerEvent) => {
  if (event.rawUrl) return event.rawUrl;
  const host = event.headers.host || 'localhost';
  const query = event.rawQuery ? `?${event.rawQuery}` : '';
  return `https://${host}${event.path}${query}`;
};

const toRequest = (event: HandlerEvent) => {
  const headers = new Headers();
  Object.entries(event.headers).forEach(([name, value]) => {
    if (value !== undefined) headers.set(name, value);
  });
  const hasBody = !['GET', 'HEAD'].includes(event.httpMethod) && event.body !== null;
  const body = !hasBody ? undefined : event.isBase64Encoded ? Buffer.from(event.body!, 'base64') : event.body!;
  return new Request(requestUrl(event), { method: event.httpMethod, headers, body });
};

const toHandlerResponse = async (response: Response): Promise<HandlerResponse> => {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => { headers[name] = value; });
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = getSetCookie?.call(response.headers) || [];
  if (cookies.length) delete headers['set-cookie'];
  return {
    statusCode: response.status,
    headers,
    ...(cookies.length ? { multiValueHeaders: { 'set-cookie': cookies } } : {}),
    body: await response.text(),
  };
};

export const lambda = (fetchHandler: FetchHandler, pattern: string): Handler => async (event) => {
  const request = toRequest(event);
  const context = { params: routeParams(pattern, new URL(request.url).pathname) } as Context;
  return toHandlerResponse(await fetchHandler(request, context));
};
