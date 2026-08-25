import type { Config } from '@netlify/functions';
import { json, method, withErrorHandling } from '../lib/http';

export default withErrorHandling(async (request) => {
  method(request, ['GET']);
  return json({ authenticated: true });
});

export const config: Config = { path: '/api/auth/session' };
