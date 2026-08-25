import type { Context } from '@netlify/functions';
import { requireSession } from './auth';

export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });

export const readJSON = async <T>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AppError('INVALID_REQUEST', 'La solicitud no tiene un formato válido.', 400);
  }
};

export const method = (request: Request, allowed: string[]) => {
  if (!allowed.includes(request.method)) {
    throw new AppError('METHOD_NOT_ALLOWED', 'Método no permitido.', 405);
  }
};

export const withErrorHandling = (
  handler: (request: Request, context: Context) => Promise<Response>,
  options: { auth?: boolean } = { auth: true },
) => async (request: Request, context: Context) => {
  try {
    if (options.auth !== false) requireSession(request);
    return await handler(request, context);
  } catch (error) {
    if (error instanceof AppError) return json({ error: { code: error.code, message: error.message } }, error.status);
    const message = error instanceof Error ? error.message : '';
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
      return json({ error: { code: 'GEMINI_QUOTA_EXCEEDED', message: 'Se alcanzó temporalmente el límite gratuito de Gemini. Intentá nuevamente más tarde.' } }, 429);
    }
    console.error(error);
    return json({ error: { code: 'GEMINI_ERROR', message: 'No pudimos completar la operación con el profesor IA. Intentá nuevamente.' } }, 500);
  }
};
