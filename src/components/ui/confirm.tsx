"use client";

import { AlertDialog as A } from "radix-ui";
import * as React from "react";
import { Button } from "./button";

interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

type Resolver = (ok: boolean) => void;
const ConfirmContext = React.createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOptions & { resolve: Resolver }) | null>(null);
  const confirm = React.useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  return (
    <ConfirmContext value={confirm}>
      {children}
      <A.Root open={!!state} onOpenChange={(o) => !o && close(false)}>
        <A.Portal>
          <A.Overlay className="fixed inset-0 z-50 bg-gray-950/30 animate-fade-in" />
          <A.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-pop animate-pop-in">
            <A.Title className="text-[15px] font-semibold">{state?.title}</A.Title>
            <A.Description className="mt-1.5 text-sm text-muted">{state?.description ?? ""}</A.Description>
            <div className="mt-5 flex justify-end gap-2">
              <A.Cancel asChild>
                <Button variant="secondary">Cancelar</Button>
              </A.Cancel>
              <A.Action asChild>
                <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)}>
                  {state?.confirmLabel ?? "Confirmar"}
                </Button>
              </A.Action>
            </div>
          </A.Content>
        </A.Portal>
      </A.Root>
    </ConfirmContext>
  );
}

export const useConfirm = () => React.use(ConfirmContext);
