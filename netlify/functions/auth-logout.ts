import type { Config } from '@netlify/functions';
import { clearSessionCookie } from '../lib/auth';
import { json, method, withErrorHandling } from '../lib/http';

export default withErrorHandling(async (request) => {
  method(request, ['POST']);
  return json({ authenticated: false }, 200, { 'Set-Cookie': clearSessionCookie() });
});

export const config: Config = { path: '/api/auth/logout' };
