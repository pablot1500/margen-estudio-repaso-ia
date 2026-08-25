import { gemini, modelName } from '../lib/gemini';
import { checkGroqConnection, groqConfigured, groqIsPrimary, groqModelName } from '../lib/groq';
import { json, method, withErrorHandling } from '../lib/http';
import { lambda } from '../lib/lambda';

export const handler = lambda(withErrorHandling(async (request) => {
  method(request, ['GET']);
  const checkAI = new URL(request.url).searchParams.get('ai') === '1';
  const provider = groqIsPrimary() ? 'groq' : 'gemini';
  let status: 'missing_key' | 'configured' | 'connected' = provider === 'groq' && !groqConfigured() ? 'missing_key' : 'configured';
  if (checkAI) {
    if (provider === 'groq') await checkGroqConnection();
    else await gemini().interactions.create({ model: modelName(), input: 'Respondé únicamente: OK' });
    status = 'connected';
  }
  return json({ ok: true, provider, status, model: provider === 'groq' ? groqModelName() : modelName(), storage: 'netlify-blobs' });
}), '/api/health');
