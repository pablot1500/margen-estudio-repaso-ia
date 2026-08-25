import type { Config, Context } from '@netlify/functions';
import { finishExam, toPublicExam } from '../lib/exams';
import { AppError, json, method, withErrorHandling } from '../lib/http';
import { examsRepo } from '../lib/storage';

export default withErrorHandling(async (request: Request, context: Context) => {
  method(request, ['GET']);
  const exam = context.params.examId ? await examsRepo.get(context.params.examId) : null;
  if (!exam) throw new AppError('EXAM_NOT_FOUND', 'No encontramos ese examen.', 404);
  if (exam.status === 'completed' && !exam.summary) await finishExam(exam);
  return json({ exam: await toPublicExam(exam), summary: exam.summary || null });
});

// Keep the detail route outside `/api/exams/:examId` so Netlify does not
// interpret reserved actions such as `history` and `start` as exam IDs.
export const config: Config = { path: '/api/exams/detail/:examId' };
