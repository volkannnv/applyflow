export interface User {
  id: string;
  email: string;
  name: string;
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers:
        method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-ApplyFlow-Request': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.', 0);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      'Sunucu yanıt vermiyor. API sunucusunun çalıştığından emin ol.',
      response.status,
    );
  }
  if (!response.ok) {
    if (response.status === 401 && !['/auth/login', '/auth/register', '/auth/me'].includes(path))
      window.dispatchEvent(new Event('applyflow:unauthorized'));
    throw new ApiError(data.error || 'İşlem tamamlanamadı.', response.status);
  }
  return data as T;
}
