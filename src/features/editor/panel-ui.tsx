"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

export function Section({
  title,
  children,
  defaultOpen = true,
  actions,
  className,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cn("border-b border-border", className)}>
      <div className="flex items-center gap-1 px-4 pt-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 cursor-pointer items-center gap-1 py-0.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-foreground"
          aria-expanded={open}
        >
          <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
          {title}
        </button>
        {actions}
      </div>
      <div className={cn("space-y-2.5 px-4 pb-4 pt-2.5", !open && "hidden")}>{children}</div>
    </section>
  );
}

export function Row({ label, children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[72px_1fr] items-center gap-2", className)}>
      <span className="truncate text-xs text-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ColorInput({ value, onChange, allowNone, label }: { value: string | null; onChange: (v: string | null) => void; allowNone?: boolean; label?: string }) {
  const hex = value ?? "#000000";
  return (
    <div className="flex items-center gap-2">
      <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border shadow-soft" aria-label={label ?? "Cor"}>
        <span className={cn("absolute inset-0", !value && "checkerboard")} style={value ? { background: value } : undefined} />
        <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={hex} onChange={(e) => onChange(e.target.value)} />
      </label>
      <input
        className="h-8 w-full min-w-0 rounded-md border border-border bg-surface px-2 font-mono text-xs uppercase focus:border-primary focus:outline-none"
        value={value ?? ""}
        placeholder={allowNone ? "Sem cor" : "#000000"}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (allowNone && v === "") onChange(null);
          else if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v);
        }}
        aria-label={label ?? "Código da cor"}
      />
      {allowNone && value && (
        <button type="button" className="text-xs text-muted hover:text-foreground" onClick={() => onChange(null)}>
          Nenhuma
        </button>
      )}
    </div>
  );
}
