import { randomUUID } from 'node:crypto';
import type { Config, Context } from '@netlify/functions';
import { extractQuestionsFromMaterial } from '../lib/gemini';
import { AppError, json, method, withErrorHandling } from '../lib/http';
import { materialFilesRepo, materialsRepo, questionsRepo, subjectsRepo } from '../lib/storage';

export default withErrorHandling(async (request: Request, context: Context) => {
  method(request, ['POST']);
  const material = context.params.id ? await materialsRepo.get(context.params.id) : null;
  if (!material) throw new AppError('MATERIAL_NOT_FOUND', 'El material ya no existe.', 404);
  if (material.status !== 'ready') throw new AppError('MATERIAL_NOT_READY', 'El apunte todavía se está procesando.', 409);
  if (material.questionExtractionStatus === 'ready') return json({ material });

  const subject = await subjectsRepo.get(material.subjectId);
  if (!subject) throw new AppError('SUBJECT_NOT_FOUND', 'La materia ya no existe.', 404);
  const file = await materialFilesRepo.get(material.id);
  if (!file) {
    material.questionExtractionStatus = 'error';
    material.questionExtractionError = 'Este apunte fue subido antes de esta función. Eliminá y volvé a subirlo.';
    await materialsRepo.set(material);
    return json({ material });
  }

  material.questionExtractionStatus = 'extracting';
  material.questionExtractionStartedAt = new Date().toISOString();
  material.questionExtractionError = undefined;
  await materialsRepo.set(material);

  try {
    const extracted = await extractQuestionsFromMaterial({
      file,
      mimeType: material.mimeType,
      fileName: material.name,
    });
    if (!extracted.foundHeading || extracted.questions.length === 0) {
      material.questionExtractionStatus = 'error';
      material.questionExtractionError = 'No encontramos preguntas debajo del subtítulo “Preguntas”.';
      material.extractedQuestionCount = 0;
      await materialsRepo.set(material);
      return json({ material });
    }

    await questionsRepo.deleteForMaterial(material.id);
    await Promise.all(extracted.questions.map((item, position) => questionsRepo.set({
      id: randomUUID(),
      materialId: material.id,
      subjectId: material.subjectId,
      classId: material.classId,
      className: material.className,
      sourceLabel: material.name,
      sectionNumber: item.sectionNumber || undefined,
      sectionTitle: item.sectionTitle || undefined,
      sourceNumber: item.sourceNumber || undefined,
      position,
      question: item.question.trim(),
      rubric: {
        expectedConcepts: item.expectedConcepts,
        importantRelations: item.importantRelations,
        commonMistakes: item.commonMistakes,
      },
      createdAt: new Date().toISOString(),
    })));
    material.questionExtractionStatus = 'ready';
    material.extractedQuestionCount = extracted.questions.length;
    material.questionExtractionError = undefined;
    await materialsRepo.set(material);
    return json({ material });
  } catch (error) {
    material.questionExtractionStatus = 'error';
    material.questionExtractionError = 'No pudimos identificar las preguntas. Podés reintentar.';
    await materialsRepo.set(material);
    throw error;
  }
});

export const config: Config = { path: '/api/materials/item/:id/extract-questions' };
