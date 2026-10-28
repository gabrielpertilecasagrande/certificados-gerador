"use client";

import type { ExportSettings, ID, Project } from "@/lib/model/types";
import { drawCertificate, type Drawable } from "@/lib/render/canvas";
import { fontFilesForTemplates, resolveCertificate } from "@/lib/render/resolve";
import { getAssetBytes, getBackgroundDrawable, getImageBitmap } from "@/lib/runtime/assets";
import { browserFonts, ensureFonts } from "@/lib/runtime/fonts";
import { buildContext, findNameColumn } from "@/lib/variables";
import { FileNameRegistry, renderFileName, sanitizeFileName } from "@/lib/variables/filename";
import type { WorkerMessage, WorkerStart } from "./protocol";
import { FileSink, MemorySink, StreamingZip, type ByteSink } from "./zip";

export type ExportStatus = "preparing" | "running" | "finishing" | "done" | "cancelled" | "error";

export interface ExportFailure {
  id: ID;
  label: string;
  message: string;
}

export interface ExportProgress {
  total: number;
  done: number;
  failures: ExportFailure[];
  status: ExportStatus;
  message?: string;
  result?: { blob: Blob | null; fileName: string; savedToDisk: boolean; count: number };
}

export interface ExportJob {
  cancel(): void;
  promise: Promise<ExportProgress>;
}

export interface ExportRequest {
  project: Project;
  ids: ID[];
  settings: ExportSettings;
  /** Destino escolhido pelo usuário (File System Access API); se ausente, gera um Blob para download. */
  writable?: FileSystemWritableFileStream;
}

export function outputKind(settings: ExportSettings, count: number): { ext: string; mime: string; zipped: boolean } {
  if (settings.format === "pdf-merged") return { ext: "pdf", mime: "application/pdf", zipped: false };
  const single = count === 1;
  if (settings.format === "png-zip") return single ? { ext: "png", mime: "image/png", zipped: false } : { ext: "zip", mime: "application/zip", zipped: true };
  if (settings.format === "jpg-zip") return single ? { ext: "jpg", mime: "image/jpeg", zipped: false } : { ext: "zip", mime: "application/zip", zipped: true };
  return single || settings.format === "pdf-single" ? { ext: "pdf", mime: "application/pdf", zipped: false } : { ext: "zip", mime: "application/zip", zipped: true };
}

export function suggestedOutputName(project: Project, settings: ExportSettings, ids: ID[]): string {
  const kind = outputKind(settings, ids.length);
  if (ids.length === 1 && settings.format !== "pdf-merged") {
    const p = project.participants.find((x) => x.id === ids[0]);
    const ctx = buildContext(project, p ?? null);
    return `${renderFileName(settings.fileNamePattern, ctx, "certificado")}.${kind.ext}`;
  }
  return `${sanitizeFileName(project.name)} - certificados.${kind.ext}`;
}

/** Caminho (pasta/arquivo) de cada certificado dentro do ZIP, sem repetições. */
export function planFileNames(project: Project, ids: ID[], settings: ExportSettings, ext: string): Map<ID, string> {
  const registry = new FileNameRegistry();
  const byId = new Map(project.participants.map((p, i) => [p.id, { p, i }]));
  const out = new Map<ID, string>();
  for (const id of ids) {
    const entry = byId.get(id);
    if (!entry) continue;
    const ctx = buildContext(project, entry.p);
    const base = renderFileName(settings.fileNamePattern, ctx, `certificado-${entry.i + 1}`);
    let folder = "";
    if (settings.zipLayout === "by-template") {
      folder = sanitizeFileName(project.templates.find((t) => t.id === entry.p.templateId)?.name ?? project.templates[0].name, "modelo");
    } else if (settings.zipLayout === "by-column" && settings.zipGroupColumnId) {
      folder = sanitizeFileName(entry.p.values[settings.zipGroupColumnId] ?? "", "Sem categoria");
    }
    out.set(id, registry.take(folder, base, ext));
  }
  return out;
}

function labelOf(project: Project, id: ID): string {
  const nameCol = findNameColumn(project.columns);
  const p = project.participants.find((x) => x.id === id);
  return (nameCol && p?.values[nameCol.id]) || `Participante ${project.participants.findIndex((x) => x.id === id) + 1}`;
}

