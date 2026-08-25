import type { Config } from '@netlify/functions';
import { createSessionCookie, safePasswordMatch } from '../lib/auth';
import { AppError, json, method, readJSON, withErrorHandling } from '../lib/http';

export default withErrorHandling(async (request) => {
  method(request, ['POST']);
  const { password } = await readJSON<{ password?: string }>(request);
  if (!password || !safePasswordMatch(password)) throw new AppError('UNAUTHORIZED', 'La contraseña no es correcta.', 401);
  return json({ authenticated: true }, 200, { 'Set-Cookie': createSessionCookie() });
}, { auth: false });

export const config: Config = { path: '/api/auth/login' };
