export interface StudySection {
  title: string;
  content: string;
}

export interface SelectedStudyContext {
  context: string;
  fragments: StudySection[];
  strategy: 'exact-section' | 'ranked-sections' | 'document-fallback';
  selectedSections: string[];
  originalCharacters: number;
  selectedCharacters: number;
}

const MAX_CONTEXT_CHARACTERS = 9_000;
const mainQuestionsHeading = /^\s{0,3}(?:#{1,6}\s*)?preguntas\s*:?\s*#*\s*$/iu;
const questionSectionHeading = /^\s{0,3}#{2,6}\s+(?:\d+[.)]\s*)?(.+?)\s*#*\s*$/u;
const numberedBodyHeading = /^\s*(\d+)[.)]\s+(.+?)\s*$/u;

const stopWords = new Set([
  'acerca', 'actualmente', 'ademas', 'alguna', 'algunos', 'ante', 'cada', 'clase', 'como', 'concepto',
  'cual', 'cuales', 'cuando', 'dentro', 'desde', 'diferencia', 'donde', 'empresa', 'entre', 'esta', 'estas',
  'este', 'estos', 'explica', 'explicar', 'hace', 'hacia', 'informacion', 'manera', 'menciona', 'mismo',
  'para', 'permite', 'porque', 'principal', 'puede', 'pueden', 'relacion', 'respecto', 'segun', 'sobre',
  'tiene', 'todos', 'través', 'utiliza', 'utilizan', 'verdad', 'vista',
]);

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/gu, '')
  .replace(/\*|_|`/gu, '')
  .toLowerCase()
  .replace(/[^a-z0-9ñ]+/gu, ' ')
  .trim();

const terms = (value: string) => [...new Set(normalize(value)
  .split(/\s+/u)
  .filter((term) => term.length >= 4 && !stopWords.has(term)))];

const limitContext = (value: string, maxCharacters = MAX_CONTEXT_CHARACTERS) => {
  if (value.length <= maxCharacters) return value.trim();
  const sliced = value.slice(0, maxCharacters);
  const lastBreak = Math.max(sliced.lastIndexOf('\n\n'), sliced.lastIndexOf('.\n'));
  return `${sliced.slice(0, lastBreak > maxCharacters * .65 ? lastBreak + 1 : maxCharacters).trim()}\n[…]`;
};

const splitDocument = (document: string) => {
  const normalizedDocument = document.replace(/\r\n?/gu, '\n');
  const lines = normalizedDocument.split('\n');
  const questionsIndex = lines.findIndex((line) => mainQuestionsHeading.test(line));
  return {
    bodyLines: questionsIndex >= 0 ? lines.slice(0, questionsIndex) : lines,
    questionLines: questionsIndex >= 0 ? lines.slice(questionsIndex + 1) : [],
    originalCharacters: normalizedDocument.length,
  };
};

const buildStudySections = (bodyLines: string[], questionLines: string[]): StudySection[] => {
  const knownTitles = questionLines.flatMap((line) => {
    const match = line.match(questionSectionHeading);
    if (!match) return [];
    const title = match[1].replace(/\*\*/gu, '').trim();
    return normalize(title) === 'preguntas integradoras' ? [] : [title];
  });
  const normalizedTitles = new Map(knownTitles.map((title) => [normalize(title), title]));
  const starts = bodyLines.flatMap((line, index) => {
    const match = line.match(numberedBodyHeading);
    if (!match) return [];
    const title = normalizedTitles.get(normalize(match[2]));
    return title ? [{ index, title }] : [];
  });

  return starts.map((start, index) => ({
    title: start.title,
    content: bodyLines.slice(start.index, starts[index + 1]?.index ?? bodyLines.length).join('\n').trim(),
  })).filter((section) => section.content);
};

const scoreSection = (section: StudySection, queryTerms: string[], normalizedQuery: string) => {
  const title = normalize(section.title);
  const content = normalize(section.content);
  const titleWithoutArticle = title.replace(/^(?:el|la|los|las)\s+/u, '');
  const phraseScore = normalizedQuery.includes(title) || normalizedQuery.includes(titleWithoutArticle) ? 24 : 0;
  return phraseScore + queryTerms.reduce((score, term) => {
    const titleScore = title.includes(term) ? 8 : 0;
    const occurrences = content.split(term).length - 1;
    return score + titleScore + Math.min(occurrences, 4);
  }, 0);
};

export const selectStudyContext = (
  document: string,
  input: { sectionTitle?: string; question: string },
  maxCharacters = MAX_CONTEXT_CHARACTERS,
): SelectedStudyContext => {
  const { bodyLines, questionLines, originalCharacters } = splitDocument(document);
  const body = bodyLines.join('\n').trim();
  const sections = buildStudySections(bodyLines, questionLines);
  const requestedTitle = normalize(input.sectionTitle || '');
  const exact = requestedTitle
    ? sections.find((section) => normalize(section.title) === requestedTitle)
    : undefined;

  if (exact) {
    const context = limitContext(exact.content, maxCharacters);
    return {
      context,
      fragments: [{ title: exact.title, content: context }],
      strategy: 'exact-section',
      selectedSections: [exact.title],
      originalCharacters,
      selectedCharacters: context.length,
    };
  }

  const normalizedQuery = normalize(`${input.sectionTitle || ''} ${input.question}`);
  const queryTerms = terms(normalizedQuery);
  const ranked = sections
    .map((section, index) => ({ section, index, score: scoreSection(section, queryTerms, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.section);

  if (ranked.length) {
    const joined = ranked.map((section) => section.content).join('\n\n---\n\n');
    const context = limitContext(joined, maxCharacters);
    const fragments = context.split('\n\n---\n\n').map((content, index) => ({
      title: ranked[index]?.title || `Fragmento ${index + 1}`,
      content: content.trim(),
    })).filter((fragment) => fragment.content);
    return {
      context,
      fragments,
      strategy: 'ranked-sections',
      selectedSections: fragments.map((fragment) => fragment.title),
      originalCharacters,
      selectedCharacters: context.length,
    };
  }

  const context = limitContext(body, maxCharacters);
  return {
    context,
    fragments: context ? [{ title: input.sectionTitle || 'Contexto general', content: context }] : [],
    strategy: 'document-fallback',
    selectedSections: [],
    originalCharacters,
    selectedCharacters: context.length,
  };
};
