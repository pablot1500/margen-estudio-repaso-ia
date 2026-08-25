import type { StoredExam } from './domain';
import { AppError } from './http';

export const skipPendingFollowUp = (exam: StoredExam, questionId: string) => {
  if (exam.status !== 'active') throw new AppError('EXAM_NOT_ACTIVE', 'Este examen ya no está activo.', 404);
  const question = exam.questions[exam.currentQuestionIndex];
  if (!question || question.id !== questionId) throw new AppError('QUESTION_MISMATCH', 'La pregunta cambió. Actualizá la sesión.', 409);
  const evaluation = question.evaluation;
  const hasPendingFollowUp = Boolean(question.followUpAsked && !question.followUpAnswer && evaluation?.followUpQuestion);
  if (!hasPendingFollowUp) throw new AppError('FOLLOW_UP_NOT_PENDING', 'Esta pregunta no tiene una repregunta pendiente.', 409);
  if (!evaluation || evaluation.score < 7) throw new AppError('FOLLOW_UP_REQUIRED', 'Necesitás responder la repregunta para avanzar con una nota menor a 7.', 409);

  question.evaluation = {
    ...evaluation,
    finalForQuestion: true,
    followUpRequired: false,
    followUpQuestion: null,
  };
  exam.currentQuestionIndex += 1;
  return question;
};
