import type { Config } from '@netlify/functions';
import { startExam, toPublicExam } from '../lib/exams';
import { AppError, json, method, readJSON, withErrorHandling } from '../lib/http';
import type { QuestionOrder } from '../../src/types/domain';

export default withErrorHandling(async (request) => {
  method(request, ['POST']);
  const body = await readJSON<{ subjectId?: string; selectedClassIds?: string[]; regenerate?: boolean; questionOrder?: QuestionOrder }>(request);
  if (!body.subjectId) throw new AppError('INVALID_REQUEST', 'Elegí una materia.');
  if (body.questionOrder && !['ordered', 'random'].includes(body.questionOrder)) throw new AppError('INVALID_REQUEST', 'Elegí un orden de preguntas válido.');
  const exam = await startExam({
    subjectId: body.subjectId, selectedClassIds: body.selectedClassIds, regenerate: body.regenerate, questionOrder: body.questionOrder,
  });
  return json({ exam: await toPublicExam(exam) }, 201);
});

export const config: Config = { path: '/api/exams/start' };
