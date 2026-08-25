import { randomUUID } from 'node:crypto';
import type { Config } from '@netlify/functions';
import { AppError, json, method, readJSON, withErrorHandling } from '../lib/http';
import { subjectsRepo } from '../lib/storage';

export default withErrorHandling(async (request) => {
  method(request, ['GET', 'POST', 'PATCH']);
  if (request.method === 'GET') {
    const subjects = await subjectsRepo.list();
    return json({ subjects: subjects.sort((a, b) => a.name.localeCompare(b.name)) });
  }
  if (request.method === 'PATCH') {
    const { id, weeklyClassDay } = await readJSON<{ id?: string; weeklyClassDay?: number | null }>(request);
    if (!id) throw new AppError('INVALID_SUBJECT', 'Elegí una materia válida.');
    if (weeklyClassDay !== null && (typeof weeklyClassDay !== 'number' || !Number.isInteger(weeklyClassDay) || weeklyClassDay < 0 || weeklyClassDay > 6)) {
      throw new AppError('INVALID_CLASS_DAY', 'Elegí un día de clase válido.');
    }
    const subject = await subjectsRepo.get(id);
    if (!subject) throw new AppError('SUBJECT_NOT_FOUND', 'La materia seleccionada no existe.', 404);
    if (weeklyClassDay === null) delete subject.weeklyClassDay;
    else subject.weeklyClassDay = weeklyClassDay;
    await subjectsRepo.set(subject);
    return json({ subject });
  }
  const { name } = await readJSON<{ name?: string }>(request);
  const cleanName = name?.trim();
  if (!cleanName || cleanName.length > 100) throw new AppError('INVALID_SUBJECT', 'Ingresá un nombre de materia válido.');
  const id = randomUUID();
  const subject = { id, name: cleanName, createdAt: new Date().toISOString() };
  await subjectsRepo.set(subject);
  return json({ subject }, 201);
});

export const config: Config = { path: '/api/subjects' };
