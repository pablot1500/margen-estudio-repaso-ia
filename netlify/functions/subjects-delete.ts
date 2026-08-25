import type { Config, Context } from '@netlify/functions';
import { deleteFileSearchStore } from '../lib/gemini';
import { AppError, json, method, withErrorHandling } from '../lib/http';
import { examsRepo, materialFilesRepo, materialsRepo, questionsRepo, subjectsRepo } from '../lib/storage';

export default withErrorHandling(async (request: Request, context: Context) => {
  method(request, ['DELETE']);
  const subjectId = context.params.id;
  const subject = subjectId ? await subjectsRepo.get(subjectId) : null;
  if (!subject) throw new AppError('SUBJECT_NOT_FOUND', 'La materia ya no existe.', 404);

  const materials = await materialsRepo.list(subject.id);

  // Gemini se elimina primero: si el servicio externo rechaza la operación,
  // mantenemos intactos los datos locales para que el usuario pueda reintentar.
  if (subject.fileSearchStoreName) await deleteFileSearchStore(subject.fileSearchStoreName);

  await Promise.all([
    ...materials.map((material) => materialFilesRepo.delete(material.id)),
    ...materials.map((material) => materialsRepo.delete(material.id)),
    questionsRepo.deleteForSubject(subject.id),
    examsRepo.deleteForSubject(subject.id),
  ]);
  await subjectsRepo.delete(subject.id);

  return json({ deleted: true, deletedMaterials: materials.length });
});

export const config: Config = { path: '/api/subjects/:id' };
