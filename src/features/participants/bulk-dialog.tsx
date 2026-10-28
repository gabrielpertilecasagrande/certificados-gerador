"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import type { ID } from "@/lib/model/types";
import { applyTextOp, computeChanges, findReplace, TEXT_OPS, type TextOp } from "@/lib/participants/bulk";
import { useWorkspace } from "@/features/workspace/store";

export type BulkMode = "set" | "replace" | "fill" | "transform";

const TITLES: Record<BulkMode, string> = {
  set: "Definir valor",
  replace: "Localizar e substituir",
  fill: "Preencher campos vazios",
  transform: "Padronizar texto",
};

export interface BulkScope {
  /** Linhas alcançadas: selecionadas, filtradas ou todas. */
  selected: ID[];
  filtered: ID[] | null;
}

export function BulkDialog({
  mode,
  onClose,
  scope,
  initialColumnId,
  initialOp,
}: {
  mode: BulkMode | null;
  onClose: () => void;
  scope: BulkScope;
  initialColumnId?: ID;
  initialOp?: TextOp;
}) {
  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      {mode && <BulkForm key={`${mode}-${initialColumnId}-${initialOp}`} mode={mode} onClose={onClose} scope={scope} initialColumnId={initialColumnId} initialOp={initialOp} />}
    </Dialog>
  );
}

function BulkForm({ mode, onClose, scope, initialColumnId, initialOp }: { mode: BulkMode; onClose: () => void; scope: BulkScope; initialColumnId?: ID; initialOp?: TextOp }) {
  const project = useWorkspace((s) => s.project)!;
  const updateCells = useWorkspace((s) => s.updateCells);
  const [columnId, setColumnId] = useState<ID | "__all">(initialColumnId ?? (mode === "replace" ? "__all" : (project.columns[0]?.id ?? "__all")));
  const [value, setValue] = useState("");
  const [find, setFind] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeCell, setWholeCell] = useState(false);
  const [op, setOp] = useState<TextOp>(initialOp ?? "trim");
  const defaultTarget = scope.selected.length ? "selected" : scope.filtered ? "filtered" : "all";
  const [target, setTarget] = useState<"selected" | "filtered" | "all">(defaultTarget);

  const ids = target === "selected" ? scope.selected : target === "filtered" ? scope.filtered : null;
  const columns = useMemo(() => (columnId === "__all" ? project.columns.map((c) => c.id) : [columnId]), [columnId, project.columns]);

  const fn = useMemo(() => {
    switch (mode) {
      case "set":
        return () => value;
      case "fill":
        return (v: string) => (v.trim() === "" ? value : v);
      case "replace":
        return (v: string) => findReplace(v, find, value, { caseSensitive, wholeCell });
      case "transform":
        return (v: string) => applyTextOp(v, op);
    }
  }, [mode, value, find, caseSensitive, wholeCell, op]);

  const changes = useMemo(() => computeChanges(project.participants, ids, columns, fn), [project.participants, ids, columns, fn]);
  const rowsAffected = new Set(changes.map((c) => c.participantId)).size;
  const sample = changes.slice(0, 4).map((c) => {
    const p = project.participants.find((x) => x.id === c.participantId)!;
    return { before: p.values[c.columnId] ?? "", after: c.value };
  });

  const apply = () => {
    updateCells(changes);
    toast.success(`${changes.length.toLocaleString("pt-BR")} célula(s) alterada(s)`, { action: { label: "Desfazer", onClick: () => useWorkspace.temporal.getState().undo() } });
    onClose();
  };

  return (
    <DialogContent title={TITLES[mode]}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (changes.length) apply();
        }}
      >
        <DialogBody className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-col">Coluna</Label>
            <Select id="bulk-col" value={columnId} onChange={(e) => setColumnId(e.target.value)}>
              {(mode === "replace" || mode === "transform") && <option value="__all">Todas as colunas</option>}
              {project.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          {mode === "replace" && (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-find">Localizar</Label>
              <Input id="bulk-find" autoFocus value={find} onChange={(e) => setFind(e.target.value)} />
            </div>
          )}
          {mode !== "transform" ? (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-value">{mode === "replace" ? "Substituir por" : "Valor"}</Label>
              <Input id="bulk-value" autoFocus={mode !== "replace"} value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Transformação</Label>
              <Select value={op} onChange={(e) => setOp(e.target.value as TextOp)} aria-label="Transformação">
                {TEXT_OPS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {mode === "replace" && (
            <div className="flex gap-4 text-[13px]">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> Diferenciar maiúsculas
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={wholeCell} onChange={(e) => setWholeCell(e.target.checked)} /> Célula inteira
              </label>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Aplicar em</Label>
            <Segmented
              value={target}
              onChange={setTarget}
              options={[
                ...(scope.selected.length ? [{ value: "selected" as const, label: `Selecionados (${scope.selected.length})` }] : []),
                ...(scope.filtered ? [{ value: "filtered" as const, label: `Filtrados (${scope.filtered.length})` }] : []),
                { value: "all" as const, label: `Todos (${project.participants.length})` },
              ]}
            />
          </div>
          <div className="rounded-lg border border-border bg-surface-2/50 p-3 text-[13px]" data-testid="bulk-preview">
            <p className="font-medium">
              {changes.length === 0 ? "Nenhuma alteração" : `${changes.length.toLocaleString("pt-BR")} célula(s) em ${rowsAffected.toLocaleString("pt-BR")} registro(s) serão alteradas`}
            </p>
            {sample.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                {sample.map((s, i) => (
                  <li key={i} className="truncate">
                    <span className="line-through">{s.before || "(vazio)"}</span> → <span className="text-foreground">{s.after || "(vazio)"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={!changes.length} data-testid="bulk-apply">
            Aplicar
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
