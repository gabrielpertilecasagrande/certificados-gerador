"use client";

import { CircleAlert, CircleCheck, Download, FileArchive, FileImage, Files, FileText, HardDriveDownload, Loader2, RotateCcw, Square, TriangleAlert } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Badge, Progress, Segmented, Switch } from "@/components/ui/misc";
import type { ExportFormat, ID } from "@/lib/model/types";
import { outputKind, planFileNames, runExport, suggestedOutputName, type ExportJob, type ExportProgress } from "@/lib/export/runner";
import { downloadBlob } from "@/lib/runtime/download";
import { cn } from "@/lib/utils/cn";
import { knownVariables } from "@/lib/variables";
import { useWorkspace } from "@/features/workspace/store";
import { useDiagnostics } from "@/features/workspace/use-diagnostics";

type Scope = "all" | "selected" | "filtered" | "valid" | `template:${string}`;

const FORMATS: { id: ExportFormat; title: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "pdf-zip", title: "PDFs individuais", desc: "Um PDF por participante, em um arquivo ZIP", icon: FileArchive },
  { id: "pdf-merged", title: "PDF único", desc: "Todos os certificados em um só PDF, uma página cada", icon: Files },
  { id: "png-zip", title: "Imagens PNG", desc: "Uma imagem por participante (ZIP)", icon: FileImage },
  { id: "jpg-zip", title: "Imagens JPG", desc: "Arquivos menores, sem transparência (ZIP)", icon: FileImage },
];

const supportsSavePicker = () => typeof window !== "undefined" && "showSaveFilePicker" in window;

