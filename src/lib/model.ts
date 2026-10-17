import { stages } from '../Interfaces/application.ts';
import type { Application, Stage } from '../Interfaces/application.ts';
export const STORAGE_KEY = 'applyflow.applications.v1';
export function isApplication(value: unknown): value is Application {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    ['id', 'company', 'role', 'location', 'date', 'interviewAt', 'url', 'notes', 'color'].every(
      (k) => typeof v[k] === 'string',
    ) &&
    stages.includes(v.stage as Stage) &&
    ['Uzaktan', 'Hibrit', 'Ofiste'].includes(v.workType as string) &&
    /^#[0-9a-f]{6}$/i.test(v.color as string) &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.date as string) &&
    (v.interviewAt === '' || !Number.isNaN(new Date(v.interviewAt as string).getTime()))
  );
}
export function parseApplications(raw: string): Application[] {
  const data: unknown = JSON.parse(raw);
  if (
    !Array.isArray(data) ||
    !data.every(isApplication) ||
    new Set(data.map((a) => a.id)).size !== data.length
  )
    throw new Error('Geçersiz başvuru dosyası.');
  return data;
}
export function moveApplication(items: Application[], id: string, stage: Stage): Application[] {
  return items.map((a) => (a.id === id ? { ...a, stage } : a));
}
export function safeUrl(raw: string): string | undefined {
  try {
    const u = new URL(raw);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
