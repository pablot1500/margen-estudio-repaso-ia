import { AppError } from './http';
import { consumePublishedGroqRequest } from './groqRateLimit';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export const groqModelName = () => process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
export const groqConfigured = () => Boolean(process.env.GROQ_API_KEY);
export const groqIsPrimary = () => (process.env.AI_PROVIDER || 'groq').toLowerCase() === 'groq';

const groqApiKey = () => {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new AppError('CONFIG_ERROR', 'Falta configurar GROQ_API_KEY en las variables de Netlify Functions.', 500);
  return key;
};

export const groqStructured = async <T>(input: {
  prompt: string;
  system?: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  parse: (value: unknown) => T;
  repair?: (value: unknown) => unknown;
  maxTokens?: number;
}) => {
  await consumePublishedGroqRequest();

  type GroqBody = {
    error?: { message?: string; code?: string; failed_generation?: unknown };
    choices?: Array<{ message?: { content?: string } }>;
  };

  const parseJSONCandidate = (candidate: unknown) => {
    if (candidate && typeof candidate === 'object') return candidate;
    if (typeof candidate !== 'string') throw new Error('No JSON candidate');
    const withoutFences = candidate.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
    try { return JSON.parse(withoutFences); }
    catch {
      const firstBrace = withoutFences.indexOf('{');
      const lastBrace = withoutFences.lastIndexOf('}');
      if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error('Invalid JSON candidate');
      return JSON.parse(withoutFences.slice(firstBrace, lastBrace + 1));
    }
  };

  const required = Array.isArray(input.jsonSchema.required)
    ? input.jsonSchema.required.filter((field): field is string => typeof field === 'string')
    : [];
  let lastCandidate: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: groqModelName(),
          messages: [
            ...(input.system ? [{ role: 'system', content: input.system }] : []),
            { role: 'user', content: attempt === 0 ? input.prompt : `${input.prompt}\n\nREINTENTO DE FORMATO: el intento anterior fue rechazado porque omitió campos del JSON. Devolvé un único objeto completo. No omitas ninguno de estos campos obligatorios: ${required.join(', ')}. Respetá exactamente este esquema: ${JSON.stringify(input.jsonSchema)}` },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: input.schemaName, strict: true, schema: input.jsonSchema },
          },
          temperature: 0,
          reasoning_effort: 'low',
          max_completion_tokens: input.maxTokens || 1000,
        }),
        signal: AbortSignal.timeout(attempt === 0 ? 45_000 : 25_000),
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('GROQ_UNAVAILABLE', 'El profesor IA tardó demasiado en responder. Tu respuesta sigue en pantalla; intentá enviarla nuevamente.', 504);
    }

    const body = await response.json().catch(() => ({})) as GroqBody;
    if (!response.ok) {
      if (response.status === 429) throw new AppError('GROQ_QUOTA_EXCEEDED', 'Se alcanzó temporalmente el límite de Groq. Tu respuesta sigue en pantalla; intentá nuevamente más tarde.', 429);
      const providerMessage = body.error?.message || '';
      const schemaFailure = response.status === 400 && /generated json|json.?schema|failed_generation|expected schema|does not validate|missing properties/iu.test(providerMessage);
      if (schemaFailure) {
        lastCandidate = body.error?.failed_generation ?? lastCandidate;
        console.warn('Groq structured output rejected', { schemaName: input.schemaName, attempt: attempt + 1, status: response.status, providerCode: body.error?.code });
        if (attempt === 0) continue;
        break;
      }
      console.error('Groq request failed', { schemaName: input.schemaName, status: response.status, providerCode: body.error?.code });
      if (response.status === 401 || response.status === 403) throw new AppError('GROQ_AUTH_ERROR', 'La conexión con el profesor IA necesita revisión. Intentá nuevamente más tarde.', 502);
      throw new AppError('GROQ_UNAVAILABLE', 'El profesor IA tuvo un problema temporal. Tu respuesta sigue en pantalla; intentá enviarla nuevamente.', 502);
    }

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      if (attempt === 0) continue;
      break;
    }
    lastCandidate = content;
    try { return input.parse(parseJSONCandidate(content)); }
    catch {
      console.warn('Groq returned unparsable structured output', { schemaName: input.schemaName, attempt: attempt + 1 });
      if (attempt === 0) continue;
    }
  }

  if (lastCandidate !== undefined && input.repair) {
    try { return input.parse(input.repair(parseJSONCandidate(lastCandidate))); }
    catch { /* The friendly error below is safer than leaking provider details. */ }
  }

  throw new AppError('GROQ_INVALID_OUTPUT', 'El profesor IA devolvió una corrección incompleta incluso después de reintentar. Tu respuesta no se perdió; volvé a enviarla.', 502);
};

export const checkGroqConnection = async () => groqStructured({
  prompt: 'Respondé exactamente con este objeto: {"ok":true}',
  schemaName: 'health_check',
  jsonSchema: {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok'],
    additionalProperties: false,
  },
  parse: (value) => value as { ok: boolean },
  maxTokens: 100,
});