export function ExportView() {
  const project = useWorkspace((s) => s.project)!;
  const settings = project.exportSettings;
  const setExportSettings = useWorkspace((s) => s.setExportSettings);
  const selectedRowIds = useWorkspace((s) => s.selectedRowIds);
  const filteredRowIds = useWorkspace((s) => s.filteredRowIds);
  const diag = useDiagnostics();
  const patternRef = useRef<HTMLInputElement>(null);

  const [scope, setScope] = useState<Scope>(selectedRowIds.size ? "selected" : "all");
  const [toDisk, setToDisk] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const job = useRef<ExportJob | null>(null);
  const running = progress && ["preparing", "running", "finishing"].includes(progress.status);

  const ids: ID[] = useMemo(() => {
    const all = project.participants.map((p) => p.id);
    if (scope === "selected") return all.filter((id) => selectedRowIds.has(id));
    if (scope === "filtered") return filteredRowIds ?? all;
    if (scope === "valid") return all.filter((id) => !diag.byParticipant.get(id)?.some((i) => i.severity === "error"));
    if (scope.startsWith("template:")) {
      const tid = scope.slice(9);
      return project.participants.filter((p) => p.templateId === tid).map((p) => p.id);
    }
    return all;
  }, [scope, project.participants, selectedRowIds, filteredRowIds, diag.byParticipant]);

  const withErrors = ids.filter((id) => diag.byParticipant.get(id)?.some((i) => i.severity === "error")).length;
  const kind = outputKind(settings, ids.length);
  const sampleNames = useMemo(() => [...planFileNames(project, ids.slice(0, 3), settings, kind.zipped ? (settings.format === "png-zip" ? "png" : settings.format === "jpg-zip" ? "jpg" : "pdf") : kind.ext).values()], [project, ids, settings, kind]);
  const outputName = suggestedOutputName(project, settings, ids);
  const vars = useMemo(() => knownVariables(project), [project]);

  async function start(onlyIds?: ID[]) {
    const list = onlyIds ?? ids;
    if (!list.length) return;
    let writable: FileSystemWritableFileStream | undefined;
    if (toDisk && supportsSavePicker()) {
      try {
        const k = outputKind(settings, list.length);
        const handle = await (window as unknown as { showSaveFilePicker: (o: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
          suggestedName: suggestedOutputName(project, settings, list),
          types: [{ description: k.ext.toUpperCase(), accept: { [k.mime]: [`.${k.ext}`] } }],
        });
        writable = await handle.createWritable();
      } catch {
        return; // usuário cancelou a escolha do arquivo
      }
    }
    const j = runExport({ project, ids: list, settings, writable }, setProgress);
    job.current = j;
    const result = await j.promise;
    job.current = null;
    if (result.status === "done" && result.result) {
      if (result.result.blob) downloadBlob(result.result.blob, result.result.fileName);
      const s = useWorkspace.getState();
      const temporal = useWorkspace.temporal.getState();
      temporal.pause();
      s.mutate((d) => {
        d.status = "exported";
        d.lastExportAt = Date.now();
      });
      temporal.resume();
      toast.success(`${result.result.count.toLocaleString("pt-BR")} certificado(s) gerado(s)`);
    } else if (result.status === "error") {
      toast.error(result.message ?? "Falha na exportação");
    }
  }

  const insertVar = (key: string) => {
    const el = patternRef.current;
    const token = `{{${key}}}`;
    const pos = el?.selectionStart ?? settings.fileNamePattern.length;
    setExportSettings({ fileNamePattern: settings.fileNamePattern.slice(0, pos) + token + settings.fileNamePattern.slice(el?.selectionEnd ?? pos) });
  };

  if (project.participants.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-base font-semibold">Nada para exportar ainda</p>
        <p className="max-w-sm text-sm text-muted">Importe os participantes para gerar os certificados.</p>
        <Button variant="primary" onClick={() => useWorkspace.getState().setUi({ tab: "participants" })}>
          Ir para participantes
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background scrollbar-thin">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Card title="Formato">
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  role="radio"
                  aria-checked={settings.format === f.id}
                  onClick={() => setExportSettings({ format: f.id })}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    settings.format === f.id ? "border-primary bg-primary-soft/60 ring-3 ring-primary/10" : "border-border bg-surface hover:border-border-strong",
                  )}
                >
                  <f.icon className={cn("mt-0.5 size-5 shrink-0", settings.format === f.id ? "text-primary" : "text-muted")} />
                  <span>
                    <span className="block text-sm font-semibold">
                      {f.title} {f.id === "pdf-zip" && <Badge tone="primary" className="ml-1">recomendado</Badge>}
                    </span>
                    <span className="block text-xs text-muted">{f.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            {(settings.format === "png-zip" || settings.format === "jpg-zip") && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Label>Resolução</Label>
                <Segmented
                  value={String(settings.dpi)}
                  onChange={(v) => setExportSettings({ dpi: Number(v) })}
                  options={[
                    { value: "150", label: "150 DPI (tela)" },
                    { value: "300", label: "300 DPI (impressão)" },
                  ]}
                />
                {settings.format === "jpg-zip" && (
                  <Select className="h-8 w-40" value={settings.jpgQuality} onChange={(e) => setExportSettings({ jpgQuality: Number(e.target.value) })} aria-label="Qualidade JPG">
                    <option value={0.95}>Qualidade máxima</option>
                    <option value={0.92}>Alta</option>
                    <option value={0.8}>Média</option>
                  </Select>
                )}
              </div>
            )}
            {settings.format.startsWith("pdf") && <p className="mt-3 text-xs text-muted">A arte em PDF é preservada como vetor e os textos como texto pesquisável, com as fontes embutidas.</p>}
          </Card>

          <Card title="Quais certificados">
            <Select value={scope} onChange={(e) => setScope(e.target.value as Scope)} aria-label="Certificados a exportar">
              <option value="all">Todos os participantes ({project.participants.length.toLocaleString("pt-BR")})</option>
              {selectedRowIds.size > 0 && <option value="selected">Somente os selecionados ({selectedRowIds.size.toLocaleString("pt-BR")})</option>}
              {filteredRowIds && <option value="filtered">Somente os resultados filtrados ({filteredRowIds.length.toLocaleString("pt-BR")})</option>}
              <option value="valid">Somente certificados sem erros</option>
              {project.templates.length > 1 &&
                project.templates.map((t) => (
                  <option key={t.id} value={`template:${t.id}`}>
                    Somente o modelo “{t.name}”
                  </option>
                ))}
            </Select>
            {withErrors > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] text-danger">
                <CircleAlert className="size-4" /> {withErrors} certificado(s) com erro (ex.: nome que não coube) serão gerados assim mesmo.
                <button className="font-medium underline-offset-2 hover:underline" onClick={() => useWorkspace.getState().setUi({ tab: "preview" })}>
                  Revisar
                </button>
              </p>
            )}
          </Card>

          {settings.format !== "pdf-merged" && (
            <Card title="Nome dos arquivos">
              <div className="flex gap-2">
                <Input ref={patternRef} value={settings.fileNamePattern} onChange={(e) => setExportSettings({ fileNamePattern: e.target.value })} className="font-mono text-[13px]" aria-label="Padrão do nome do arquivo" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button>Variável</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {vars.map((v) => (
                      <DropdownMenuItem key={v.key} onSelect={() => insertVar(v.key)}>
                        {v.label} <code className="ml-auto text-[11px] text-muted">{`{{${v.key}}}`}</code>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-muted">
                {sampleNames.map((n) => (
                  <li key={n} className="truncate font-mono">
                    {n}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-muted">Caracteres inválidos são substituídos; nomes repetidos recebem (2), (3)…</p>
              {kind.zipped && (
                <div className="mt-4 space-y-2">
                  <Label>Organização do ZIP</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Segmented
                      value={settings.zipLayout}
                      onChange={(v) => setExportSettings({ zipLayout: v, zipGroupColumnId: v === "by-column" ? (settings.zipGroupColumnId ?? project.columns.find((c) => c.key === "categoria")?.id ?? project.columns[0]?.id ?? null) : settings.zipGroupColumnId })}
                      options={[
                        { value: "flat", label: "Uma pasta" },
                        ...(project.templates.length > 1 ? [{ value: "by-template" as const, label: "Por modelo" }] : []),
                        { value: "by-column", label: "Por coluna" },
                      ]}
                    />
                    {settings.zipLayout === "by-column" && (
                      <Select className="h-8 w-48" value={settings.zipGroupColumnId ?? ""} onChange={(e) => setExportSettings({ zipGroupColumnId: e.target.value })} aria-label="Coluna para pastas">
                        {project.columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-soft">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Resumo</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{ids.length.toLocaleString("pt-BR")}</p>
            <p className="text-sm text-muted">certificado(s) → {outputName}</p>
            {supportsSavePicker() && (
              <label className="mt-4 flex items-center justify-between gap-3 text-[13px]">
                <span>
                  Salvar direto no disco
                  <span className="block text-xs text-muted">Recomendado para milhares de certificados</span>
                </span>
                <Switch checked={toDisk} onCheckedChange={setToDisk} aria-label="Salvar direto no disco" />
              </label>
            )}
            <Button variant="primary" size="lg" className="mt-5 w-full" disabled={!ids.length || !!running} onClick={() => start()} data-testid="start-export">
              {running ? <Loader2 className="animate-spin" /> : <Download />}
              {running ? "Gerando…" : `Gerar ${ids.length.toLocaleString("pt-BR")} certificado(s)`}
            </Button>

            {progress && <ProgressPanel progress={progress} onCancel={() => job.current?.cancel()} onRetry={(failed) => start(failed)} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ProgressPanel({ progress, onCancel, onRetry }: { progress: ExportProgress; onCancel: () => void; onRetry: (ids: ID[]) => void }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const active = ["preparing", "running", "finishing"].includes(progress.status);
  const setUi = useWorkspace((s) => s.setUi);
  return (
    <div className="mt-5 border-t border-border pt-4" data-testid="export-progress" data-status={progress.status}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {progress.status === "preparing" && "Preparando…"}
          {progress.status === "running" && `Gerando certificados — ${progress.done.toLocaleString("pt-BR")} de ${progress.total.toLocaleString("pt-BR")}`}
          {progress.status === "finishing" && "Finalizando arquivo…"}
          {progress.status === "done" && (
            <span className="flex items-center gap-1.5 text-success">
              <CircleCheck className="size-4" /> Concluído
            </span>
          )}
          {progress.status === "cancelled" && "Exportação cancelada"}
          {progress.status === "error" && <span className="text-danger">Falha na exportação</span>}
        </p>
        <span className="text-xs tabular-nums text-muted">{pct}%</span>
      </div>
      <Progress value={pct} className="mt-2" />
      {progress.message && progress.status === "error" && <p className="mt-2 text-xs text-danger">{progress.message}</p>}
      {active && (
        <Button size="sm" variant="ghost" className="mt-3" onClick={onCancel}>
          <Square /> Cancelar
        </Button>
      )}
      {progress.status === "done" && progress.result && (
        <div className="mt-3 space-y-2">
          <p className="text-[13px] text-muted">
            {progress.result.count.toLocaleString("pt-BR")} certificado(s) em <span className="font-medium text-foreground">{progress.result.fileName}</span>
            {progress.result.savedToDisk && " (salvo no local escolhido)"}
          </p>
          {progress.result.blob && (
            <Button size="sm" onClick={() => downloadBlob(progress.result!.blob!, progress.result!.fileName)} data-testid="download-again">
              <HardDriveDownload /> Baixar novamente
            </Button>
          )}
        </div>
      )}
      {progress.failures.length > 0 && (
        <div className="mt-3 rounded-lg border border-danger/20 bg-danger-soft/60 p-2.5">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-danger">
            <TriangleAlert className="size-4" /> {progress.failures.length} falha(s)
          </p>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs scrollbar-thin">
            {progress.failures.map((f) => (
              <li key={f.id}>
                <button className="text-left hover:underline" onClick={() => setUi({ tab: "preview", activeParticipantId: f.id })}>
                  <FileText className="mr-1 inline size-3" />
                  {f.label}: <span className="text-muted">{f.message}</span>
                </button>
              </li>
            ))}
          </ul>
          {!active && (
            <Button size="sm" className="mt-2" onClick={() => onRetry(progress.failures.map((f) => f.id))}>
              <RotateCcw /> Repetir falhas
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