export function runExport(req: ExportRequest, onProgress: (p: ExportProgress) => void): ExportJob {
  let cancelled = false;
  let worker: Worker | null = null;
  let cancelHook: (() => void) | null = null;
  const progress: ExportProgress = { total: req.ids.length, done: 0, failures: [], status: "preparing" };
  const emit = (patch: Partial<ExportProgress> = {}) => {
    Object.assign(progress, patch);
    onProgress({ ...progress, failures: [...progress.failures] });
  };

  const promise = (async (): Promise<ExportProgress> => {
    const { project, ids, settings } = req;
    const kind = outputKind(settings, ids.length);
    const fileName = suggestedOutputName(project, settings, ids);
    const sink: ByteSink = req.writable ? new FileSink(req.writable) : new MemorySink(kind.mime);
    const zip = kind.zipped ? new StreamingZip(sink) : null;
    const names = planFileNames(project, ids, settings, settings.format === "png-zip" ? "png" : settings.format === "jpg-zip" ? "jpg" : "pdf");
    cancelHook = () => void (zip ? zip.abort() : sink.abort());

    try {
      emit({ status: "preparing", message: "Preparando fontes e arquivos…" });
      const fontFiles = fontFilesForTemplates(project.templates, project.customFonts);
      await ensureFonts(fontFiles);
      if (cancelled) return finishCancelled();

      if (settings.format === "png-zip" || settings.format === "jpg-zip") {
        await rasterExport();
      } else {
        await pdfExport();
      }
      if (cancelled) return finishCancelled();

      if (progress.done - progress.failures.length === 0) {
        // Nada gerado: descarta o destino (evita arquivo vazio no disco).
        await (zip ? zip.abort() : sink.abort()).catch(() => {});
        emit({ status: "error", message: "Nenhum certificado foi gerado." });
        return progress;
      }
      emit({ status: "finishing", message: "Finalizando arquivo…" });
      const blob = zip ? await zip.finish() : await sink.close();
      emit({ status: "done", message: undefined, result: { blob, fileName, savedToDisk: !!req.writable, count: progress.done - progress.failures.length } });
      return progress;
    } catch (e) {
      if (cancelled) return finishCancelled();
      console.error(e);
      await (zip ? zip.abort() : sink.abort()).catch(() => {});
      emit({ status: "error", message: e instanceof Error ? e.message : String(e) });
      return progress;
    } finally {
      (worker as Worker | null)?.terminate();
    }

    function finishCancelled() {
      emit({ status: "cancelled", message: "Exportação cancelada" });
      return progress;
    }

    async function pdfExport() {
      const assetIds = new Set<string>();
      for (const t of project.templates) {
        if (t.background?.visible) assetIds.add(t.background.assetId);
        // Inclui imagens ocultas no modelo: um ajuste individual pode exibi-las.
        for (const el of t.elements) if (el.type === "image") assetIds.add(el.assetId);
      }
      const assets: WorkerStart["assets"] = {};
      for (const id of assetIds) assets[id] = await getAssetBytes(id);
      const fonts: WorkerStart["fonts"] = {};
      for (const f of fontFilesForTemplates(project.templates, project.customFonts)) fonts[f] = browserFonts.getBytes(f).slice();
      if (cancelled) return;

      emit({ status: "running", message: undefined });
      const merged = settings.format === "pdf-merged";
      worker = new Worker(new URL("./pdf.worker.ts", import.meta.url), { type: "module" });
      await new Promise<void>((resolve, reject) => {
        cancelHook = () => {
          worker?.terminate();
          void (zip ? zip.abort() : sink.abort());
          resolve();
        };
        worker!.onerror = (ev) => reject(new Error(ev.message || "Falha no processamento"));
        worker!.onmessage = async (ev: MessageEvent<WorkerMessage>) => {
          const msg = ev.data;
          try {
            switch (msg.type) {
              case "item": {
                const path = names.get(msg.id) ?? `${msg.id}.pdf`;
                if (zip) zip.add(path, msg.bytes);
                else await sink.write(msg.bytes);
                emit({ done: progress.done + 1 });
                break;
              }
              case "error":
                progress.failures.push({ id: msg.id, label: labelOf(project, msg.id), message: msg.message });
                if (!merged) emit({ done: progress.done + 1 });
                else emit();
                break;
              case "progress":
                emit({ done: msg.done });
                break;
              case "merged":
                await sink.write(msg.bytes);
                emit({ done: ids.length });
                break;
              case "fatal":
                reject(new Error(msg.message));
                break;
              case "done":
                resolve();
                break;
            }
          } catch (e) {
            reject(e);
          }
        };
        const start: WorkerStart = { type: "start", project, participantIds: ids, mode: merged ? "merged" : "individual", fonts, assets, title: project.name };
        worker!.postMessage(start);
      });
    }

    async function rasterExport() {
      emit({ status: "running", message: undefined });
      const scale = settings.dpi / 72;
      const isJpg = settings.format === "jpg-zip";
      const bgCache = new Map<string, Drawable | null>();
      const images = new Map<string, Drawable>();
      for (const t of project.templates) {
        for (const el of t.elements) if (el.type === "image" && !images.has(el.assetId)) images.set(el.assetId, await getImageBitmap(el.assetId));
      }
      const byId = new Map(project.participants.map((p) => [p.id, p]));
      for (const id of ids) {
        if (cancelled) return;
        const p = byId.get(id);
        try {
          if (!p) throw new Error("Participante não encontrado");
          const cert = resolveCertificate(project, p, browserFonts);
          const t = cert.template;
          const w = Math.round(t.page.widthPt * scale);
          const h = Math.round(t.page.heightPt * scale);
          let bg: Drawable | null = null;
          if (t.background) {
            const key = `${t.id}`;
            if (!bgCache.has(key)) bgCache.set(key, await getBackgroundDrawable(t.background, w * (t.background.fit === "cover" ? 1.5 : 1)).catch(() => null));
            bg = bgCache.get(key) ?? null;
          }
          const canvas = new OffscreenCanvas(w, h);
          drawCertificate(canvas.getContext("2d")!, cert, scale, { background: bg, images });
          const blob = await canvas.convertToBlob({ type: isJpg ? "image/jpeg" : "image/png", quality: settings.jpgQuality });
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (zip) zip.add(names.get(id)!, bytes);
          else await sink.write(bytes);
        } catch (e) {
          progress.failures.push({ id, label: labelOf(project, id), message: e instanceof Error ? e.message : String(e) });
        }
        emit({ done: progress.done + 1 });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  })();

  return {
    cancel() {
      cancelled = true;
      cancelHook?.();
    },
    promise,
  };
}
