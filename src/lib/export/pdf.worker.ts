/// <reference lib="webworker" />
import { FontStore } from "@/lib/render/fonts";
import { resolveCertificate } from "@/lib/render/resolve";
import { PdfComposer } from "./pdf";
import type { WorkerMessage, WorkerStart } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

const post = (msg: WorkerMessage, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

self.onmessage = async (e: MessageEvent<WorkerStart>) => {
  const job = e.data;
  if (job.type !== "start") return;
  try {
    const fonts = new FontStore(async (file) => {
      const b = job.fonts[file];
      if (!b) throw new Error(`Fonte ausente: ${file}`);
      return b;
    });
    await fonts.load(Object.keys(job.fonts));
    const composer = new PdfComposer(fonts, async (id) => {
      const a = job.assets[id];
      if (!a) throw new Error("Arquivo da arte não encontrado");
      return a;
    });
    const byId = new Map(job.project.participants.map((p) => [p.id, p]));
    const merged = job.mode === "merged" ? await composer.createDocument(job.title) : null;
    let done = 0;
    for (const id of job.participantIds) {
      const participant = byId.get(id);
      try {
        if (!participant) throw new Error("Participante não encontrado");
        const cert = resolveCertificate(job.project, participant, fonts);
        if (merged) {
          await composer.addCertificate(merged, cert);
        } else {
          const doc = await composer.createDocument(job.title);
          await composer.addCertificate(doc, cert);
          const bytes = await doc.save({ useObjectStreams: true });
          post({ type: "item", id, bytes }, [bytes.buffer]);
        }
      } catch (err) {
        post({ type: "error", id, message: err instanceof Error ? err.message : String(err) });
      }
      done++;
      if (merged && done % 10 === 0) post({ type: "progress", done });
    }
    if (merged) {
      const bytes = await merged.save({ useObjectStreams: true });
      post({ type: "merged", bytes }, [bytes.buffer]);
    }
    post({ type: "done" });
  } catch (err) {
    post({ type: "fatal", message: err instanceof Error ? err.message : String(err) });
  }
};
