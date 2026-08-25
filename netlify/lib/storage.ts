import { getStore } from '@netlify/blobs';
import type { ExtractedQuestion, StoredExam, StudyMaterial, Subject } from './domain';

const data = () => getStore({ name: 'margen-data', consistency: 'strong' });
const materialFiles = () => getStore({ name: 'margen-material-files', consistency: 'strong' });

const listJSON = async <T>(prefix: string): Promise<T[]> => {
  const result = await data().list({ prefix });
  return Promise.all(result.blobs.map((blob) => data().get(blob.key, { type: 'json', consistency: 'strong' }) as Promise<T>));
};

const withInferredSectionNumbers = (questions: ExtractedQuestion[]) => {
  const byMaterial = new Map<string, ExtractedQuestion[]>();
  questions.forEach((question) => {
    const group = byMaterial.get(question.materialId) || [];
    group.push(question);
    byMaterial.set(question.materialId, group);
  });
  byMaterial.forEach((group) => {
    let lastTitle = '';
    let inferredNumber = 0;
    let currentNumber = '';
    [...group].sort((a, b) => a.position - b.position).forEach((question) => {
      const title = question.sectionTitle?.trim() || '';
      if (title !== lastTitle) {
        lastTitle = title;
        if (title.toLocaleLowerCase('es') === 'preguntas integradoras') currentNumber = '';
        else if (title) {
          const explicit = Number.parseInt(question.sectionNumber || '', 10);
          inferredNumber = Number.isFinite(explicit) ? explicit : inferredNumber + 1;
          currentNumber = String(inferredNumber);
        } else currentNumber = '';
      }
      if (!question.sectionNumber && currentNumber) question.sectionNumber = currentNumber;
    });
  });
  return questions;
};

export const subjectsRepo = {
  list: () => listJSON<Subject>('subject/'),
  get: (id: string) => data().get(`subject/${id}`, { type: 'json', consistency: 'strong' }) as Promise<Subject | null>,
  set: (subject: Subject) => data().setJSON(`subject/${subject.id}`, subject),
  delete: (id: string) => data().delete(`subject/${id}`),
};

export const materialsRepo = {
  list: async (subjectId?: string) => {
    const all = await listJSON<StudyMaterial>('material/');
    return subjectId ? all.filter((item) => item.subjectId === subjectId) : all;
  },
  get: (id: string) => data().get(`material/${id}`, { type: 'json', consistency: 'strong' }) as Promise<StudyMaterial | null>,
  set: (material: StudyMaterial) => data().setJSON(`material/${material.id}`, material),
  delete: (id: string) => data().delete(`material/${id}`),
};

export const materialFilesRepo = {
  set: (id: string, file: Blob) => materialFiles().set(`material/${id}`, file),
  get: (id: string) => materialFiles().get(`material/${id}`, { type: 'blob', consistency: 'strong' }),
  delete: (id: string) => materialFiles().delete(`material/${id}`),
};

export const questionsRepo = {
  list: async (subjectId?: string) => {
    const all = withInferredSectionNumbers(await listJSON<ExtractedQuestion>('question/'));
    return subjectId ? all.filter((item) => item.subjectId === subjectId) : all;
  },
  set: (question: ExtractedQuestion) => data().setJSON(`question/${question.id}`, question),
  deleteForMaterial: async (materialId: string) => {
    const questions = await listJSON<ExtractedQuestion>('question/');
    await Promise.all(questions.filter((item) => item.materialId === materialId).map((item) => data().delete(`question/${item.id}`)));
  },
  deleteForSubject: async (subjectId: string) => {
    const questions = await listJSON<ExtractedQuestion>('question/');
    await Promise.all(questions.filter((item) => item.subjectId === subjectId).map((item) => data().delete(`question/${item.id}`)));
  },
};

export const examsRepo = {
  list: () => listJSON<StoredExam>('exam/'),
  get: (id: string) => data().get(`exam/${id}`, { type: 'json', consistency: 'strong' }) as Promise<StoredExam | null>,
  set: (exam: StoredExam) => data().setJSON(`exam/${exam.id}`, exam),
  getDaily: (key: string) => data().get(`daily/${key}`, { type: 'json', consistency: 'strong' }) as Promise<{ examId: string } | null>,
  setDaily: (key: string, examId: string) => data().setJSON(`daily/${key}`, { examId }),
  deleteForSubject: async (subjectId: string) => {
    const exams = await listJSON<StoredExam>('exam/');
    const selected = exams.filter((item) => item.subjectId === subjectId);
    const examIds = new Set(selected.map((item) => item.id));
    const daily = await data().list({ prefix: 'daily/' });
    const dailyEntries = await Promise.all(daily.blobs.map(async (blob) => ({
      key: blob.key,
      value: await data().get(blob.key, { type: 'json', consistency: 'strong' }) as { examId?: string } | null,
    })));
    await Promise.all([
      ...selected.map((item) => data().delete(`exam/${item.id}`)),
      ...dailyEntries.filter((item) => item.value?.examId && examIds.has(item.value.examId)).map((item) => data().delete(item.key)),
    ]);
  },
};
