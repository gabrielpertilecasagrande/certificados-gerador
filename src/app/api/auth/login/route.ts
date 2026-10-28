import { NextResponse, type NextRequest } from "next/server";
import { checkPassword } from "@/lib/auth/password";
import { checkRateLimit, registerFailure, resetAttempts } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth/session";

function clientKey(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export async function POST(req: NextRequest) {
  const key = clientKey(req);
  const limit = checkRateLimit(key);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Muitas tentativas. Tente novamente em ${Math.ceil(limit.retryAfterSeconds / 60)} min.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  let ok = false;
  try {
    ok = password.length > 0 && password.length <= 512 && checkPassword(password);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Acesso não configurado no servidor" }, { status: 500 });
  }

  if (!ok) {
    registerFailure(key);
    return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
  }

  resetAttempts(key);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  return res;
}
