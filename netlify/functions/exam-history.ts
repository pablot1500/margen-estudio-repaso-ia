import { json, method, withErrorHandling } from '../lib/http';
import { lambda } from '../lib/lambda';
import { examsRepo } from '../lib/storage';

export const handler = lambda(withErrorHandling(async (request) => {
  method(request, ['GET']);
  const exams = await examsRepo.list();
  return json({ history: exams.map((exam) => ({
    id: exam.id, subjectId: exam.subjectId, subjectName: exam.subjectName, createdAt: exam.createdAt, completedAt: exam.completedAt,
    finalScore: exam.summary?.finalScore ?? exam.finalScore, totalQuestions: exam.totalQuestions, status: exam.status,
    selectedClassNames: exam.selectedClassNames, questionOrder: exam.questionOrder || 'random',
  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
}), '/api/exams/history');
