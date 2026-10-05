import { isApiKey, SESSION_COOKIE, sessionValue } from '@/lib/auth';

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (!(await isApiKey(url.searchParams.get('key')))) {
    return new Response('Invalid key', { status: 401 });
  }

  const next = url.searchParams.get('next') ?? '/';
  const location = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  const cookie = [
    `${SESSION_COOKIE}=${await sessionValue()}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * 365}`,
  ].join('; ');

  return new Response(null, {
    status: 303,
    headers: { location, 'set-cookie': cookie },
  });
}
