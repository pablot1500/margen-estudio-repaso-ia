import type { Evaluation, ExamHistoryItem, ExamSummary, PublicExam, QuestionOrder, QuestionProgressItem, QuestionSourceContext, StudyMaterial, Subject } from '../types/domain';

export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

const request = async <T>(url: string, options?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'include', ...options, headers: { ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options?.headers } });
  } catch {
    throw new ApiClientError('NETWORK_ERROR', 'No pudimos conectar con el servidor. Revisá tu conexión.', 0);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiClientError(body?.error?.code || 'UNKNOWN_ERROR', body?.error?.message || 'Ocurrió un error inesperado.', response.status);
  return body as T;
};

export const api = {
  session: () => request<{ authenticated: boolean }>('/api/auth/session'),
  login: (password: string) => request<{ authenticated: boolean }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  health: (ai = false) => request<{ ok: boolean; provider: string; status: string; model: string }>(`/api/health${ai ? '?ai=1' : ''}`),
  subjects: () => request<{ subjects: Subject[] }>('/api/subjects'),
  createSubject: (name: string) => request<{ subject: Subject }>('/api/subjects', { method: 'POST', body: JSON.stringify({ name }) }),
  updateSubjectSchedule: (id: string, weeklyClassDay: number | null) => request<{ subject: Subject }>('/api/subjects', { method: 'PATCH', body: JSON.stringify({ id, weeklyClassDay }) }),
  deleteSubject: (id: string) => request<{ deleted: true; deletedMaterials: number }>(`/api/subjects/${id}`, { method: 'DELETE' }),
  materials: (subjectId?: string) => request<{ materials: StudyMaterial[] }>(`/api/materials${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ''}`),
  uploadMaterial: (form: FormData) => request<{ material: StudyMaterial }>('/api/materials/upload', { method: 'POST', body: form }),
  deleteMaterial: (id: string) => request<{ deleted: true }>(`/api/materials/item/${id}`, { method: 'DELETE' }),
  extractMaterialQuestions: (id: string) => request<{ material: StudyMaterial }>(`/api/materials/item/${id}/extract-questions`, { method: 'POST' }),
  questionProgress: (subjectId?: string) => request<{ progress: QuestionProgressItem[] }>(`/api/questions/progress${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ''}`),
  questionSource: (examId: string, questionId: string) => request<{ context: QuestionSourceContext }>(`/api/questions/source-context?examId=${encodeURIComponent(examId)}&questionId=${encodeURIComponent(questionId)}`),
  startExam: (input: { subjectId: string; selectedClassIds: string[]; regenerate?: boolean; questionOrder?: QuestionOrder }) =>
    request<{ exam: PublicExam }>('/api/exams/start', { method: 'POST', body: JSON.stringify(input) }),
  answer: (examId: string, questionId: string, answer: string) => request<{ evaluation: Evaluation; exam: PublicExam; completed: boolean; summary: ExamSummary | null }>(`/api/exams/${examId}/answer`, { method: 'POST', body: JSON.stringify({ questionId, answer }) }),
  skipFollowUp: (examId: string, questionId: string) => request<{ evaluation: Evaluation; exam: PublicExam; completed: boolean; summary: ExamSummary | null }>('/api/exams/skip-follow-up', { method: 'POST', body: JSON.stringify({ examId, questionId }) }),
  exam: (id: string) => request<{ exam: PublicExam; summary: ExamSummary | null }>(`/api/exams/detail/${id}`),
  history: () => request<{ history: ExamHistoryItem[] }>('/api/exams/history'),
};
