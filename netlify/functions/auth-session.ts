import { json, method, withErrorHandling } from '../lib/http';
import { lambda } from '../lib/lambda';

export const handler = lambda(withErrorHandling(async (request) => {
  method(request, ['GET']);
  return json({ authenticated: true });
}), '/api/auth/session');
