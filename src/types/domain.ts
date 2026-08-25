export type MaterialStatus = 'processing' | 'ready' | 'error';
export type QuestionExtractionStatus = 'pending' | 'extracting' | 'ready' | 'error';
export type ExamMode = 'review' | 'oral' | 'development' | 'multiple-choice';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type QuestionOrder = 'ordered' | 'random';
export type Verdict = 'correct' | 'partial' | 'incorrect';

export interface Subject {
  id: string;
  name: string;
  fileSearchStoreName?: string;
  weeklyClassDay?: number;
  createdAt: string;
}

export interface StudyMaterial {
  id: string;
  subjectId: string;
  classId: string;
  className: string;
  name: string;
  mimeType: string;
  size: number;
  geminiDocumentName?: string;
  geminiOperationName?: string;
  status: MaterialStatus;
  questionExtractionStatus: QuestionExtractionStatus;
  extractedQuestionCount: number;
  questionExtractionStartedAt?: string;
  questionExtractionError?: string;
  createdAt: string;
  errorMessage?: string;
}

export interface PublicExamQuestion {
  id: string;
  question: string;
  sourceLabel?: string;
  className?: string;
  sectionNumber?: string;
  sectionTitle?: string;
  sourceNumber?: string;
  validAnswerCount: number;
  followUp?: boolean;
}

export interface QuestionProgressItem {
  id: string;
  subjectId: string;
  materialId: string;
  classId: string;
  sourceLabel: string;
  className: string;
  position: number;
  sectionNumber?: string;
  sectionTitle?: string;
  sourceNumber?: string;
  question: string;
  validAnswerCount: number;
}

export interface QuestionSourceContext {
  sourceLabel: string;
  className: string;
  sectionTitles: string[];
  fragments: Array<{ title: string; content: string }>;
}

export interface Evaluation {
  score: number;
  verdict: Verdict;
  strengths: string[];
  missingConcepts: string[];
  errors: string[];
  feedback: string;
  followUpRequired: boolean;
  followUpQuestion: string | null;
  finalForQuestion: boolean;
}

export interface PublicExam {
  id: string;
  subjectId: string;
  subjectName: string;
  selectedClassIds: string[];
  selectedClassNames: string[];
  topic?: string;
  mode: ExamMode;
  difficulty: Difficulty;
  questionOrder: QuestionOrder;
  poolSize: number;
  totalQuestions: number;
  currentQuestionIndex: number;
  status: 'active' | 'completed' | 'abandoned';
  currentQuestion: PublicExamQuestion | null;
  scores: number[];
  createdAt: string;
  completedAt?: string;
  revision: number;
}

export interface ExamSummary {
  finalScore: number;
  strengths: string[];
  weakTopics: string[];
  frequentErrors: string[];
  conceptsToReview: string[];
  generalFeedback: string;
}

export interface ExamHistoryItem {
  id: string;
  subjectId: string;
  subjectName: string;
  createdAt: string;
  completedAt?: string;
  finalScore?: number;
  totalQuestions: number;
  status: 'active' | 'completed' | 'abandoned';
  selectedClassNames: string[];
  questionOrder: QuestionOrder;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
