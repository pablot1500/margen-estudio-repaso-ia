import type { ExtractedQuestion, StoredExam, StoredQuestion } from './domain';
import type { QuestionOrder } from '../../src/types/domain';

type QuestionIdentity = Pick<StoredQuestion, 'materialId' | 'question'>;

export const questionProgressKey = (question: QuestionIdentity) =>
  `${question.materialId || 'unknown'}\u0000${question.question.trim()}`;

export const isValidFinalAnswer = (question: StoredQuestion) =>
  Boolean(question.evaluation?.finalForQuestion && question.evaluation.verdict !== 'incorrect');

export const buildValidAnswerCounts = (exams: StoredExam[]) => {
  const counts = new Map<string, number>();
  exams.forEach((exam) => exam.questions.forEach((question) => {
    if (!isValidFinalAnswer(question)) return;
    const key = questionProgressKey(question);
    counts.set(key, (counts.get(key) || 0) + 1);
  }));
  return counts;
};

export const validAnswerCountFor = (question: QuestionIdentity, counts: Map<string, number>) =>
  counts.get(questionProgressKey(question)) || 0;

export const rankQuestionsByProgress = (
  bank: ExtractedQuestion[],
  counts: Map<string, number>,
  previousQuestions: StoredQuestion[] = [],
  order: QuestionOrder = 'random',
) => {
  const previous = new Set(previousQuestions.map(questionProgressKey));
  return bank
    .map((question, sourceIndex) => ({
      question,
      validAnswerCount: validAnswerCountFor(question, counts),
      wasPreviouslySelected: previous.has(questionProgressKey(question)),
      tieBreaker: order === 'ordered' ? sourceIndex : Math.random(),
    }))
    .sort((a, b) =>
      a.validAnswerCount - b.validAnswerCount
      || (order === 'random' ? Number(a.wasPreviouslySelected) - Number(b.wasPreviouslySelected) : 0)
      || a.tieBreaker - b.tieBreaker);
};

export const resolveQuestionOrder = (
  bank: ExtractedQuestion[],
  counts: Map<string, number>,
  requested: QuestionOrder = 'ordered',
) => ({
  questionOrder: bank.some((question) => validAnswerCountFor(question, counts) === 0) ? 'ordered' as const : requested,
  unseenCount: bank.filter((question) => validAnswerCountFor(question, counts) === 0).length,
});
