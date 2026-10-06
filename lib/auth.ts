// Edge/Node-compatible session token: HMAC(AUTH_SECRET, DASHBOARD_PASSWORD).
// Changing either env var logs everyone out.
export const COOKIE = "sd_session";

export async function expectedToken() {
  const password = process.env.DASHBOARD_PASSWORD ?? "";
  const secret = process.env.AUTH_SECRET || password;
  if (!password) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`salesdash:${password}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
