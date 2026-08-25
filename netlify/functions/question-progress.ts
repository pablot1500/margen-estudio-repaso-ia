import { json, method, withErrorHandling } from '../lib/http';
import { lambda } from '../lib/lambda';
import { buildValidAnswerCounts, validAnswerCountFor } from '../lib/questionProgress';
import { examsRepo, questionsRepo } from '../lib/storage';

export const handler = lambda(withErrorHandling(async (request) => {
  method(request, ['GET']);
  const subjectId = new URL(request.url).searchParams.get('subjectId') || undefined;
  const [questions, exams] = await Promise.all([questionsRepo.list(subjectId), examsRepo.list()]);
  const relevantExams = subjectId ? exams.filter((exam) => exam.subjectId === subjectId) : exams;
  const counts = buildValidAnswerCounts(relevantExams);
  const progress = questions
    .sort((a, b) => a.className.localeCompare(b.className, 'es') || a.position - b.position)
    .map((question) => ({
      id: question.id,
      subjectId: question.subjectId,
      materialId: question.materialId,
      classId: question.classId,
      sourceLabel: question.sourceLabel,
      className: question.className,
      position: question.position,
      sectionNumber: question.sectionNumber,
      sectionTitle: question.sectionTitle,
      sourceNumber: question.sourceNumber,
      question: question.question,
      validAnswerCount: validAnswerCountFor(question, counts),
    }));
  return json({ progress });
}), '/api/questions/progress');
