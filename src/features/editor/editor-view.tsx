"use client";

import { FileSpreadsheet, PenLine, RotateCcw, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Switch } from "@/components/ui/misc";
import { useFontsVersion, useResolved } from "@/features/workspace/hooks";
import { ParticipantNav } from "@/features/workspace/participant-nav";
import { useActiveParticipant, useActiveTemplate, useWorkspace } from "@/features/workspace/store";
import { cn } from "@/lib/utils/cn";
import { EditorCanvas } from "./editor-canvas";
import { LeftPanel } from "./left-panel";
import { PropertiesPanel } from "./properties-panel";

export function EditorView() {
  const project = useWorkspace((s) => s.project);
  const template = useActiveTemplate();
  const participant = useActiveParticipant();
  const individualMode = useWorkspace((s) => s.individualMode);
  const setUi = useWorkspace((s) => s.setUi);
  const clearOverrides = useWorkspace((s) => s.clearOverrides);
  const fontsVersion = useFontsVersion();
  const cert = useResolved(project, participant, template, fontsVersion);

  const overriddenIds = useMemo(() => new Set(Object.keys(participant?.overrides ?? {})), [participant]);
  const errors = cert?.issues.filter((i) => i.severity === "error" && i.code !== "no-background") ?? [];

  if (!project || !template) return null;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface md:block">
        <LeftPanel />
      </aside>

      <section className={cn("relative flex min-w-0 flex-1 flex-col", individualMode && "ring-2 ring-inset ring-amber-400")}>
        {individualMode && (
          <div className="flex items-center gap-2 bg-amber-400 px-3 py-1 text-xs font-medium text-amber-950">
            <PenLine className="size-3.5" />
            Editando somente este certificado — as alterações não afetam os demais participantes.
          </div>
        )}
        <div className="relative min-h-0 flex-1">
          <EditorCanvas template={template} cert={cert} overriddenIds={overriddenIds} individualMode={individualMode} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border bg-surface px-3 py-2">
          {project.participants.length > 0 ? (
            <>
              <ParticipantNav />
              <label className="flex items-center gap-2 text-[13px]">
                <Switch
                  checked={individualMode}
                  onCheckedChange={(v) => setUi({ individualMode: v })}
                  aria-label="Editar somente este certificado"
                  className="data-[state=checked]:bg-amber-500"
                  data-testid="individual-toggle"
                />
                Editar somente este certificado
              </label>
              {participant && overriddenIds.size > 0 && (
                <Button size="sm" variant="ghost" onClick={() => clearOverrides(participant.id)}>
                  <RotateCcw /> Restaurar global ({overriddenIds.size})
                </Button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <Badge>Dados de exemplo</Badge>
              Importe a planilha para ver os certificados reais.
              <Button size="sm" variant="secondary" onClick={() => setUi({ tab: "participants" })}>
                <FileSpreadsheet /> Importar participantes
              </Button>
            </div>
          )}
          {errors.length > 0 && (
            <span className="ml-auto flex items-center gap-1 text-xs font-medium text-danger" data-testid="cert-errors">
              <TriangleAlert className="size-3.5" /> {errors[0].message}
              {errors.length > 1 && ` (+${errors.length - 1})`}
            </span>
          )}
        </div>
      </section>

      <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-border bg-surface scrollbar-thin lg:block" data-testid="properties-panel">
        <PropertiesPanel issues={cert?.issues ?? []} />
      </aside>
    </div>
  );
}
