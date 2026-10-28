import * as React from "react";
import { cn } from "@/lib/utils/cn";

const base =
  "w-full rounded-md border border-border bg-surface px-2.5 text-sm text-foreground shadow-[inset_0_1px_0_rgb(16_24_40/0.02)] placeholder:text-muted/70 transition-colors hover:border-border-strong focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/15 disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(base, "h-9", className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(base, "min-h-20 py-2 leading-relaxed", className)} {...props} />;
  },
);

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-muted", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        base,
        "h-9 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat pr-7",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

interface NumberFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: number;
  onValueChange: (v: number) => void;
  suffix?: string;
  prefix?: string;
  digits?: number;
}

/** Campo numérico que só confirma ao sair/Enter (evita gerar um passo de histórico por tecla). */
export function NumberField({ value, onValueChange, suffix, prefix, digits = 1, className, min, max, step = 1, ...props }: NumberFieldProps) {
  const fmt = React.useCallback(
    (v: number) => (Number.isFinite(v) ? String(Math.round(v * 10 ** digits) / 10 ** digits).replace(".", ",") : ""),
    [digits],
  );
  const [text, setText] = React.useState(fmt(value));
  const [focused, setFocused] = React.useState(false);
  const shown = focused ? text : fmt(value);

  const commit = (raw: string) => {
    const n = parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(n)) return setText(fmt(value));
    let v = n;
    if (min !== undefined) v = Math.max(Number(min), v);
    if (max !== undefined) v = Math.min(Number(max), v);
    if (v !== value) onValueChange(v);
    setText(fmt(v));
  };

  return (
    <div className={cn("relative flex items-center", className)}>
      {prefix && <span className="pointer-events-none absolute left-2 text-[11px] font-medium text-muted">{prefix}</span>}
      <input
        inputMode="decimal"
        className={cn(base, "h-8 tabular-nums", suffix ? "pr-8" : "")}
        style={prefix ? { paddingLeft: 14 + prefix.length * 6.5 } : undefined}
        value={shown}
        onFocus={(e) => {
          setText(fmt(value));
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={(e) => {
          setFocused(false);
          commit(e.currentTarget.value);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const delta = (e.key === "ArrowUp" ? 1 : -1) * Number(step) * (e.shiftKey ? 10 : 1);
            const n = parseFloat(e.currentTarget.value.replace(",", ".")) || 0;
            const next = n + delta;
            setText(fmt(next));
            commit(String(next));
          }
          if (e.key === "Escape") e.currentTarget.blur();
        }}
        {...props}
      />
      {suffix && <span className="pointer-events-none absolute right-2 text-[11px] text-muted">{suffix}</span>}
    </div>
  );
}
