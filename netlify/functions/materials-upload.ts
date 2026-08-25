import { randomUUID } from 'node:crypto';
import type { StudyMaterial } from '../lib/domain';
import { AppError, json, method, withErrorHandling } from '../lib/http';
import { lambda } from '../lib/lambda';
import { materialFilesRepo, materialsRepo, subjectsRepo } from '../lib/storage';

const MAX_BYTES = 4 * 1024 * 1024;
const SUPPORTED = new Set([
  'application/pdf', 'text/plain', 'text/markdown', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 42);

export const handler = lambda(withErrorHandling(async (request) => {
  method(request, ['POST']);
  const form = await request.formData();
  const file = form.get('file');
  const subjectId = String(form.get('subjectId') || '');
  const className = String(form.get('className') || '').trim();
  const classId = String(form.get('classId') || slug(className));
  if (!(file instanceof File)) throw new AppError('INVALID_FILE', 'Elegí un archivo para subir.');
  if (file.size > MAX_BYTES) throw new AppError('UPLOAD_TOO_LARGE', 'El archivo supera el límite de 4 MB.', 413);
  if (!SUPPORTED.has(file.type)) throw new AppError('UNSUPPORTED_FILE', 'Formato no compatible. Usá PDF, TXT, Markdown o DOCX.', 415);
  if (!className) throw new AppError('INVALID_CLASS', 'Indicá a qué clase o apartado pertenece el archivo.');
  const subject = await subjectsRepo.get(subjectId);
  if (!subject) throw new AppError('SUBJECT_NOT_FOUND', 'La materia seleccionada no existe.', 404);
  const id = randomUUID();
  const material: StudyMaterial = {
    id, subjectId, classId, className, name: file.name, mimeType: file.type, size: file.size,
    status: 'ready', questionExtractionStatus: 'pending', extractedQuestionCount: 0,
    createdAt: new Date().toISOString(),
  };
  await materialsRepo.set(material);
  await materialFilesRepo.set(id, file);
  return json({ material }, 202);
}), '/api/materials/upload');
