import { GoogleGenAI } from '@google/genai';
import { AppError } from './http';
import type { Evaluation, StoredExam } from './domain';
import { evaluationJSONSchema, evaluationSchema, extractedQuestionsJSONSchema, extractedQuestionsSchema, sourceFragmentsJSONSchema, sourceFragmentsSchema, summaryJSONSchema, summarySchema } from './schemas';
import { evaluationPrompt, extractQuestionsPrompt, summaryPrompt } from './prompts';
import { isTextQuestionFormat, parseDocumentQuestions } from './questionParser';
import { groqIsPrimary, groqStructured } from './groq';
import { selectStudyContext } from './contextSelector';

const apiKey = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AppError('CONFIG_ERROR', 'Falta configurar GEMINI_API_KEY.', 500);
  return key;
};

export const modelName = () => process.env.GEMINI_MODEL || 'gemini-3.6-flash';
export const gemini = () => new GoogleGenAI({ apiKey: apiKey() });

const parseOutput = <T>(text: string | undefined, schema: { parse: (value: unknown) => T }): T => {
  if (!text) throw new AppError('GEMINI_ERROR', 'Gemini no devolvió contenido.', 502);
  try { return schema.parse(JSON.parse(text)); }
  catch { throw new AppError('GEMINI_ERROR', 'Gemini devolvió una respuesta inesperada.', 502); }
};

const repairEvaluationOutput = (value: unknown, isFollowUp: boolean) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const candidate = value as Record<string, unknown>;
  const scoreValue = typeof candidate.score === 'number' ? candidate.score : Number(candidate.score);
  const score = Number.isFinite(scoreValue) ? Math.min(10, Math.max(0, scoreValue)) : 0;
  const verdictValue = String(candidate.verdict || '');
  const verdict = verdictValue === 'correct' || verdictValue === 'partial' || verdictValue === 'incorrect'
    ? verdictValue
    : score >= 7 ? 'correct' : score >= 4 ? 'partial' : 'incorrect';
  const stringList = (entry: unknown) => Array.isArray(entry)
    ? entry.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];
  const strengths = stringList(candidate.strengths);
  const missingConcepts = stringList(candidate.missingConcepts);
  const errors = stringList(candidate.errors);
  const proposedFollowUp = typeof candidate.followUpQuestion === 'string' && candidate.followUpQuestion.trim()
    ? candidate.followUpQuestion.trim()
    : null;
  const followUpRequested = candidate.followUpRequired === true
    || (candidate.followUpRequired === undefined && Boolean(proposedFollowUp));
  const followUpRequired = !isFollowUp && verdict !== 'incorrect' && followUpRequested && Boolean(proposedFollowUp);
  const feedback = typeof candidate.feedback === 'string' && candidate.feedback.trim()
    ? candidate.feedback.trim()
    : verdict === 'incorrect'
      ? `La respuesta necesita revisar los conceptos centrales${errors[0] ? `: ${errors[0]}` : '.'}`
      : verdict === 'partial'
        ? `La respuesta muestra una comprensión parcial${missingConcepts[0] ? `, pero falta precisar: ${missingConcepts[0]}` : '.'}`
        : 'La respuesta demuestra una comprensión adecuada de los conceptos principales.';

  return {
    ...candidate,
    score,
    verdict,
    strengths,
    missingConcepts,
    errors,
    feedback,
    followUpRequired,
    followUpQuestion: followUpRequired ? proposedFollowUp : null,
  };
};

export const createFileSearchStore = async (displayName: string) => {
  const store = await gemini().fileSearchStores.create({ config: { displayName, embeddingModel: 'models/gemini-embedding-2' } });
  if (!store.name) throw new AppError('GEMINI_ERROR', 'No se pudo crear el índice de la materia.', 502);
  return store.name;
};

export const uploadMaterial = async (input: { storeName: string; file: File; materialId: string; classId: string; className: string }) => {
  const operation = await gemini().fileSearchStores.uploadToFileSearchStore({
    fileSearchStoreName: input.storeName,
    file: input.file,
    config: {
      displayName: input.file.name,
      mimeType: input.file.type,
      customMetadata: [
        { key: 'material_id', stringValue: input.materialId },
        { key: 'class_id', stringValue: input.classId },
        { key: 'class_name', stringValue: input.className },
      ],
      chunkingConfig: { whiteSpaceConfig: { maxTokensPerChunk: 400, maxOverlapTokens: 60 } },
    },
  });
  return operation;
};

