import type { Context } from '@netlify/functions';
import { deleteDocument } from '../lib/gemini';
import { AppError, json, method, withErrorHandling } from '../lib/http';
import { lambda } from '../lib/lambda';
import { materialFilesRepo, materialsRepo, questionsRepo } from '../lib/storage';

export const handler = lambda(withErrorHandling(async (request: Request, context: Context) => {
  method(request, ['DELETE']);
  const id = context.params.id;
  const material = id ? await materialsRepo.get(id) : null;
  if (!material) throw new AppError('MATERIAL_NOT_FOUND', 'El material ya no existe.', 404);
  if (material.geminiDocumentName) await deleteDocument(material.geminiDocumentName);
  await questionsRepo.deleteForMaterial(material.id);
  await materialFilesRepo.delete(material.id);
  await materialsRepo.delete(material.id);
  return json({ deleted: true });
}), '/api/materials/item/:id');

// Keep item actions below a fixed segment so `/api/materials/upload` can never
// be interpreted as a material ID by Netlify's route matcher.
