"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

let lib: Promise<typeof import("pdfjs-dist")> | null = null;

export function loadPdfJs() {
  lib ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    return m;
  });
  return lib;
}

const docs = new Map<string, Promise<PDFDocumentProxy>>();

export async function openPdf(key: string, getBytes: () => Promise<Uint8Array>): Promise<PDFDocumentProxy> {
  let p = docs.get(key);
  if (!p) {
    p = (async () => {
      const pdfjs = await loadPdfJs();
      const data = await getBytes();
      return pdfjs.getDocument({ data }).promise;
    })();
    p.catch(() => docs.delete(key));
    docs.set(key, p);
  }
  return p;
}

export function forgetPdf(key: string) {
  const p = docs.get(key);
  docs.delete(key);
  p?.then((d) => d.cleanup()).catch(() => {});
}

/** Renderiza uma página para um canvas com a largura alvo em pixels. */
export async function renderPdfPage(doc: PDFDocumentProxy, pageNumber: number, targetWidthPx: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: targetWidthPx / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  await page.render({ canvas, viewport, background: "rgba(0,0,0,0)" }).promise;
  return canvas;
}
