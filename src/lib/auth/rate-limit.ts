/**
 * Limitador de tentativas de login em memória (janela deslizante por IP).
 * Em ambiente serverless cada instância tem sua própria memória: o limite é por instância,
 * o que ainda torna força bruta impraticável para uma ferramenta interna. Para um limite global,
 * substitua por um armazenamento compartilhado (ex.: Upstash Redis / Vercel KV).
 */
const WINDOW_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

const attempts = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  const list = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) attempts.set(key, list);
  else attempts.delete(key);
  // Evita crescimento sem limite: descarta chaves antigas.
  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) if (!v.some((t) => now - t < WINDOW_MS)) attempts.delete(k);
  }
  return list;
}

export function checkRateLimit(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const list = recent(key, now);
  if (list.length < MAX_ATTEMPTS) return { allowed: true, retryAfterSeconds: 0 };
  return { allowed: false, retryAfterSeconds: Math.ceil((WINDOW_MS - (now - list[0])) / 1000) };
}

export function registerFailure(key: string, now = Date.now()) {
  const list = recent(key, now);
  list.push(now);
  attempts.set(key, list);
}

export function resetAttempts(key: string) {
  attempts.delete(key);
}
