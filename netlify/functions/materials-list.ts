import type { Config } from '@netlify/functions';
import { getOperation } from '../lib/gemini';
import { json, method, withErrorHandling } from '../lib/http';
import { materialsRepo } from '../lib/storage';

const EXTRACTION_TIMEOUT_MS = 2 * 60 * 1000;

export default withErrorHandling(async (request) => {
  method(request, ['GET']);
  const subjectId = new URL(request.url).searchParams.get('subjectId') || undefined;
  const materials = await materialsRepo.list(subjectId);
  await Promise.all(materials.map(async (material) => {
    if (!material.questionExtractionStatus) {
      material.questionExtractionStatus = 'pending';
      material.extractedQuestionCount = 0;
      await materialsRepo.set(material);
    }
    if (material.questionExtractionStatus === 'extracting' && material.questionExtractionStartedAt) {
      const elapsed = Date.now() - new Date(material.questionExtractionStartedAt).getTime();
      if (elapsed > EXTRACTION_TIMEOUT_MS) {
        material.questionExtractionStatus = 'error';
        material.questionExtractionError = 'La identificación tardó demasiado. Podés reintentar sin volver a subir el archivo.';
        await materialsRepo.set(material);
      }
    }
    if (material.status !== 'processing' || !material.geminiOperationName) return;
    try {
      const operation = await getOperation(material.geminiOperationName);
      if (!operation.done) return;
      material.status = operation.error ? 'error' : 'ready';
      material.errorMessage = operation.error ? 'Gemini no pudo indexar este archivo.' : undefined;
      material.geminiDocumentName = operation.response?.documentName;
      await materialsRepo.set(material);
    } catch {
      // Conserva processing: una consulta transitoria no debe marcar el material como fallido.
    }
  }));
  return json({ materials: materials.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

export const config: Config = { path: '/api/materials' };
