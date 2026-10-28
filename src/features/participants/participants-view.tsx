"use client";

import {
  ArrowDownAZ,
  ArrowUpAZ,
  CaseSensitive,
  CircleAlert,
  CircleCheck,
  Columns3,
  Copy,
  Eraser,
  Eye,
  FileSpreadsheet,
  MoreVertical,
  PaintBucket,
  Pencil,
  Plus,
  Replace,
  Search,
  Trash2,
  TriangleAlert,
  UserPlus,
  X,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { usePrompt } from "@/components/ui/prompt";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Segmented, Tip } from "@/components/ui/misc";
import type { Column, ID, Participant } from "@/lib/model/types";
import { parseClipboardGrid, toClipboardGrid, TEXT_OPS, type TextOp } from "@/lib/participants/bulk";
import { cn } from "@/lib/utils/cn";
import { newId } from "@/lib/utils/id";
import { stripAccents } from "@/lib/variables";
import { useWorkspace } from "@/features/workspace/store";
import { useDiagnostics } from "@/features/workspace/use-diagnostics";
import { BulkDialog, type BulkMode } from "./bulk-dialog";
import { ImportDialog } from "./import-dialog";

const ROW_H = 36;
const COL_W = 200;
type Filter = "all" | "problems" | "selected";

export function ParticipantsView() {
  const project = useWorkspace((s) => s.project)!;
  const selected = useWorkspace((s) => s.selectedRowIds);
  const setUi = useWorkspace((s) => s.setUi);
  const store = useWorkspace;
  const confirm = useConfirm();
  const prompt = usePrompt();
  const diag = useDiagnostics();

  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ col: ID; dir: 1 | -1 } | null>(null);
  const [bulk, setBulk] = useState<{ mode: BulkMode; col?: ID; op?: TextOp } | null>(null);

  const columns = project.columns;
  const rows = useMemo(() => {
    const q = stripAccents(query).toLowerCase().trim();
    let list = project.participants.map((p, index) => ({ p, index }));
    if (q) list = list.filter(({ p }) => stripAccents(Object.values(p.values).join(" ")).toLowerCase().includes(q));
    if (filter === "problems") list = list.filter(({ p }) => diag.byParticipant.has(p.id));
    if (filter === "selected") list = list.filter(({ p }) => selected.has(p.id));
    if (sort) {
      const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
      list = [...list].sort((a, b) => sort.dir * collator.compare(a.p.values[sort.col] ?? "", b.p.values[sort.col] ?? ""));
    }
    return list;
  }, [project.participants, query, filter, sort, diag.byParticipant, selected]);

  const isFiltered = !!query.trim() || filter !== "all";
  const filteredIds = useMemo(() => (isFiltered ? rows.map((r) => r.p.id) : null), [isFiltered, rows]);
  useEffect(() => {
    setUi({ filteredRowIds: filteredIds });
  }, [filteredIds, setUi]);

  const selectedIds = useMemo(() => [...selected], [selected]);
  const setSelected = useCallback((ids: Iterable<ID>) => setUi({ selectedRowIds: new Set(ids) }), [setUi]);

  const runTransform = async (op: TextOp, col?: ID) => setBulk({ mode: "transform", op, col });

  const deleteSelected = async () => {
    const ok = await confirm({ title: `Excluir ${selectedIds.length} participante(s)?`, description: "Você pode desfazer com Ctrl+Z.", confirmLabel: "Excluir", danger: true });
    if (ok) store.getState().deleteParticipants(selectedIds);
  };

  if (project.participants.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <FileSpreadsheet className="size-6" />
          </div>
          <h2 className="mt-4 text-base font-semibold">Importe a lista de participantes</h2>
          <p className="mt-1 text-sm text-muted">Planilha Excel ou CSV com uma linha por participante. Os nomes das colunas viram variáveis para usar no certificado.</p>
          <div className="mt-5 flex gap-2">
            <Button variant="primary" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet /> Importar planilha
            </Button>
            <Button
              onClick={() => {
                const s = store.getState();
                s.ensureColumn("nome", "Nome");
                s.addEmptyParticipant();
              }}
            >
              <UserPlus /> Digitar manualmente
            </Button>
          </div>
        </div>
        <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" className="h-8 pl-8" aria-label="Buscar participantes" />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `Todos ${project.participants.length.toLocaleString("pt-BR")}` },
            { value: "problems", label: <span className="flex items-center gap-1"><TriangleAlert className="text-warning" />{diag.errorCount + diag.warningCount}</span>, title: "Com problemas" },
            { value: "selected", label: `Selecionados ${selected.size}` },
          ]}
        />
        <div className="ml-auto flex flex-wrap gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <PaintBucket /> Editar em massa
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setBulk({ mode: "replace" })}>
                <Replace /> Localizar e substituir
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setBulk({ mode: "set" })}>
                <Pencil /> Definir valor
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setBulk({ mode: "fill" })}>
                <PaintBucket /> Preencher vazios
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Padronizar</DropdownMenuLabel>
              {TEXT_OPS.map((o) => (
                <DropdownMenuItem key={o.id} onSelect={() => runTransform(o.id)}>
                  <CaseSensitive /> {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            onClick={async () => {
              const label = await prompt({ title: "Nova coluna", label: "Nome da coluna", confirmLabel: "Criar coluna" });
              if (label) store.getState().addColumn(label);
            }}
          >
            <Columns3 /> Coluna
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (!columns.length) store.getState().ensureColumn("nome", "Nome");
              const id = store.getState().addEmptyParticipant();
              setQuery("");
              setFilter("all");
              requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("grid:focus-row", { detail: id })));
            }}
          >
            <UserPlus /> Participante
          </Button>
          <Button size="sm" variant="primary" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet /> Importar
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-primary/20 bg-primary-soft px-3 py-1.5 text-[13px] animate-fade-in" data-testid="bulk-bar">
          <span className="mr-1 font-medium text-primary">{selected.size.toLocaleString("pt-BR")} selecionado(s)</span>
          <Button size="sm" variant="ghost" onClick={() => setBulk({ mode: "set" })}>
            <Pencil /> Definir valor
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setBulk({ mode: "replace" })}>
            <Replace /> Substituir
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                <CaseSensitive /> Padronizar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {TEXT_OPS.map((o) => (
                <DropdownMenuItem key={o.id} onSelect={() => runTransform(o.id)}>
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {project.templates.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost">
                  Atribuir modelo
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {project.templates.map((t) => (
                  <DropdownMenuItem key={t.id} onSelect={() => store.getState().assignTemplate(selectedIds, t.id)}>
                    {t.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="sm" variant="ghost" onClick={() => store.getState().duplicateParticipants(selectedIds)}>
            <Copy /> Duplicar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              for (const id of selectedIds) store.getState().clearOverrides(id);
            }}
          >
            <Eraser /> Limpar ajustes individuais
          </Button>
          <Button size="sm" variant="danger-ghost" onClick={deleteSelected}>
            <Trash2 /> Excluir
          </Button>
          <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={() => setSelected([])} aria-label="Limpar seleção">
            <X />
          </Button>
        </div>
      )}

      <DataGrid
        columns={columns}
        rows={rows}
        selected={selected}
        setSelected={setSelected}
        sort={sort}
        setSort={setSort}
        issues={diag.byParticipant}
        onColumnTool={(mode, col, op) => setBulk({ mode, col, op })}
      />

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <BulkDialog
        mode={bulk?.mode ?? null}
        initialColumnId={bulk?.col}
        initialOp={bulk?.op}
        onClose={() => setBulk(null)}
        scope={{ selected: selectedIds, filtered: filteredIds }}
      />
    </div>
  );
}

interface GridProps {
  columns: Column[];
  rows: { p: Participant; index: number }[];
  selected: Set<ID>;
  setSelected: (ids: Iterable<ID>) => void;
  sort: { col: ID; dir: 1 | -1 } | null;
  setSort: (s: { col: ID; dir: 1 | -1 } | null) => void;
  issues: Map<ID, { severity: string; message: string }[]>;
  onColumnTool: (mode: BulkMode, col: ID, op?: TextOp) => void;
}

function DataGrid({ columns, rows, selected, setSelected, sort, setSort, issues, onColumnTool }: GridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{ row: number; col: number } | null>(null);
  const [editing, setEditing] = useState<{ value: string } | null>(null);
  const lastClicked = useRef<number | null>(null);
  const confirm = useConfirm();
  const store = useWorkspace;

  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 12 });
  const template = `44px 52px repeat(${Math.max(columns.length, 0)}, minmax(${COL_W}px, 1fr)) 44px`;
  const minWidth = 44 + 52 + columns.length * COL_W + 44;

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.p.id));

  useEffect(() => {
    const focusRow = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const idx = rows.findIndex((r) => r.p.id === id);
      if (idx < 0) return;
      virt.scrollToIndex(idx, { align: "center" });
      setActive({ row: idx, col: 0 });
      setEditing({ value: "" });
    };
    window.addEventListener("grid:focus-row", focusRow);
    return () => window.removeEventListener("grid:focus-row", focusRow);
  }, [rows, virt]);

  const commit = (value: string, move?: "down" | "right" | "left") => {
    if (active && rows[active.row] && columns[active.col]) {
      store.getState().updateCell(rows[active.row].p.id, columns[active.col].id, value);
    }
    setEditing(null);
    if (move && active) moveActive(move === "down" ? 1 : 0, move === "right" ? 1 : move === "left" ? -1 : 0);
    scrollRef.current?.focus();
  };

  const moveActive = (dr: number, dc: number) => {
    setActive((a) => {
      const base = a ?? { row: 0, col: 0 };
      const row = Math.max(0, Math.min(rows.length - 1, base.row + dr));
      const col = Math.max(0, Math.min(columns.length - 1, base.col + dc));
      virt.scrollToIndex(row);
      return { row, col };
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing || !active) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "ArrowDown") moveActive(1, 0);
    else if (e.key === "ArrowUp") moveActive(-1, 0);
    else if (e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) moveActive(0, 1);
    else if (e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) moveActive(0, -1);
    else if (e.key === "Enter" || e.key === "F2") setEditing({ value: rows[active.row]?.p.values[columns[active.col]?.id] ?? "" });
    else if (e.key === "Delete" || e.key === "Backspace") {
      const ids = selected.size ? rows.filter((r) => selected.has(r.p.id)).map((r) => r.p.id) : [rows[active.row]?.p.id];
      const colId = columns[active.col]?.id;
      if (colId) store.getState().updateCells(ids.filter(Boolean).map((participantId) => ({ participantId, columnId: colId, value: "" })));
    } else if (e.key === " " && rows[active.row]) {
      const id = rows[active.row].p.id;
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelected(next);
    } else if (e.key.length === 1 && !mod && !e.altKey) {
      setEditing({ value: e.key });
    } else return;
    e.preventDefault();
  };

  const onCopy = (e: React.ClipboardEvent) => {
    if (editing || !active) return;
    const sel = rows.filter((r) => selected.has(r.p.id));
    const grid = sel.length
      ? [columns.map((c) => c.label), ...sel.map((r) => columns.map((c) => r.p.values[c.id] ?? ""))]
      : [[rows[active.row]?.p.values[columns[active.col]?.id] ?? ""]];
    e.clipboardData.setData("text/plain", toClipboardGrid(grid));
    e.preventDefault();
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    if (editing || !active) return;
    e.preventDefault();
    const grid = parseClipboardGrid(e.clipboardData.getData("text/plain"));
    if (!grid.length) return;
    const s = store.getState();
    const changes: { participantId: ID; columnId: ID; value: string }[] = [];
    const extra = Math.max(0, active.row + grid.length - rows.length);
    if (extra > 0 && !(await confirm({ title: `Adicionar ${extra} participante(s)?`, description: "Os dados colados ultrapassam o fim da lista.", confirmLabel: "Adicionar" }))) return;
    const newRows: Participant[] = [];
    grid.forEach((line, i) => {
      const row = rows[active.row + i];
      let p = row?.p;
      if (!p) {
        p = { id: newId(), values: {}, templateId: s.project!.templates[0].id, overrides: {} };
        newRows.push(p);
      }
      line.forEach((v, j) => {
        const col = columns[active.col + j];
        if (!col) return;
        if (row) changes.push({ participantId: p!.id, columnId: col.id, value: v.trim() });
        else p!.values[col.id] = v.trim();
      });
    });
    if (newRows.length) s.addParticipants(newRows);
    if (changes.length) s.updateCells(changes);
  };

  const toggleRow = (idx: number, shift: boolean) => {
    const id = rows[idx].p.id;
    const next = new Set(selected);
    if (shift && lastClicked.current !== null) {
      const [a, b] = [Math.min(lastClicked.current, idx), Math.max(lastClicked.current, idx)];
      for (let i = a; i <= b; i++) next.add(rows[i].p.id);
    } else if (next.has(id)) next.delete(id);
    else next.add(id);
    lastClicked.current = idx;
    setSelected(next);
  };

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onCopy={onCopy}
      onPaste={onPaste}
      className="relative min-h-0 flex-1 overflow-auto bg-surface outline-none scrollbar-thin"
      data-testid="participants-grid"
    >
      <div style={{ minWidth }}>
        <div className="sticky top-0 z-10 grid border-b border-border bg-surface-2 text-xs font-semibold text-muted" style={{ gridTemplateColumns: template }} role="row">
          <div className="flex items-center justify-center border-r border-border">
            <input
              type="checkbox"
              checked={allSelected}
              aria-label="Selecionar todos"
              onChange={() => setSelected(allSelected ? [] : [...selected, ...rows.map((r) => r.p.id)])}
            />
          </div>
          <div className="flex items-center justify-center border-r border-border">#</div>
          {columns.map((c) => (
            <ColumnHeader key={c.id} column={c} sort={sort?.col === c.id ? sort.dir : 0} setSort={setSort} onTool={onColumnTool} />
          ))}
          <div className="flex items-center justify-center" title="Situação">
            <CircleCheck className="size-3.5" />
          </div>
        </div>
        <div style={{ height: virt.getTotalSize(), position: "relative" }}>
          {virt.getVirtualItems().map((vi) => {
            const { p, index } = rows[vi.index];
            const isSel = selected.has(p.id);
            const rowIssues = issues.get(p.id);
            const hasError = rowIssues?.some((i) => i.severity === "error");
            return (
              <div
                key={p.id}
                className={cn("absolute left-0 right-0 grid border-b border-border text-[13px]", isSel ? "bg-primary-soft/70" : vi.index % 2 ? "bg-surface-2/30" : "bg-surface")}
                style={{ top: vi.start, height: ROW_H, gridTemplateColumns: template }}
                role="row"
                data-row={vi.index}
              >
                <div className="flex items-center justify-center border-r border-border">
                  <input type="checkbox" checked={isSel} aria-label={`Selecionar linha ${index + 1}`} onChange={() => {}} onClick={(e) => toggleRow(vi.index, e.shiftKey)} />
                </div>
                <RowMenu participant={p} number={index + 1} />
                {columns.map((c, ci) => {
                  const isActive = active?.row === vi.index && active.col === ci;
                  const value = p.values[c.id] ?? "";
                  return (
                    <div
                      key={c.id}
                      className={cn("relative flex min-w-0 items-center border-r border-border px-2", isActive && "z-[1] outline-2 -outline-offset-2 outline-primary")}
                      onMouseDown={() => {
                        if (editing) commit(editing.value);
                        setActive({ row: vi.index, col: ci });
                      }}
                      onDoubleClick={() => setEditing({ value })}
                      role="gridcell"
                    >
                      {isActive && editing ? (
                        <input
                          autoFocus
                          className="absolute inset-0 h-full w-full bg-surface px-2 text-[13px] outline-2 -outline-offset-2 outline-primary"
                          value={editing.value}
                          onChange={(e) => setEditing({ value: e.target.value })}
                          onBlur={(e) => commit(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commit(editing.value, "down");
                            } else if (e.key === "Tab") {
                              e.preventDefault();
                              commit(editing.value, e.shiftKey ? "left" : "right");
                            } else if (e.key === "Escape") {
                              setEditing(null);
                              scrollRef.current?.focus();
                            }
                            e.stopPropagation();
                          }}
                          aria-label={`${c.label}, linha ${index + 1}`}
                        />
                      ) : (
                        <span className={cn("truncate", !value && "text-muted/40")}>{value || "—"}</span>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center justify-center">
                  {rowIssues ? (
                    <Tip label={<span className="block max-w-64">{rowIssues.map((i) => i.message).join(" · ")}</span>} side="left">
                      <button
                        className="rounded p-0.5"
                        onClick={() => useWorkspace.getState().setUi({ tab: "preview", activeParticipantId: p.id })}
                        aria-label="Ver problemas"
                      >
                        {hasError ? <CircleAlert className="size-4 text-danger" /> : <TriangleAlert className="size-4 text-warning" />}
                      </button>
                    </Tip>
                  ) : (
                    <CircleCheck className="size-4 text-success/60" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {rows.length === 0 && <p className="py-10 text-center text-sm text-muted">Nenhum participante corresponde ao filtro.</p>}
      </div>
    </div>
  );
}

function RowMenu({ participant, number }: { participant: Participant; number: number }) {
  const s = useWorkspace.getState;
  const overrides = Object.keys(participant.overrides).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="group flex items-center justify-center gap-0.5 border-r border-border text-xs tabular-nums text-muted hover:bg-surface-2" aria-label={`Ações da linha ${number}`}>
          <span className="group-hover:hidden">{number}</span>
          <MoreVertical className="hidden size-3.5 group-hover:block" />
          {overrides > 0 && <span className="size-1.5 rounded-full bg-amber-500" title="Possui ajuste individual" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => s().setUi({ tab: "preview", activeParticipantId: participant.id })}>
          <Eye /> Ver certificado
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => s().setUi({ tab: "editor", activeParticipantId: participant.id, individualMode: true })}>
          <Pencil /> Editar somente este certificado
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => s().duplicateParticipants([participant.id])}>
          <Copy /> Duplicar
        </DropdownMenuItem>
        {overrides > 0 && (
          <DropdownMenuItem onSelect={() => s().clearOverrides(participant.id)}>
            <Eraser /> Restaurar configuração global
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem danger onSelect={() => s().deleteParticipants([participant.id])}>
          <Trash2 /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ColumnHeader({
  column,
  sort,
  setSort,
  onTool,
}: {
  column: Column;
  sort: 0 | 1 | -1;
  setSort: (s: { col: ID; dir: 1 | -1 } | null) => void;
  onTool: (mode: BulkMode, col: ID, op?: TextOp) => void;
}) {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const s = useWorkspace.getState;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex min-w-0 items-center gap-1.5 border-r border-border px-2 py-2 text-left hover:bg-border/60" title={`{{${column.key}}}`}>
          <span className="truncate text-foreground">{column.label}</span>
          <code className="truncate font-normal text-[10px] text-muted">{column.key}</code>
          {sort === 1 && <ArrowDownAZ className="ml-auto size-3.5 shrink-0" />}
          {sort === -1 && <ArrowUpAZ className="ml-auto size-3.5 shrink-0" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => setSort({ col: column.id, dir: 1 })}>
          <ArrowDownAZ /> Ordenar A → Z
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setSort({ col: column.id, dir: -1 })}>
          <ArrowUpAZ /> Ordenar Z → A
        </DropdownMenuItem>
        {sort !== 0 && <DropdownMenuItem onSelect={() => setSort(null)}>Ordem original</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            const label = await prompt({ title: "Renomear coluna", defaultValue: column.label });
            if (label) s().renameColumn(column.id, label);
          }}
        >
          <Pencil /> Renomear
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onTool("replace", column.id)}>
          <Replace /> Localizar e substituir
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onTool("fill", column.id)}>
          <PaintBucket /> Preencher vazios
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onTool("set", column.id)}>
          <Plus /> Definir valor
        </DropdownMenuItem>
        <DropdownMenuLabel>Padronizar</DropdownMenuLabel>
        {TEXT_OPS.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => onTool("transform", column.id, o.id)}>
            <CaseSensitive /> {o.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          danger
          onSelect={async () => {
            if (await confirm({ title: `Excluir a coluna “${column.label}”?`, description: `Os dados desta coluna serão removidos. Campos que usam {{${column.key}}} ficarão sem correspondência.`, confirmLabel: "Excluir coluna", danger: true }))
              s().deleteColumn(column.id);
          }}
        >
          <Trash2 /> Excluir coluna
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
