"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Label, Select } from "@/components/ui/input";
import type { ID, TemplateRule } from "@/lib/model/types";
import { normalizeForCompare } from "@/lib/import/validate";
import { distinctValues, templateAssignments } from "@/lib/participants/templates";
import { useWorkspace } from "@/features/workspace/store";

const KEEP = "__keep";

/** Associa valores de uma coluna (ex.: Categoria) a modelos; as regras valem também para novas importações. */
export function TemplateRulesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>{open && <RulesForm onClose={() => onOpenChange(false)} />}</Dialog>;
}

function RulesForm({ onClose }: { onClose: () => void }) {
  const project = useWorkspace((s) => s.project)!;
  const initialColumn =
    project.templateRules[0]?.columnId ?? project.columns.find((c) => c.key === "categoria" || c.key === "funcao" || c.key === "tipo")?.id ?? project.columns[0]?.id ?? "";
  const [columnId, setColumnId] = useState<ID>(initialColumn);
  const values = useMemo(() => distinctValues(project, columnId).slice(0, 60), [project, columnId]);
  const [map, setMap] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const r of project.templateRules) if (r.columnId === initialColumn) m[normalizeForCompare(r.value)] = r.templateId;
    return m;
  });

  const rules: TemplateRule[] = values
    .map((v) => ({ value: v.value, templateId: map[normalizeForCompare(v.value)] }))
    .filter((r) => r.templateId && r.templateId !== KEEP)
    .map((r) => ({ columnId, value: r.value, templateId: r.templateId }));
  const changes = templateAssignments({ ...project, templateRules: rules }).length;

  const apply = () => {
    const s = useWorkspace.getState();
    s.setTemplateRules(rules);
    const n = s.applyTemplateRules();
    toast.success(n ? `${n} participante(s) mudaram de modelo` : "Regras salvas");
    onClose();
  };

  return (
    <DialogContent title="Regras de modelo" description="Escolha qual modelo cada valor usa. As regras também valem para participantes importados depois.">
      <DialogBody className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="rule-col">Coluna</Label>
          <Select
            id="rule-col"
            value={columnId}
            onChange={(e) => {
              setColumnId(e.target.value);
              setMap({});
            }}
          >
            {project.columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <ul className="max-h-80 space-y-1.5 overflow-y-auto scrollbar-thin">
          {values.map((v) => (
            <li key={v.value} className="grid grid-cols-[1fr_180px] items-center gap-2 text-[13px]">
              <span className="truncate">
                {v.value || <span className="text-muted">(vazio)</span>} <span className="text-xs text-muted">· {v.count}</span>
              </span>
              <Select
                className="h-8"
                value={map[normalizeForCompare(v.value)] ?? KEEP}
                onChange={(e) => setMap({ ...map, [normalizeForCompare(v.value)]: e.target.value })}
                aria-label={`Modelo para ${v.value || "vazio"}`}
              >
                <option value={KEEP}>Sem regra</option>
                {project.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-muted" data-testid="rules-preview">
          {changes ? `${changes} participante(s) mudarão de modelo` : "Nenhum participante muda de modelo agora"}
        </p>
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={apply} data-testid="apply-rules">
          Salvar e aplicar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
