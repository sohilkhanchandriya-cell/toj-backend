import { Request } from 'express';

export function getBaseUrl(req?: Request): string {
  if (req) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host) {
      return `${proto}://${host}`;
    }
  }
  return process.env.BASE_URL || 'http://localhost:5000';
}

export function normalizeMediaUrl(url: string | null | undefined, req?: Request): string {
  if (!url) return '';
  if (url.startsWith('https://api.dicebear.com')) return url;

  const match = url.match(/\/uploads\/.+$/);
  if (match) {
    const base = getBaseUrl(req);
    return `${base}${match[0]}`;
  }
  return url;
}
