import { getStore } from '@netlify/blobs';
import { AppError } from './http';

const LIMIT = 5;
const WINDOW_MS = 5 * 60 * 60 * 1000;
const KEY = 'groq/global';
const MAX_WRITE_ATTEMPTS = 8;

type RateLimitState = {
  windowStartedAt: number;
  count: number;
};

const store = () => getStore({ name: 'margen-rate-limit', consistency: 'strong' });

const isPublishedProduction = () => process.env.CONTEXT === 'production';

const limitedError = (windowStartedAt: number) => {
  const retryAt = new Date(windowStartedAt + WINDOW_MS);
  return new AppError(
    'PUBLIC_AI_RATE_LIMIT',
    `La versión pública permite hasta ${LIMIT} consultas cada 5 horas. Podés volver a intentar después de las ${retryAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}.`,
    429,
  );
};

export const consumePublishedGroqRequest = async () => {
  // Netlify Dev and every local execution remain intentionally unlimited.
  if (!isPublishedProduction()) return;

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const now = Date.now();
    const current = await store().getWithMetadata(KEY, {
      type: 'json',
      consistency: 'strong',
    }) as { data: RateLimitState; etag?: string } | null;

    const expired = !current || now - Number(current.data.windowStartedAt || 0) >= WINDOW_MS;
    const state: RateLimitState = expired
      ? { windowStartedAt: now, count: 1 }
      : { windowStartedAt: current.data.windowStartedAt, count: Number(current.data.count || 0) + 1 };

    if (!expired && Number(current?.data.count || 0) >= LIMIT) {
      throw limitedError(current!.data.windowStartedAt);
    }

    const result = current?.etag
      ? await store().setJSON(KEY, state, { onlyIfMatch: current.etag })
      : await store().setJSON(KEY, state, { onlyIfNew: true });

    if (result.modified) return;
  }

  // If many concurrent requests race for the same counter, fail closed so the
  // provider quota cannot be consumed beyond the public allowance.
  throw new AppError(
    'PUBLIC_AI_RATE_LIMIT_BUSY',
    'Hay varias consultas procesándose al mismo tiempo. Esperá unos segundos y volvé a intentar.',
    429,
  );
};

export const publishedGroqLimit = {
  maxRequests: LIMIT,
  windowHours: WINDOW_MS / (60 * 60 * 1000),
};
