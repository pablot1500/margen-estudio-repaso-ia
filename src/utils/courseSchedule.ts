import type { QuestionProgressItem, StudyMaterial, Subject } from '../types/domain';

export const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

export interface ClassRhythm {
  classId: string;
  className: string;
  totalQuestions: number;
  pendingQuestions: number;
  completedQuestions: number;
}

export interface SubjectRhythm {
  subjectId: string;
  subjectName: string;
  weeklyClassDay?: number;
  daysUntilClass?: number;
  studyDaysRemaining?: number;
  dailyTarget?: number;
  totalQuestions: number;
  pendingQuestions: number;
  completedQuestions: number;
  currentClass?: ClassRhythm;
  backlogClasses: ClassRhythm[];
  pendingClasses: ClassRhythm[];
}

const weekdayIndexInArgentina = (date: Date) => {
  const shortDay = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(shortDay);
};

export const daysUntilWeeklyClass = (weeklyClassDay: number, date = new Date()) =>
  (weeklyClassDay - weekdayIndexInArgentina(date) + 7) % 7;

const numberInClassName = (name: string) => {
  const labelled = name.match(/\b(?:clase|semana|unidad|m[oó]dulo)\s*0*(\d+)\b/iu);
  const generic = name.match(/\b0*(\d+)\b/u);
  const value = Number.parseInt(labelled?.[1] || generic?.[1] || '', 10);
  return Number.isFinite(value) ? value : undefined;
};

export const buildSubjectRhythm = (
  subject: Subject,
  materials: StudyMaterial[],
  progress: QuestionProgressItem[],
  date = new Date(),
): SubjectRhythm => {
  const readyMaterials = materials.filter((material) =>
    material.subjectId === subject.id
    && material.status === 'ready'
    && material.questionExtractionStatus === 'ready');
  const materialById = new Map(readyMaterials.map((material) => [material.id, material]));
  const classMeta = new Map<string, { classId: string; className: string; createdAt: string }>();
  readyMaterials.forEach((material) => {
    const current = classMeta.get(material.classId);
    if (!current || material.createdAt < current.createdAt) {
      classMeta.set(material.classId, { classId: material.classId, className: material.className, createdAt: material.createdAt });
    }
  });

  const questionsByClass = new Map<string, QuestionProgressItem[]>();
  progress.forEach((item) => {
    const material = materialById.get(item.materialId);
    if (!material) return;
    const group = questionsByClass.get(material.classId) || [];
    group.push(item);
    questionsByClass.set(material.classId, group);
  });

  const classes = [...classMeta.values()].map((meta) => {
    const questions = questionsByClass.get(meta.classId) || [];
    const pendingQuestions = questions.filter((item) => item.validAnswerCount === 0).length;
    return {
      ...meta,
      totalQuestions: questions.length,
      pendingQuestions,
      completedQuestions: questions.length - pendingQuestions,
      order: numberInClassName(meta.className),
    };
  }).sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined && a.order !== b.order) return a.order - b.order;
    return a.createdAt.localeCompare(b.createdAt) || a.className.localeCompare(b.className, 'es');
  });

  const currentClass = classes.at(-1);
  const publicClasses: ClassRhythm[] = classes.map(({ classId, className, totalQuestions, pendingQuestions, completedQuestions }) => ({
    classId, className, totalQuestions, pendingQuestions, completedQuestions,
  }));
  const publicCurrent = currentClass
    ? publicClasses.find((item) => item.classId === currentClass.classId)
    : undefined;
  const backlogClasses = publicClasses.filter((item) => item.classId !== publicCurrent?.classId && item.pendingQuestions > 0);
  const pendingClasses = publicClasses.filter((item) => item.pendingQuestions > 0);
  const totalQuestions = publicClasses.reduce((sum, item) => sum + item.totalQuestions, 0);
  const pendingQuestions = pendingClasses.reduce((sum, item) => sum + item.pendingQuestions, 0);
  const daysUntilClass = subject.weeklyClassDay === undefined ? undefined : daysUntilWeeklyClass(subject.weeklyClassDay, date);
  const studyDaysRemaining = daysUntilClass === undefined ? undefined : daysUntilClass === 0 ? 1 : Math.min(5, daysUntilClass);
  const dailyTarget = studyDaysRemaining === undefined || pendingQuestions === 0
    ? pendingQuestions === 0 ? 0 : undefined
    : Math.ceil(pendingQuestions / studyDaysRemaining);

  return {
    subjectId: subject.id,
    subjectName: subject.name,
    weeklyClassDay: subject.weeklyClassDay,
    daysUntilClass,
    studyDaysRemaining,
    dailyTarget,
    totalQuestions,
    pendingQuestions,
    completedQuestions: totalQuestions - pendingQuestions,
    currentClass: publicCurrent,
    backlogClasses,
    pendingClasses,
  };
};
