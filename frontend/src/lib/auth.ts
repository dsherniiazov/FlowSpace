export function parseJwtSub(token: string): number | null {
  try {
    const payload = decodeJwtPayload(token);
    if (!payload) return null;
    const parsed = JSON.parse(payload);
    const sub = Number(parsed.sub);
    return Number.isFinite(sub) ? sub : null;
  } catch {
    return null;
  }
}

export function parseJwtIsAdmin(token: string): boolean {
  try {
    const payload = decodeJwtPayload(token);
    if (!payload) return false;
    const parsed = JSON.parse(payload);
    return Boolean(parsed.is_admin);
  } catch {
    return false;
  }
}

function decodeJwtPayload(token: string): string | null {
  const raw = token.split(".")[1];
  if (!raw) return null;
  const payload = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  return atob(padded);
}
