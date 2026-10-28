"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/misc";

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.assign(new URL("/login", window.location.origin).toString());
}

export function LogoutButton({ compact }: { compact?: boolean }) {
  return compact ? (
    <Tip label="Sair">
      <Button variant="ghost" size="icon" onClick={logout} aria-label="Sair">
        <LogOut />
      </Button>
    </Tip>
  ) : (
    <Button variant="ghost" size="sm" onClick={logout}>
      <LogOut /> Sair
    </Button>
  );
}
