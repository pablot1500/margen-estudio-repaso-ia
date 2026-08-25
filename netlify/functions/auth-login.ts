import { createSessionCookie, safePasswordMatch } from '../lib/auth';
import { AppError, json, method, readJSON, withErrorHandling } from '../lib/http';
import { lambda } from '../lib/lambda';

export const handler = lambda(withErrorHandling(async (request) => {
  method(request, ['POST']);
  const { password } = await readJSON<{ password?: string }>(request);
  if (!password || !safePasswordMatch(password)) throw new AppError('UNAUTHORIZED', 'La contraseña no es correcta.', 401);
  return json({ authenticated: true }, 200, { 'Set-Cookie': createSessionCookie() });
}, { auth: false }), '/api/auth/login');
