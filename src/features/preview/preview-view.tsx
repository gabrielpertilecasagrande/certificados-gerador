"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, LayoutGrid, Pencil, Square, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Segmented, Spinner, Tip } from "@/components/ui/misc";
import { runExport } from "@/lib/export/runner";
import { downloadBlob } from "@/lib/runtime/download";
import { Select } from "@/components/ui/input";
import type { ID, Participant } from "@/lib/model/types";
import { resolveCertificate, templateFor } from "@/lib/render/resolve";
import { browserFonts } from "@/lib/runtime/fonts";
import { findNameColumn } from "@/lib/variables";
import { cn } from "@/lib/utils/cn";
import { fontsReadyFor, useFontsVersion } from "@/features/workspace/hooks";
import { ParticipantNav } from "@/features/workspace/participant-nav";
import { useActiveParticipant, useWorkspace } from "@/features/workspace/store";
import { useDiagnostics } from "@/features/workspace/use-diagnostics";
import { CertificateCanvas } from "./certificate-canvas";

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

export function PreviewView() {
  const project = useWorkspace((s) => s.project)!;
  const [mode, setMode] = useState<"single" | "gallery">("single");
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [templateFilter, setTemplateFilter] = useState<ID | "all">("all");
  const diag = useDiagnostics();
  const setUi = useWorkspace((s) => s.setUi);

  if (project.participants.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-base font-semibold">Ainda não há participantes</p>
        <p className="max-w-sm text-sm text-muted">Importe a planilha para conferir cada certificado com os dados reais.</p>
        <Button variant="primary" onClick={() => setUi({ tab: "participants" })}>
          <FileSpreadsheet /> Ir para participantes
        </Button>
      </div>
    );
  }

  const problems = project.participants.filter((p) => diag.byParticipant.has(p.id));

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "single", label: <><Square /> Individual</> },
              { value: "gallery", label: <><LayoutGrid /> Galeria</> },
            ]}
          />
          {mode === "single" ? (
            <ParticipantNav className="mx-auto" />
          ) : (
            <div className="mx-auto flex items-center gap-2">
              {project.templates.length > 1 && (
                <Select className="h-8 w-48" value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)} aria-label="Filtrar por modelo">
                  <option value="all">Todos os modelos</option>
                  {project.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
              <label className="flex items-center gap-1.5 text-[13px]">
                <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Só com problemas
              </label>
            </div>
          )}
          <SingleActions hidden={mode !== "single"} />
        </div>
        {mode === "single" ? <SinglePreview /> : <Gallery participants={project.participants.filter((p) => (!onlyProblems || diag.byParticipant.has(p.id)) && (templateFilter === "all" || p.templateId === templateFilter))} onOpen={(id) => { setUi({ activeParticipantId: id }); setMode("single"); }} />}
      </div>

      <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-surface lg:flex" data-testid="diagnostics">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Diagnóstico</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            {!diag.done && <Spinner className="size-3" />}
            {diag.done ? "Todos os certificados verificados" : `Verificando… ${Math.round(diag.progress * 100)}%`}
          </p>
          <div className="mt-2.5 flex gap-1.5">
            <Badge tone={diag.errorCount ? "danger" : "success"}>{diag.errorCount} com erro</Badge>
            <Badge tone={diag.warningCount ? "warning" : "neutral"}>{diag.warningCount} com aviso</Badge>
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
          {diag.templateIssues.map((i, k) => (
            <li key={k} className="flex gap-2 rounded-md px-2 py-1.5 text-[13px] text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {i.message}
            </li>
          ))}
          {problems.slice(0, 500).map((p) => (
            <ProblemRow key={p.id} participant={p} issues={diag.byParticipant.get(p.id)!} />
          ))}
          {problems.length > 500 && <li className="p-2 text-xs text-muted">… e mais {problems.length - 500}. Use o filtro “com problemas” na tabela.</li>}
          {diag.done && problems.length === 0 && diag.templateIssues.length === 0 && (
            <li className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted">
              <CircleCheck className="size-8 text-success" /> Nenhum problema encontrado.
            </li>
          )}
        </ul>
      </aside>
    </div>
  );
}

function ProblemRow({ participant, issues }: { participant: Participant; issues: { severity: string; message: string }[] }) {
  const project = useWorkspace((s) => s.project)!;
  const activeId = useWorkspace((s) => s.activeParticipantId);
  const setUi = useWorkspace((s) => s.setUi);
  const nameCol = findNameColumn(project.columns);
  const index = project.participants.indexOf(participant);
  const error = issues.some((i) => i.severity === "error");
  return (
    <li>
      <button
        onClick={() => setUi({ activeParticipantId: participant.id })}
        className={cn("flex w-full gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2", activeId === participant.id && "bg-primary-soft")}
      >
        {error ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />}
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">
            {index + 1}. {(nameCol && participant.values[nameCol.id]) || "(sem nome)"}
          </span>
          <span className="block text-xs text-muted">{issues.map((i) => i.message).join(" · ")}</span>
        </span>
      </button>
    </li>
  );
}

