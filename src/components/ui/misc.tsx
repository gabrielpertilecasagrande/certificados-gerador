"use client";

import { Tooltip as T, Switch as S, Popover as P, Progress as Pr } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <T.Provider delayDuration={350} skipDelayDuration={100}>{children}</T.Provider>;
}

export function Tip({ label, children, side = "bottom", shortcut }: { label: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right"; shortcut?: string }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-[60] rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-pop animate-fade-in">
          {label}
          {shortcut && <span className="ml-2 text-gray-400">{shortcut}</span>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-border-strong transition-colors data-[state=checked]:bg-primary disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-soft transition-transform data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  );
}

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;

export function PopoverContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content sideOffset={sideOffset} className={cn("z-50 rounded-lg border border-border bg-surface p-3 shadow-pop animate-pop-in", className)} {...props} />
    </P.Portal>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <Pr.Root value={value} className={cn("relative h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <Pr.Indicator className="h-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </Pr.Root>
  );
}

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "primary" | "success" | "warning" | "danger" }) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone], className)} {...props} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1 font-sans text-[10px] text-muted">{children}</kbd>;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} aria-hidden />;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-md border border-border bg-surface-2 p-0.5", className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-7 min-w-7 flex-1 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded px-2 text-xs font-medium text-muted transition-colors [&_svg]:size-3.5",
            value === o.value ? "bg-surface text-foreground shadow-soft" : "hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
