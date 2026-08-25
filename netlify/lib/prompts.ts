import type { QuestionRubric, StoredExam } from './domain';

export const extractQuestionsPrompt = (fileName: string) => `Analizá exclusivamente el documento "${fileName}" adjunto.

Tu tarea NO es crear preguntas.

El formato esperado al final es jerárquico:

# Preguntas
### 1. El costo y la gestión empresarial
1. ¿Cómo define la clase el concepto de costo?
2. Otra pregunta...
### Preguntas integradoras
1. Explicá...

Reglas obligatorias:
1. El encabezado principal "Preguntas" abre el banco. Puede variar sólo en mayúsculas, minúsculas, dos puntos o nivel/estilo visual.
2. Los encabezados internos, por ejemplo "### 1. El costo..." y "### Preguntas integradoras", son APARTADOS: nunca son preguntas.
3. La numeración de preguntas puede reiniciarse dentro de cada apartado. Extraé todas las consignas numeradas en su orden global.
4. En sectionNumber devolvé el número del apartado; en sectionTitle, su título sin ese número; y en sourceNumber, el número de la pregunta dentro del apartado. Para "Preguntas integradoras", sectionNumber debe ser una cadena vacía.
5. En question devolvé sólo la consigna, sin el marcador de lista inicial. Conservá fielmente palabras, signos, fórmulas y énfasis.
6. Una consigna puede no llevar signos de interrogación (por ejemplo, "Explicá...") y puede ocupar varias líneas.
7. No reformules, no resumas, no combines y no inventes preguntas. Ignorá interrogaciones anteriores al encabezado principal.
8. Si el encabezado no existe o no hay consignas debajo, devolvé foundHeading=false y una lista vacía.

Mantené exactamente el orden del documento.`;

export const evaluationPrompt = (input: {
  question: string;
  rubric: QuestionRubric;
  answer: string;
  previousAnswer?: string;
  isFollowUp: boolean;
  hasSourceMaterial?: boolean;
}) => `Actuá como evaluador universitario preciso, justo y estrictamente limitado por la consigna y la fuente autorizada.

Pregunta: ${input.question}
${input.hasSourceMaterial ? 'El material incluido como archivo o contexto es la única fuente autorizada para corregir.' : `Rúbrica interna derivada del material y única fuente autorizada: ${JSON.stringify(input.rubric)}`}
${input.previousAnswer ? `Respuesta principal previa: ${input.previousAnswer}` : ''}
${input.isFollowUp ? 'Respuesta a la repregunta' : 'Respuesta del estudiante'}: ${input.answer}

REGLA CENTRAL DE ALCANCE:
Evaluá únicamente si la respuesta satisface lo que la pregunta pide de manera explícita. La sección o el fragmento suministrado puede contener más información que la necesaria: esa información adicional NO se convierte en parte de la consigna.

Reglas obligatorias de corrección:
1. No descuentes puntos por no incluir ejemplos, casos, aplicaciones o analogías, salvo que la pregunta pida explícitamente “ejemplos”, “ejemplificá”, “aplicá” o una formulación equivalente.
2. Si la pregunta consulta un concepto o aspecto específico de un apartado, no exijas explicar el apartado completo, sus otros conceptos ni todo el contexto que lo rodea.
3. No uses conocimiento general, externo o inferido para crear requisitos. Está prohibido descontar puntos, registrar omisiones o formular repreguntas por información que no aparezca en la fuente autorizada.
4. Tampoco descuentes por brevedad, estilo, falta de terminología literal o distinto orden expositivo si la idea necesaria está expresada correctamente con palabras propias.
5. Sólo marcá una omisión cuando se cumplan ambas condiciones: (a) corresponde a una cláusula explícita de la pregunta y (b) está respaldada directamente por la fuente autorizada.
6. Sólo marcá un error cuando la respuesta contradiga la fuente o responda incorrectamente una cláusula explícita. No confundas “no agregó información opcional” con un error.
7. Ante una pregunta ambigua, adoptá la interpretación mínima suficiente que pueda responderse con la fuente; no amplíes la exigencia.

Escala orientativa:
- 9–10: responde correctamente todas las partes explícitas, aunque sea breve y no agregue ejemplos no solicitados.
- 7–8.9: comprensión adecuada con alguna imprecisión menor sobre algo efectivamente pedido.
- 4–6.9: comprensión parcial u omisión de una parte explícitamente pedida.
- 0–3.9: respuesta mayormente incorrecta, contradictoria o que no aborda la consigna.

Evaluá comprensión conceptual, no coincidencias textuales. Asigná nota de 0 a 10. En strengths, missingConcepts, errors y feedback mencioná solamente criterios permitidos por las reglas anteriores.

${input.isFollowUp ? 'Esta es la única repregunta permitida: emití una evaluación final combinando ambas respuestas y devolvé followUpRequired=false.' : 'Sólo si falta una parte explícitamente pedida y respaldada por la fuente, podés devolver followUpRequired=true con una repregunta breve limitada exactamente a esa parte. No uses la repregunta para pedir ejemplos opcionales, ampliar el apartado ni incorporar conocimiento externo. Si la respuesta es incorrecta, no hagas repregunta: debe reintentar la pregunta principal.'}`;

export const summaryPrompt = (exam: StoredExam) => `Actuá como profesor universitario y redactá un cierre pedagógico breve. No calcules una nueva nota.

Materia: ${exam.subjectName}
Resultados: ${JSON.stringify(exam.questions.map((q) => ({ question: q.question, score: q.evaluation?.score, strengths: q.evaluation?.strengths, missing: q.evaluation?.missingConcepts, errors: q.evaluation?.errors })))}

Devolvé fortalezas, temas débiles, errores frecuentes, conceptos a repasar y una devolución general accionable.`;
