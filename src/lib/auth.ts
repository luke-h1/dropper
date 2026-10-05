import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import * as z from 'zod/mini';

import { hmac, safeEqual } from './crypto';

export const SESSION_COOKIE = 'ipa_apk_distributor_session';

export function sessionValue() {
  return hmac(process.env.API_KEY, 'session');
}

export async function isApiKey(key: string | null) {
  return key ? safeEqual(key, process.env.API_KEY) : false;
}

export async function hasSession(): Promise<boolean> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;

  return value ? safeEqual(value, await sessionValue()) : false;
}

export async function requireSession(
  path: string,
  key: string | string[] | undefined,
) {
  const single = z.string().safeParse(key);

  if (single.success) {
    return redirect(
      `/api/session?${new URLSearchParams({ key: single.data, next: path })}`,
    );
  }

  return hasSession();
}
