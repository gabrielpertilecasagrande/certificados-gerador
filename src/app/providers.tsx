"use client";

import { ConfirmProvider } from "@/components/ui/confirm";
import { TooltipProvider } from "@/components/ui/misc";
import { PromptProvider } from "@/components/ui/prompt";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <ConfirmProvider>
        <PromptProvider>{children}</PromptProvider>
      </ConfirmProvider>
    </TooltipProvider>
  );
}