export const getOperation = async (name: string): Promise<{ done?: boolean; error?: unknown; response?: { documentName?: string } }> => {
  // El SDK requiere la instancia original de Operation; esa instancia no puede
  // persistirse en Blobs. Para el polling posterior consultamos el mismo recurso
  // oficial de operaciones por REST, siempre desde la Function.
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
    headers: { 'x-goog-api-key': apiKey() },
  });
  if (!response.ok) throw new AppError('GEMINI_ERROR', 'No se pudo consultar el procesamiento del archivo.', 502);
  return response.json() as Promise<{ done?: boolean; error?: unknown; response?: { documentName?: string } }>;
};

const isRemoteNotFound = (error: unknown) => {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { status?: number; code?: number | string; message?: string };
  return candidate.status === 404
    || candidate.code === 404
    || /\b404\b|NOT_FOUND|does not exist/iu.test(candidate.message || '');
};

export const deleteDocument = async (name: string) => {
  try {
    await gemini().fileSearchStores.documents.delete({ name, config: { force: true } });
  } catch (error) {
    // El resultado buscado ya se cumplió. Esto permite limpiar registros
    // locales truncos aunque el documento remoto haya desaparecido antes.
    if (!isRemoteNotFound(error)) throw error;
  }
};

export const deleteFileSearchStore = async (name: string) => {
  try {
    await gemini().fileSearchStores.delete({ name, config: { force: true } });
  } catch (error) {
    if (!isRemoteNotFound(error)) throw error;
  }
};

export const extractQuestionsFromMaterial = async (input: { file: Blob; mimeType: string; fileName: string }) => {
  const bytes = await input.file.arrayBuffer();
  const data = Buffer.from(bytes).toString('base64');
  const parsedQuestions = isTextQuestionFormat(input.mimeType, input.fileName)
    ? parseDocumentQuestions(new TextDecoder().decode(bytes))
    : [];

  if (parsedQuestions.length > 0) {
    return {
      foundHeading: true,
      questions: parsedQuestions.map((question) => ({
        ...question,
        expectedConcepts: [],
        importantRelations: [],
        commonMistakes: [],
      })),
    };
  }

  const response = await gemini().models.generateContent({
    model: modelName(),
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: input.mimeType, data } },
      { text: extractQuestionsPrompt(input.fileName) },
    ] }],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: extractedQuestionsJSONSchema,
      maxOutputTokens: 12000,
      temperature: 0,
    },
  });
  const result = parseOutput(response.text, extractedQuestionsSchema);
  return {
    ...result,
    questions: result.questions.map((question) => ({
      ...question,
      expectedConcepts: [],
      importantRelations: [],
      commonMistakes: [],
    })),
  };
};

export const extractSourceFragmentsFromMaterial = async (input: {
  file: Blob;
  mimeType: string;
  fileName: string;
  question: string;
  sectionTitle?: string;
}) => {
  const data = Buffer.from(await input.file.arrayBuffer()).toString('base64');
  const response = await gemini().models.generateContent({
    model: modelName(),
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: input.mimeType, data } },
      { text: `Localizá en este apunte el texto teórico que sirve para responder la pregunta indicada.\n\nPregunta: ${input.question}\nApartado sugerido: ${input.sectionTitle || 'sin apartado específico'}\n\nDevolvé entre uno y tres fragmentos. Copiá fielmente el contenido del apunte, sin responder la pregunta, sin agregar explicaciones y sin incluir el bloque final titulado “Preguntas”. Usá como título el encabezado real de cada sección. Priorizá sólo los fragmentos indispensables.` },
    ] }],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: sourceFragmentsJSONSchema,
      maxOutputTokens: 6000,
      temperature: 0,
    },
  });
  return parseOutput(response.text, sourceFragmentsSchema);
};

