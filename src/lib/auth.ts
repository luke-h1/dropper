import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hmac, safeEqual } from "./crypto";
import { getEnv } from "./env";

export const SESSION_COOKIE = "dropper_session";

// Derived from the key, so rotating API_KEY signs everyone out.
export function sessionValue() {
  return hmac(getEnv().apiKey, "session");
}

export function isApiKey(key: string | null | undefined) {
  return key ? safeEqual(key, getEnv().apiKey) : Promise.resolve(false);
}

export async function hasSession(): Promise<boolean> {
  // Read cookies first: it marks the page as dynamic, so env vars are only needed at runtime.
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value ? safeEqual(value, await sessionValue()) : false;
}

/** For pages: a `?key=` param is swapped for a session cookie and dropped from the URL. */
export async function requireSession(path: string, key: string | string[] | undefined) {
  if (typeof key === "string") redirect(`/api/session?${new URLSearchParams({ key, next: path })}`);
  return hasSession();
}

export async function hasApiKey(request: Request) {
  return isApiKey(request.headers.get("x-api-key"));
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
