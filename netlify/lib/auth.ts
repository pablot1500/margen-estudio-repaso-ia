import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from './http';

const COOKIE_NAME = 'margen_session';

const secret = () => {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new AppError('CONFIG_ERROR', 'Falta configurar SESSION_SECRET.', 500);
  return value;
};

const sign = (value: string) => createHmac('sha256', secret()).update(value).digest('base64url');

export const safePasswordMatch = (candidate: string) => {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new AppError('CONFIG_ERROR', 'Falta configurar APP_PASSWORD.', 500);
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const createSessionCookie = () => {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 1000 * 60 * 60 * 24 * 30 })).toString('base64url');
  const secure = process.env.CONTEXT === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
};

export const clearSessionCookie = () => `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export const requireSession = (request: Request) => {
  const cookie = request.headers.get('cookie') || '';
  const value = cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!value) throw new AppError('UNAUTHORIZED', 'Tu sesión venció. Volvé a ingresar.', 401);
  const [payload, signature] = value.split('.');
  if (!payload || !signature) throw new AppError('UNAUTHORIZED', 'Tu sesión no es válida.', 401);
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AppError('UNAUTHORIZED', 'Tu sesión no es válida.', 401);
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp: number };
    if (parsed.exp < Date.now()) throw new Error('expired');
  } catch {
    throw new AppError('UNAUTHORIZED', 'Tu sesión venció. Volvé a ingresar.', 401);
  }
};