function SingleActions({ hidden }: { hidden: boolean }) {
  const setUi = useWorkspace((s) => s.setUi);
  const participant = useActiveParticipant();
  if (hidden || !participant) return <div />;
  const n = Object.keys(participant.overrides).length;
  return (
    <div className="flex items-center gap-2">
      {n > 0 && <Badge tone="warning">Ajuste individual</Badge>}
      <Tip label="Baixar PDF deste certificado">
        <Button size="icon" variant="secondary" aria-label="Baixar PDF deste certificado" onClick={() => downloadOne(participant.id)}>
          <Download />
        </Button>
      </Tip>
      <Button size="sm" onClick={() => setUi({ tab: "editor", individualMode: true })} data-testid="edit-individual">
        <Pencil /> Editar somente este certificado
      </Button>
    </div>
  );
}

async function downloadOne(id: ID) {
  const project = useWorkspace.getState().project;
  if (!project) return;
  const job = runExport({ project, ids: [id], settings: { ...project.exportSettings, format: "pdf-single" } }, () => {});
  const r = await job.promise;
  if (r.status === "done" && r.result?.blob) downloadBlob(r.result.blob, r.result.fileName);
  else toast.error(r.message ?? "Não foi possível gerar o PDF");
}

function SinglePreview() {
  const project = useWorkspace((s) => s.project)!;
  const participant = useActiveParticipant();
  const fontsVersion = useFontsVersion();
  const { ref, size } = useSize<HTMLDivElement>();
  const template = templateFor(project, participant);
  const cert = useMemo(() => {
    void fontsVersion;
    if (!fontsReadyFor(template, project.customFonts)) return null;
    return resolveCertificate(project, participant, browserFonts, { template });
  }, [project, participant, template, fontsVersion]);

  const ratio = template.page.widthPt / template.page.heightPt;
  const width = Math.max(100, Math.min(size.width - 64, (size.height - 64) * ratio));
  const issues = cert?.issues.filter((i) => i.code !== "no-background") ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const s = useWorkspace.getState();
      const list = s.project!.participants;
      const i = list.findIndex((p) => p.id === s.activeParticipantId);
      const next = list[(i + (e.key === "ArrowRight" ? 1 : -1) + list.length) % list.length];
      s.setUi({ activeParticipantId: next.id });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <div ref={ref} className="flex min-h-0 flex-1 items-center justify-center p-8">
        {size.width > 0 && cert && <CertificateCanvas cert={cert} width={width} className="rounded-sm shadow-pop" />}
      </div>
      {issues.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border bg-surface px-4 py-2 text-xs" data-testid="preview-issues">
          {issues.map((i, k) => (
            <span key={k} className={i.severity === "error" ? "text-danger" : "text-warning"}>
              {i.message}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Gallery({ participants, onOpen }: { participants: Participant[]; onOpen: (id: ID) => void }) {
  const project = useWorkspace((s) => s.project)!;
  const fontsVersion = useFontsVersion();
  const diag = useDiagnostics();
  const { ref, size } = useSize<HTMLDivElement>();
  const nameCol = findNameColumn(project.columns);
  const cols = Math.max(1, Math.floor((size.width - 24) / 280));
  const cardW = Math.floor((size.width - 24 - (cols - 1) * 16) / cols);
  // Cartões com a altura do modelo mais "alto" (modelos podem ter formatos diferentes).
  const ratio = Math.max(...project.templates.map((t) => t.page.heightPt / t.page.widthPt));
  const rowH = Math.round(cardW * ratio) + 56;
  const rowCount = Math.ceil(participants.length / cols);
  const virt = useVirtualizer({ count: rowCount, getScrollElement: () => ref.current, estimateSize: () => rowH, overscan: 2 });
  useEffect(() => virt.measure(), [rowH, virt]);

  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto bg-canvas p-3 scrollbar-thin" data-testid="gallery">
      {participants.length === 0 && <p className="py-16 text-center text-sm text-muted">Nenhum certificado para mostrar.</p>}
      <div style={{ height: virt.getTotalSize(), position: "relative" }}>
        {size.width > 0 &&
          virt.getVirtualItems().map((vr) => (
            <div key={vr.index} className="absolute left-0 right-0 flex gap-4" style={{ top: vr.start, height: rowH }}>
              {participants.slice(vr.index * cols, vr.index * cols + cols).map((p) => {
                const issues = diag.byParticipant.get(p.id);
                const error = issues?.some((i) => i.severity === "error");
                return (
                  <button key={p.id} onClick={() => onOpen(p.id)} className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface text-left shadow-soft transition-shadow hover:shadow-pop" style={{ width: cardW, height: rowH - 16 }}>
                    <GalleryThumb participant={p} width={cardW} fontsVersion={fontsVersion} />
                    <div className="flex items-center gap-1.5 border-t border-border px-2.5 py-2">
                      {issues ? error ? <CircleAlert className="size-3.5 shrink-0 text-danger" /> : <TriangleAlert className="size-3.5 shrink-0 text-warning" /> : <CircleCheck className="size-3.5 shrink-0 text-success/70" />}
                      <span className="truncate text-xs font-medium">{(nameCol && p.values[nameCol.id]) || "(sem nome)"}</span>
                      <span className="ml-auto text-[11px] tabular-nums text-muted">{project.participants.indexOf(p) + 1}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}

function GalleryThumb({ participant, width, fontsVersion }: { participant: Participant; width: number; fontsVersion: number }) {
  const project = useWorkspace((s) => s.project)!;
  const template = templateFor(project, participant);
  const cert = useMemo(() => {
    void fontsVersion;
    if (!fontsReadyFor(template, project.customFonts)) return null;
    return resolveCertificate(project, participant, browserFonts, { template });
  }, [project, participant, template, fontsVersion]);
  return <CertificateCanvas cert={cert} width={width} />;
}
