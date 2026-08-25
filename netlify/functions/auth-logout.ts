import { clearSessionCookie } from '../lib/auth';
import { json, method, withErrorHandling } from '../lib/http';
import { lambda } from '../lib/lambda';

export const handler = lambda(withErrorHandling(async (request) => {
  method(request, ['POST']);
  return json({ authenticated: false }, 200, { 'Set-Cookie': clearSessionCookie() });
}), '/api/auth/logout');
