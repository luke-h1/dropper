import { cookies } from "next/headers";
import { hmac, safeEqual } from "./crypto";
import { getEnv } from "./env";

export const ACCESS_COOKIE = "dropper_access";

async function expectedCookie() {
  const env = getEnv();
  // Changing the password invalidates existing sessions.
  return hmac(env.signingSecret, `access:${env.accessPassword}`);
}

export async function hasAccess(): Promise<boolean> {
  // Read cookies first: it marks the page as dynamic, so env vars are only needed at runtime.
  const jar = await cookies();
  if (!getEnv().accessPassword) return true;
  const value = jar.get(ACCESS_COOKIE)?.value;
  if (!value) return false;
  return safeEqual(value, await expectedCookie());
}

export async function grantAccess(password: string): Promise<boolean> {
  const env = getEnv();
  if (!env.accessPassword || !(await safeEqual(password, env.accessPassword))) return false;
  (await cookies()).set(ACCESS_COOKIE, await expectedCookie(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}

export async function isUploader(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token !== "" && safeEqual(token, getEnv().uploadToken);
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