export const evaluateAnswer = async (input: {
  exam: StoredExam; question: StoredExam['questions'][number]; answer: string; isFollowUp: boolean;
  sourceFile?: Blob; sourceMimeType?: string;
}): Promise<Omit<Evaluation, 'finalForQuestion'>> => {
  const prompt = evaluationPrompt({
    question: input.isFollowUp ? input.question.evaluation?.followUpQuestion || input.question.question : input.question.question,
    rubric: input.question.rubric,
    answer: input.answer,
    previousAnswer: input.isFollowUp ? input.question.answer : undefined,
    isFollowUp: input.isFollowUp,
    hasSourceMaterial: Boolean(input.sourceFile),
  });
  const sourceDocument = input.sourceFile && input.sourceMimeType && isTextQuestionFormat(input.sourceMimeType, '')
    ? await input.sourceFile.text()
    : undefined;
  const selectedSource = sourceDocument ? selectStudyContext(sourceDocument, {
    sectionTitle: input.question.sectionTitle,
    question: input.question.question,
  }) : undefined;
  if (groqIsPrimary() && sourceDocument && !selectedSource?.context) {
    throw new AppError('SOURCE_CONTEXT_MISSING', 'El apunte no contiene texto teórico antes del bloque de preguntas.', 422);
  }
  if (groqIsPrimary() && (selectedSource?.context || !input.sourceFile)) {
    if (selectedSource) {
      console.info('Groq study context', {
        materialId: input.question.materialId,
        strategy: selectedSource.strategy,
        originalCharacters: selectedSource.originalCharacters,
        selectedCharacters: selectedSource.selectedCharacters,
        sections: selectedSource.selectedSections,
      });
    }
    const result = await groqStructured({
      system: selectedSource ? `CORRECCIÓN CON FUENTE CERRADA.
Usá exclusivamente el contenido delimitado abajo como fuente de verdad. No completes, compares ni evalúes con conocimiento externo.
Que un dato aparezca en la fuente no significa que el estudiante deba mencionarlo: sólo es exigible si resulta necesario para responder una parte explícita de la pregunta.
No exijas ejemplos ni el desarrollo completo de la sección salvo que la consigna lo pida literalmente.

<FUENTE_AUTORIZADA>
${selectedSource.context}
</FUENTE_AUTORIZADA>` : undefined,
      prompt,
      schemaName: 'answer_evaluation',
      jsonSchema: evaluationJSONSchema,
      parse: (value) => evaluationSchema.parse(value),
      repair: (value) => repairEvaluationOutput(value, input.isFollowUp),
      maxTokens: 1200,
    });
    if (input.isFollowUp || result.verdict === 'incorrect') return { ...result, followUpRequired: false, followUpQuestion: null };
    return result;
  }
  if (input.sourceFile && input.sourceMimeType) {
    const data = Buffer.from(await input.sourceFile.arrayBuffer()).toString('base64');
    const response = await gemini().models.generateContent({
      model: modelName(),
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: input.sourceMimeType, data } },
        { text: prompt },
      ] }],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: evaluationJSONSchema,
        maxOutputTokens: 1000,
        temperature: 0,
      },
    });
    const result = parseOutput(response.text, evaluationSchema);
    if (input.isFollowUp || result.verdict === 'incorrect') return { ...result, followUpRequired: false, followUpQuestion: null };
    return result;
  }

  const interaction = await gemini().interactions.create({
    model: modelName(),
    input: prompt,
    response_format: { type: 'text', mime_type: 'application/json', schema: evaluationJSONSchema },
    generation_config: { max_output_tokens: 800, thinking_level: 'minimal' },
  });
  const result = parseOutput(interaction.output_text, evaluationSchema);
  if (input.isFollowUp) return { ...result, followUpRequired: false, followUpQuestion: null };
  if (result.verdict === 'incorrect') return { ...result, followUpRequired: false, followUpQuestion: null };
  return result;
};

export const generateSummary = async (exam: StoredExam) => {
  if (groqIsPrimary()) {
    const pedagogy = await groqStructured({
      prompt: summaryPrompt(exam),
      schemaName: 'exam_summary',
      jsonSchema: summaryJSONSchema,
      parse: (value) => summarySchema.parse(value),
      maxTokens: 1000,
    });
    return pedagogy;
  }
  const interaction = await gemini().interactions.create({
    model: modelName(), input: summaryPrompt(exam),
    response_format: { type: 'text', mime_type: 'application/json', schema: summaryJSONSchema },
    generation_config: { max_output_tokens: 900, thinking_level: 'minimal' },
  });
  return parseOutput(interaction.output_text, summarySchema);
};
