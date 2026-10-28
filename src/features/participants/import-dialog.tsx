"use client";

import { ClipboardPaste, FileSpreadsheet, TriangleAlert, UploadCloud } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Label, Select, Textarea } from "@/components/ui/input";
import { Badge, Segmented, Spinner } from "@/components/ui/misc";
import { buildImport, parsePastedText, parseSpreadsheetFile, suggestMapping, type ColumnTarget, type SheetTable } from "@/lib/import/spreadsheet";
import { validateParticipants } from "@/lib/import/validate";
import { findNameColumn } from "@/lib/variables";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "@/features/workspace/store";

type Source = "file" | "paste";

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const project = useWorkspace((s) => s.project)!;
  const addParticipants = useWorkspace((s) => s.addParticipants);
  const [source, setSource] = useState<Source>("file");
  const [table, setTable] = useState<SheetTable | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<ColumnTarget[]>([]);
  const [mode, setMode] = useState<"append" | "replace">(project.participants.length ? "append" : "replace");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTable(null);
    setFile(null);
    setMapping([]);
    setPaste("");
  };

  const load = (t: SheetTable) => {
    if (!t.headers.length || !t.rows.length) {
      toast.error("Nenhum dado encontrado. A primeira linha deve conter os títulos das colunas.");
      return;
    }
    setTable(t);
    setMapping(suggestMapping(t.headers, project.columns));
  };

  async function readFile(f: File | undefined, sheet?: string) {
    if (!f) return;
    setBusy(true);
    try {
      setFile(f);
      load(await parseSpreadsheetFile(f, sheet));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler a planilha");
    } finally {
      setBusy(false);
    }
  }

  const result = useMemo(() => (table ? buildImport(table, mapping, project.columns, project.templates[0].id) : null), [table, mapping, project.columns, project.templates]);
  const validation = useMemo(() => {
    if (!result) return null;
    const nameCol = findNameColumn(result.columns);
    const all = mode === "append" ? [...project.participants, ...result.participants] : result.participants;
    return { ...validateParticipants(all, result.columns, nameCol?.id), nameCol };
  }, [result, mode, project.participants]);

  function confirm() {
    if (!result) return;
    addParticipants(result.participants, result.columns, mode === "replace");
    toast.success(`${result.participants.length.toLocaleString("pt-BR")} participantes importados`);
    onOpenChange(false);
    reset();
  }

  const targetValue = (m: ColumnTarget) => (m.kind === "ignore" ? "__ignore" : m.kind === "existing" ? m.columnId : "__new");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent wide title="Importar participantes" description={table ? "Confira as colunas e confirme." : "Planilha Excel (.xlsx), CSV ou dados colados de uma planilha."}>
        {!table ? (
          <DialogBody className="space-y-4">
            <Segmented
              value={source}
              onChange={setSource}
              options={[
                { value: "file", label: <><FileSpreadsheet /> Arquivo</> },
                { value: "paste", label: <><ClipboardPaste /> Colar dados</> },
              ]}
            />
            {source === "file" ? (
              <button
                type="button"
                onClick={() => input.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  readFile(e.dataTransfer.files[0]);
                }}
                className={cn(
                  "flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border-strong bg-surface-2/50 px-6 py-12 text-center hover:border-primary hover:bg-primary-soft/40",
                  over && "border-primary bg-primary-soft",
                )}
              >
                {busy ? <Spinner className="size-6 text-primary" /> : <UploadCloud className="size-7 text-primary" />}
                <span className="text-sm font-medium">Arraste a planilha ou clique para escolher</span>
                <span className="text-xs text-muted">XLSX ou CSV · a primeira linha deve ter os títulos das colunas</span>
              </button>
            ) : (
              <div className="space-y-2">
                <Textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  rows={10}
                  placeholder={"Copie as células da planilha (incluindo a linha de títulos) e cole aqui.\n\nNome\tEmpresa\tCarga horária\nMaria Silva\tEmpresa A\t8h"}
                  className="font-mono text-xs"
                  aria-label="Dados colados"
                />
                <div className="flex justify-end">
                  <Button variant="primary" disabled={!paste.trim()} onClick={() => load(parsePastedText(paste))}>
                    Continuar
                  </Button>
                </div>
              </div>
            )}
            <input
              ref={input}
              type="file"
              hidden
              accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => {
                readFile(e.target.files?.[0]);
                e.target.value = "";
              }}
              data-testid="spreadsheet-input"
            />
          </DialogBody>
        ) : (
          <DialogBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="primary">{table.rows.length.toLocaleString("pt-BR")} linhas</Badge>
              <Badge>{table.headers.length} colunas</Badge>
              {table.sheetNames && table.sheetNames.length > 1 && file && (
                <Select className="h-8 w-48" value={table.sheetName} onChange={(e) => readFile(file, e.target.value)} aria-label="Aba da planilha">
                  {table.sheetNames.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              )}
              <button className="ml-auto text-xs text-primary hover:underline" onClick={reset}>
                Escolher outro arquivo
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border scrollbar-thin">
              <table className="w-full min-w-max border-collapse text-[13px]">
                <thead>
                  <tr className="bg-surface-2/70">
                    {table.headers.map((h, i) => (
                      <th key={i} className="min-w-44 border-b border-r border-border p-2 text-left align-top font-normal last:border-r-0">
                        <p className="mb-1.5 truncate text-xs font-semibold" title={h}>
                          {h}
                        </p>
                        <Select
                          className="h-8 text-xs"
                          value={targetValue(mapping[i])}
                          onChange={(e) => {
                            const v = e.target.value;
                            const next = [...mapping];
                            next[i] = v === "__ignore" ? { kind: "ignore" } : v === "__new" ? { kind: "new", label: h, key: h } : { kind: "existing", columnId: v };
                            setMapping(next);
                          }}
                          aria-label={`Destino da coluna ${h}`}
                        >
                          <option value="__new">Nova coluna “{h}”</option>
                          {project.columns.map((c) => (
                            <option key={c.id} value={c.id}>
                              → {c.label}
                            </option>
                          ))}
                          <option value="__ignore">Ignorar coluna</option>
                        </Select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.slice(0, 6).map((r, ri) => (
                    <tr key={ri} className="border-b border-border last:border-b-0">
                      {r.map((c, ci) => (
                        <td key={ci} className={cn("max-w-56 truncate border-r border-border px-2 py-1.5 last:border-r-0", mapping[ci]?.kind === "ignore" && "text-muted/50 line-through")}>
                          {c || <span className="text-muted/50">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {table.rows.length > 6 && <p className="-mt-2 text-xs text-muted">… e mais {(table.rows.length - 6).toLocaleString("pt-BR")} linhas</p>}

            {validation && (
              <div className="space-y-1.5 rounded-lg border border-border bg-surface-2/40 p-3 text-[13px]">
                {!validation.nameCol && (
                  <p className="flex items-center gap-1.5 text-warning">
                    <TriangleAlert className="size-4" /> Nenhuma coluna de nome identificada. Renomeie o destino para “Nome” se necessário.
                  </p>
                )}
                {validation.emptyName.length > 0 && (
                  <p className="flex items-center gap-1.5 text-warning">
                    <TriangleAlert className="size-4" /> {validation.emptyName.length} linha(s) sem nome
                  </p>
                )}
                {validation.duplicates.length > 0 && (
                  <p className="flex items-center gap-1.5 text-warning">
                    <TriangleAlert className="size-4" /> {validation.duplicates.length} nome(s) repetido(s)
                    {mode === "append" ? " (considerando os participantes atuais)" : ""}
                  </p>
                )}
                {validation.nameCol && !validation.emptyName.length && !validation.duplicates.length && <p className="text-success">Nenhum problema encontrado.</p>}
                <p className="text-xs text-muted">Você poderá corrigir tudo na tabela depois de importar.</p>
              </div>
            )}

            {project.participants.length > 0 && (
              <div className="space-y-1.5">
                <Label>Participantes atuais ({project.participants.length.toLocaleString("pt-BR")})</Label>
                <Segmented
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "append", label: "Adicionar ao final" },
                    { value: "replace", label: "Substituir a lista" },
                  ]}
                />
              </div>
            )}
          </DialogBody>
        )}
        {table && (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button variant="primary" onClick={confirm} disabled={!mapping.some((m) => m.kind !== "ignore")} data-testid="confirm-import">
              Importar {table.rows.length.toLocaleString("pt-BR")} participantes
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
