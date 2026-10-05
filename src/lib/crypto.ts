const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/** Compares two strings without leaking where they differ. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const secret = crypto.getRandomValues(new Uint8Array(32)).join(",");
  const [ha, hb] = await Promise.all([hmac(secret, a), hmac(secret, b)]);
  return ha === hb;
}

export async function signInstallLink(
  secret: string,
  id: string,
  ttlSeconds: number,
  now = Date.now(),
) {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return { exp, sig: await hmac(secret, `install:${id}:${exp}`) };
}

export async function verifyInstallLink(
  secret: string,
  id: string,
  exp: number,
  sig: string,
  now = Date.now(),
): Promise<boolean> {
  if (!Number.isFinite(exp) || exp < Math.floor(now / 1000)) return false;
  return safeEqual(sig, await hmac(secret, `install:${id}:${exp}`));
}
