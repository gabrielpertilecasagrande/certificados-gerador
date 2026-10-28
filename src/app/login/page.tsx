import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/logo";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(60rem_30rem_at_50%_-10%,#dbe7ff_0%,transparent_60%)]"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="size-11" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Estúdio de Certificados</h1>
          <p className="mt-1 text-sm text-muted">Acesso restrito à equipe</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-pop">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
