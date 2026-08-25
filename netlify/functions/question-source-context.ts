import { selectStudyContext } from '../lib/contextSelector';
import { extractSourceFragmentsFromMaterial } from '../lib/gemini';
import { AppError, json, method, withErrorHandling } from '../lib/http';
import { lambda } from '../lib/lambda';
import { isTextQuestionFormat } from '../lib/questionParser';
import { examsRepo, materialFilesRepo, materialsRepo } from '../lib/storage';

export const handler = lambda(withErrorHandling(async (request) => {
  method(request, ['GET']);
  const params = new URL(request.url).searchParams;
  const examId = params.get('examId') || '';
  const questionId = params.get('questionId') || '';
  const exam = examId ? await examsRepo.get(examId) : null;
  if (!exam) throw new AppError('EXAM_NOT_FOUND', 'No encontramos ese examen.', 404);
  const question = exam.questions.find((item) => item.id === questionId);
  if (!question) throw new AppError('QUESTION_NOT_FOUND', 'No encontramos esa pregunta en el repaso.', 404);
  if (!question.materialId) throw new AppError('SOURCE_NOT_FOUND', 'Esta pregunta no tiene un apunte asociado.', 404);

  const material = await materialsRepo.get(question.materialId);
  const file = material ? await materialFilesRepo.get(material.id) : null;
  if (!material || !file) throw new AppError('SOURCE_NOT_FOUND', 'El apunte asociado ya no está disponible.', 404);

  let fragments: Array<{ title: string; content: string }>;
  if (isTextQuestionFormat(material.mimeType, material.name)) {
    fragments = selectStudyContext(await file.text(), {
      sectionTitle: question.sectionTitle,
      question: question.question,
    }).fragments;
  } else {
    fragments = (await extractSourceFragmentsFromMaterial({
      file,
      mimeType: material.mimeType,
      fileName: material.name,
      question: question.question,
      sectionTitle: question.sectionTitle,
    })).fragments;
  }

  if (!fragments.length || !fragments.some((fragment) => fragment.content.trim())) {
    throw new AppError('SOURCE_CONTEXT_MISSING', 'No encontramos un fragmento teórico para esta pregunta.', 404);
  }

  return json({
    context: {
      sourceLabel: material.name,
      className: material.className,
      sectionTitles: fragments.map((fragment) => fragment.title),
      fragments,
    },
  });
}), '/api/questions/source-context');
