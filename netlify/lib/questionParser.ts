export interface ParsedDocumentQuestion {
  sectionNumber: string;
  sectionTitle: string;
  sourceNumber: string;
  question: string;
}

const questionsHeading = /^\s{0,3}(?:#{1,6}\s*)?preguntas\s*:?[\s#]*$/iu;
const markdownHeading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u;
const numberedItem = /^\s*(?:\*\*)?(\d+)[.)](?:\*\*)?\s+(.+?)\s*$/u;
const numberedSection = /^\s*(?:\*\*)?(\d+)[.)](?:\*\*)?\s*/u;

const cleanSectionTitle = (value: string) => value
  .replace(/^\s*(?:\*\*)?\d+[.)](?:\*\*)?\s*/u, '')
  .replace(/\*\*/gu, '')
  .trim();

/**
 * Lee el bloque final de preguntas en apuntes de texto/Markdown.
 *
 * Formato admitido:
 *   # Preguntas
 *   ### 1. Nombre del apartado
 *   1. Pregunta...
 *   ### Preguntas integradoras
 *   1. Consigna...
 *
 * La numeración puede reiniciarse en cada apartado. Los encabezados nunca se
 * interpretan como preguntas y las consignas pueden ocupar más de una línea.
 */
export const parseDocumentQuestions = (document: string): ParsedDocumentQuestion[] => {
  const lines = document.replace(/\r\n?/gu, '\n').split('\n');
  const questions: ParsedDocumentQuestion[] = [];
  let insideQuestions = false;
  let sectionNumber = '';
  let sectionTitle = '';
  let current: ParsedDocumentQuestion | null = null;

  const commit = () => {
    if (!current) return;
    current.question = current.question.trim();
    if (current.question) questions.push(current);
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!insideQuestions) {
      if (questionsHeading.test(line)) insideQuestions = true;
      continue;
    }

    const heading = line.match(markdownHeading);
    if (heading) {
      commit();
      const level = heading[1].length;
      if (level === 1) break;
      sectionNumber = heading[2].match(numberedSection)?.[1] || '';
      sectionTitle = cleanSectionTitle(heading[2]);
      continue;
    }

    const item = line.match(numberedItem);
    if (item) {
      commit();
      current = {
        sectionNumber,
        sectionTitle,
        sourceNumber: item[1],
        question: item[2].trim(),
      };
      continue;
    }

    if (current && line.trim()) {
      current.question += `\n${line.trim()}`;
    }
  }

  commit();
  return questions;
};

export const isTextQuestionFormat = (mimeType: string, fileName: string) => {
  const normalized = mimeType.toLowerCase();
  return normalized.startsWith('text/') || /\.(?:txt|md|markdown)$/iu.test(fileName);
};
