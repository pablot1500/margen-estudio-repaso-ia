import type { Difficulty, ExamMode, Evaluation, ExamSummary, QuestionOrder, StudyMaterial, Subject } from '../../src/types/domain';

export interface QuestionRubric {
  expectedConcepts: string[];
  importantRelations: string[];
  commonMistakes: string[];
}

export interface StoredQuestion {
  id: string;
  materialId?: string;
  question: string;
  rubric: QuestionRubric;
  sourceLabel?: string;
  className?: string;
  sectionNumber?: string;
  sectionTitle?: string;
  sourceNumber?: string;
  validAnswerCount?: number;
  answer?: string;
  followUpAnswer?: string;
  evaluation?: Evaluation;
  followUpAsked?: boolean;
}

export interface ExtractedQuestion {
  id: string;
  materialId: string;
  subjectId: string;
  classId: string;
  className: string;
  sourceLabel: string;
  sectionNumber?: string;
  sectionTitle?: string;
  sourceNumber?: string;
  position: number;
  question: string;
  rubric: QuestionRubric;
  createdAt: string;
}

export interface StoredExam {
  id: string;
  subjectId: string;
  subjectName: string;
  selectedClassIds: string[];
  selectedClassNames: string[];
  topic?: string;
  mode: ExamMode;
  difficulty: Difficulty;
  questionOrder?: QuestionOrder;
  poolSize: number;
  totalQuestions: number;
  currentQuestionIndex: number;
  questions: StoredQuestion[];
  status: 'active' | 'completed' | 'abandoned';
  createdAt: string;
  completedAt?: string;
  revision: number;
  finalScore?: number;
  summary?: ExamSummary;
}

export type { Difficulty, ExamMode, Evaluation, ExamSummary, QuestionOrder, StudyMaterial, Subject };
