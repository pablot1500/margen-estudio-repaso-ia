import { z } from 'zod';

export const extractedQuestionsSchema = z.object({
  foundHeading: z.boolean(),
  questions: z.array(z.object({
    sectionNumber: z.string(),
    sectionTitle: z.string(),
    sourceNumber: z.string(),
    question: z.string().min(8),
  })),
});

export const sourceFragmentsSchema = z.object({
  fragments: z.array(z.object({
    title: z.string().min(1),
    content: z.string().min(1),
  })).min(1).max(3),
});

export const evaluationSchema = z.object({
  score: z.number().min(0).max(10),
  verdict: z.enum(['correct', 'partial', 'incorrect']),
  strengths: z.array(z.string()),
  missingConcepts: z.array(z.string()),
  errors: z.array(z.string()),
  feedback: z.string(),
  followUpRequired: z.boolean(),
  followUpQuestion: z.string().nullable(),
});

export const summarySchema = z.object({
  strengths: z.array(z.string()),
  weakTopics: z.array(z.string()),
  frequentErrors: z.array(z.string()),
  conceptsToReview: z.array(z.string()),
  generalFeedback: z.string(),
});

export const extractedQuestionsJSONSchema = {
  type: 'object',
  properties: {
    foundHeading: { type: 'boolean' },
    questions: { type: 'array', items: { type: 'object', properties: {
      sectionNumber: { type: 'string' }, sectionTitle: { type: 'string' }, sourceNumber: { type: 'string' },
      question: { type: 'string' },
    }, required: ['sectionNumber', 'sectionTitle', 'sourceNumber', 'question'] } },
  }, required: ['foundHeading', 'questions'],
};

export const sourceFragmentsJSONSchema = {
  type: 'object',
  properties: {
    fragments: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['title', 'content'],
        additionalProperties: false,
      },
    },
  },
  required: ['fragments'],
  additionalProperties: false,
};

export const evaluationJSONSchema = {
  type: 'object', properties: {
    score: { type: 'number' }, verdict: { type: 'string', enum: ['correct', 'partial', 'incorrect'] },
    strengths: { type: 'array', items: { type: 'string' } }, missingConcepts: { type: 'array', items: { type: 'string' } },
    errors: { type: 'array', items: { type: 'string' } }, feedback: { type: 'string' },
    followUpRequired: { type: 'boolean' }, followUpQuestion: { type: ['string', 'null'] },
  }, required: ['score', 'verdict', 'strengths', 'missingConcepts', 'errors', 'feedback', 'followUpRequired', 'followUpQuestion'], additionalProperties: false,
};

export const summaryJSONSchema = {
  type: 'object', properties: {
    strengths: { type: 'array', items: { type: 'string' } }, weakTopics: { type: 'array', items: { type: 'string' } },
    frequentErrors: { type: 'array', items: { type: 'string' } }, conceptsToReview: { type: 'array', items: { type: 'string' } },
    generalFeedback: { type: 'string' },
  }, required: ['strengths', 'weakTopics', 'frequentErrors', 'conceptsToReview', 'generalFeedback'], additionalProperties: false,
};
