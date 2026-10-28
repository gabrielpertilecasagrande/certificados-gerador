"use client";

import { ChevronLeft, ChevronRight, Search, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import { findNameColumn, stripAccents } from "@/lib/variables";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "./store";

/** Navegação entre participantes: anterior/próximo, busca e "Certificado N de M". */
export function ParticipantNav({ className }: { className?: string }) {
  const project = useWorkspace((s) => s.project);
  const activeId = useWorkspace((s) => s.activeParticipantId);
  const setUi = useWorkspace((s) => s.setUi);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const participants = useMemo(() => project?.participants ?? [], [project?.participants]);
  const nameCol = project ? findNameColumn(project.columns) : undefined;
  const index = participants.findIndex((p) => p.id === activeId);
  const label = (i: number) => {
    const p = participants[i];
    if (!p) return "";
    return (nameCol ? p.values[nameCol.id] : Object.values(p.values)[0])?.trim() || `Participante ${i + 1}`;
  };

  const results = useMemo(() => {
    const q = stripAccents(query).toLowerCase().trim();
    const out: number[] = [];
    for (let i = 0; i < participants.length && out.length < 50; i++) {
      const p = participants[i];
      const text = stripAccents(Object.values(p.values).join(" ")).toLowerCase();
      if (!q || text.includes(q)) out.push(i);
    }
    return out;
  }, [participants, query]);

  if (participants.length === 0) return null;
  const go = (i: number) => setUi({ activeParticipantId: participants[(i + participants.length) % participants.length].id });

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground" onClick={() => go(index - 1)} aria-label="Certificado anterior">
        <ChevronLeft className="size-4" />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex min-w-0 max-w-72 items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1 text-left text-[13px] shadow-soft hover:border-border-strong" data-testid="participant-picker">
            <UserRound className="size-3.5 shrink-0 text-muted" />
            <span className="truncate font-medium">{label(index)}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted" data-testid="participant-position">
              {index + 1} de {participants.length.toLocaleString("pt-BR")}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="center">
          <div className="relative border-b border-border p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar participante"
              className="h-8 w-full rounded-md bg-surface-2 pl-8 pr-2 text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0] !== undefined) {
                  go(results[0]);
                  setOpen(false);
                }
              }}
            />
          </div>
          <ul className="max-h-72 overflow-y-auto p-1 scrollbar-thin">
            {results.map((i) => (
              <li key={participants[i].id}>
                <button
                  className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2", i === index && "bg-primary-soft text-primary")}
                  onClick={() => {
                    go(i);
                    setOpen(false);
                  }}
                >
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{i + 1}</span>
                  <span className="truncate">{label(i)}</span>
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="px-2 py-3 text-center text-sm text-muted">Nenhum resultado</li>}
          </ul>
        </PopoverContent>
      </Popover>
      <button className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground" onClick={() => go(index + 1)} aria-label="Próximo certificado">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
