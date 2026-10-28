"use client";

import * as React from "react";
import { Button } from "./button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "./dialog";
import { Input } from "./input";

interface PromptOptions {
  title: string;
  label?: string;
  defaultValue?: string;
  confirmLabel?: string;
}

const PromptContext = React.createContext<(o: PromptOptions) => Promise<string | null>>(async () => null);

export function PromptProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(PromptOptions & { resolve: (v: string | null) => void }) | null>(null);
  const [value, setValue] = React.useState("");
  const prompt = React.useCallback(
    (o: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setValue(o.defaultValue ?? "");
        setState({ ...o, resolve });
      }),
    [],
  );
  const close = (v: string | null) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <PromptContext value={prompt}>
      {children}
      <Dialog open={!!state} onOpenChange={(o) => !o && close(null)}>
        {state && (
          <DialogContent title={state.title}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                close(value.trim() ? value : null);
              }}
            >
              <DialogBody>
                <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} aria-label={state.label ?? state.title} />
              </DialogBody>
              <DialogFooter>
                <Button onClick={() => close(null)}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={!value.trim()}>
                  {state.confirmLabel ?? "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </PromptContext>
  );
}

export const usePrompt = () => React.use(PromptContext);
