import { completeExam, toPublicExam } from '../lib/exams';
import { skipPendingFollowUp } from '../lib/followUp';
import { AppError, json, method, readJSON, withErrorHandling } from '../lib/http';
import { lambda } from '../lib/lambda';
import { examsRepo } from '../lib/storage';

export const handler = lambda(withErrorHandling(async (request) => {
  method(request, ['POST']);
  const body = await readJSON<{ examId?: string; questionId?: string }>(request);
  const exam = body.examId ? await examsRepo.get(body.examId) : null;
  if (!exam) throw new AppError('EXAM_NOT_ACTIVE', 'Este examen ya no está activo.', 404);
  const question = skipPendingFollowUp(exam, body.questionId || '');

  const completed = exam.currentQuestionIndex >= exam.questions.length;
  if (completed) await completeExam(exam);
  else await examsRepo.set(exam);

  return json({
    evaluation: question.evaluation,
    exam: await toPublicExam(exam),
    completed,
    summary: exam.summary || null,
  });
}), '/api/exams/skip-follow-up');
