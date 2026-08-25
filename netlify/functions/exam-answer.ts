import type { Context } from '@netlify/functions';
import { evaluateAnswer } from '../lib/gemini';
import { completeExam, markEvaluation, toPublicExam } from '../lib/exams';
import { AppError, json, method, readJSON, withErrorHandling } from '../lib/http';
import { lambda } from '../lib/lambda';
import { examsRepo, materialFilesRepo, materialsRepo } from '../lib/storage';

export const handler = lambda(withErrorHandling(async (request: Request, context: Context) => {
  method(request, ['POST']);
  const exam = context.params.examId ? await examsRepo.get(context.params.examId) : null;
  if (!exam || exam.status !== 'active') throw new AppError('EXAM_NOT_ACTIVE', 'Este examen ya no está activo.', 404);
  const body = await readJSON<{ questionId?: string; answer?: string }>(request);
  const question = exam.questions[exam.currentQuestionIndex];
  if (!question || body.questionId !== question.id) throw new AppError('QUESTION_MISMATCH', 'La pregunta cambió. Actualizá la sesión.', 409);
  const answer = body.answer?.trim();
  if (!answer || answer.length < 3) throw new AppError('ANSWER_TOO_SHORT', 'Escribí una respuesta antes de enviarla.');
  const isFollowUp = Boolean(question.followUpAsked && !question.followUpAnswer);
  const sourceMaterial = question.materialId ? await materialsRepo.get(question.materialId) : null;
  const sourceFile = sourceMaterial ? await materialFilesRepo.get(sourceMaterial.id) : null;
  const evaluation = await evaluateAnswer({
    exam, question, answer, isFollowUp,
    sourceFile: sourceFile || undefined,
    sourceMimeType: sourceMaterial?.mimeType,
  });

  if (isFollowUp) {
    question.followUpAnswer = answer;
    markEvaluation(question, evaluation, true);
    exam.currentQuestionIndex += 1;
  } else {
    question.answer = answer;
    if (evaluation.verdict === 'incorrect') {
      markEvaluation(question, evaluation, false);
    } else if (evaluation.followUpRequired && evaluation.followUpQuestion) {
      question.followUpAsked = true;
      markEvaluation(question, evaluation, false);
    } else {
      markEvaluation(question, evaluation, true);
      exam.currentQuestionIndex += 1;
    }
  }

  let completed = false;
  if (exam.currentQuestionIndex >= exam.questions.length) {
    await completeExam(exam);
    completed = true;
  } else {
    await examsRepo.set(exam);
  }
  return json({ evaluation: question.evaluation, exam: await toPublicExam(exam), completed, summary: exam.summary || null });
}), '/api/exams/:examId/answer');
