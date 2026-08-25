import { createHash, randomUUID } from 'node:crypto';
import type { Evaluation, QuestionOrder, StoredExam, StoredQuestion } from './domain';
import type { PublicExam } from '../../src/types/domain';
import { examsRepo, materialsRepo, questionsRepo, subjectsRepo } from './storage';
import { AppError } from './http';
import { generateSummary } from './gemini';
import { buildValidAnswerCounts, rankQuestionsByProgress, resolveQuestionOrder, validAnswerCountFor } from './questionProgress';

export const toPublicExam = async (exam: StoredExam): Promise<PublicExam> => {
  const needsSectionNumbers = exam.questions.some((item) => item.sectionTitle && !item.sectionNumber && item.sectionTitle.toLocaleLowerCase('es').trim() !== 'preguntas integradoras');
  if (needsSectionNumbers) {
    const bank = await questionsRepo.list(exam.subjectId);
    let changed = false;
    exam.questions.forEach((item) => {
      if (item.sectionNumber) return;
      const source = bank.find((candidate) => candidate.materialId === item.materialId && candidate.question === item.question);
      if (source?.sectionNumber) {
        item.sectionNumber = source.sectionNumber;
        changed = true;
      }
    });
    if (changed) await examsRepo.set(exam);
  }
  const question = exam.questions[exam.currentQuestionIndex];
  const followUp = question?.followUpAsked && !question.followUpAnswer && question.evaluation?.followUpQuestion;
  const currentCounts = question
    ? buildValidAnswerCounts((await examsRepo.list()).filter((item) => item.subjectId === exam.subjectId))
    : new Map<string, number>();
  return {
    id: exam.id, subjectId: exam.subjectId, subjectName: exam.subjectName,
    selectedClassIds: exam.selectedClassIds, selectedClassNames: exam.selectedClassNames,
    topic: exam.topic, mode: exam.mode, difficulty: exam.difficulty, questionOrder: exam.questionOrder || 'random', poolSize: exam.poolSize,
    totalQuestions: exam.totalQuestions, currentQuestionIndex: exam.currentQuestionIndex,
    status: exam.status,
    currentQuestion: exam.status === 'active' && question ? {
      id: question.id,
      question: followUp || question.question,
      sourceLabel: question.sourceLabel,
      className: question.className,
      sectionNumber: question.sectionNumber,
      sectionTitle: question.sectionTitle,
      sourceNumber: question.sourceNumber,
      validAnswerCount: validAnswerCountFor(question, currentCounts),
      followUp: Boolean(followUp),
    } : null,
    scores: exam.questions.flatMap((item) => item.evaluation?.finalForQuestion ? [item.evaluation.score] : []),
    createdAt: exam.createdAt, completedAt: exam.completedAt, revision: exam.revision,
  };
};

export const dailyKey = (subjectId: string, classIds: string[]) => {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
  const scope = createHash('sha1').update(classIds.sort().join(',') || 'all').digest('hex').slice(0, 8);
  return `${date}-${subjectId}-${scope}`;
};

export const startExam = async (input: {
  subjectId: string; selectedClassIds?: string[]; regenerate?: boolean; questionOrder?: QuestionOrder;
}) => {
  const subject = await subjectsRepo.get(input.subjectId);
  if (!subject) throw new AppError('SUBJECT_NOT_FOUND', 'La materia seleccionada no existe.', 404);
  const materials = (await materialsRepo.list(subject.id)).filter((item) => item.status === 'ready' && item.questionExtractionStatus === 'ready');
  if (!materials.length) throw new AppError('NO_MATERIALS', 'Esta materia todavía no tiene apuntes disponibles.', 400);
  const requestedIds = [...new Set(input.selectedClassIds || [])];
  if (requestedIds.length && !materials.some((item) => requestedIds.includes(item.classId))) {
    throw new AppError('NO_MATERIALS', 'No hay materiales disponibles para las clases elegidas.', 400);
  }
  const key = dailyKey(subject.id, requestedIds);
  const existingRef = await examsRepo.getDaily(key);
  const existing = existingRef ? await examsRepo.get(existingRef.examId) : null;
  if (existing && !input.regenerate) return existing;
  if (existing && input.regenerate && existing.status === 'active') {
    existing.status = 'abandoned';
    await examsRepo.set(existing);
  }
  const selected = requestedIds.length ? materials.filter((item) => requestedIds.includes(item.classId)) : materials;
  const selectedClassNames = [...new Set(selected.map((item) => item.className))];
  const selectedMaterialIds = new Set(selected.map((item) => item.id));
  const materialOrder = new Map([...selected]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.className.localeCompare(b.className, 'es') || a.name.localeCompare(b.name, 'es'))
    .map((material, index) => [material.id, index]));
  const bank = (await questionsRepo.list(subject.id))
    .filter((item) => selectedMaterialIds.has(item.materialId))
    .sort((a, b) => (materialOrder.get(a.materialId) ?? 0) - (materialOrder.get(b.materialId) ?? 0) || a.position - b.position);
  if (!bank.length) throw new AppError('NO_QUESTIONS', 'No encontramos preguntas disponibles en las clases elegidas.', 400);
  const poolSize = bank.length;
  const totalQuestions = Math.max(1, Math.ceil(poolSize / 5));
  const subjectExams = (await examsRepo.list()).filter((exam) => exam.subjectId === subject.id);
  const answerCounts = buildValidAnswerCounts(subjectExams);
  const { questionOrder } = resolveQuestionOrder(bank, answerCounts, input.questionOrder || 'ordered');
  const ordered = rankQuestionsByProgress(bank, answerCounts, existing?.questions, questionOrder);
  const questions: StoredQuestion[] = ordered.slice(0, totalQuestions).map(({ question: item, validAnswerCount }) => ({
    id: randomUUID(), materialId: item.materialId, question: item.question, rubric: item.rubric,
    sourceLabel: item.sourceLabel, className: item.className,
    sectionNumber: item.sectionNumber, sectionTitle: item.sectionTitle, sourceNumber: item.sourceNumber,
    validAnswerCount,
  }));
  const exam: StoredExam = {
    id: randomUUID(), subjectId: subject.id, subjectName: subject.name, selectedClassIds: requestedIds,
    selectedClassNames, mode: 'development', difficulty: 'normal', questionOrder,
    poolSize, totalQuestions: questions.length, currentQuestionIndex: 0, questions,
    status: 'active', createdAt: new Date().toISOString(), revision: (existing?.revision || 0) + 1,
  };
  await examsRepo.set(exam);
  await examsRepo.setDaily(key, exam.id);
  return exam;
};

export const completeExam = async (exam: StoredExam) => {
  const scores = exam.questions.map((question) => question.evaluation?.score ?? 0);
  const finalScore = Math.round((scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1)) * 10) / 10;
  exam.status = 'completed';
  exam.completedAt = new Date().toISOString();
  exam.finalScore = finalScore;
  await examsRepo.set(exam);
  return exam;
};

export const finishExam = async (exam: StoredExam) => {
  if (exam.status !== 'completed') await completeExam(exam);
  if (exam.summary) return exam;
  const pedagogy = await generateSummary(exam);
  exam.summary = { finalScore: exam.finalScore ?? 0, ...pedagogy };
  await examsRepo.set(exam);
  return exam;
};

export const markEvaluation = (question: StoredQuestion, evaluation: Omit<Evaluation, 'finalForQuestion'>, finalForQuestion: boolean) => {
  question.evaluation = { ...evaluation, finalForQuestion };
};
