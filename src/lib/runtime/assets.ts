"use client";

import type { Background, ID } from "@/lib/model/types";
import { getRepository } from "@/lib/persistence/indexeddb";
import { forgetPdf, openPdf, renderPdfPage } from "@/lib/render/pdfjs";
import type { Drawable } from "@/lib/render/canvas";

const blobs = new Map<ID, Promise<Blob>>();
const bitmaps = new Map<ID, Promise<ImageBitmap>>();
const backgrounds = new Map<string, Promise<Drawable>>();

export function getAssetBlob(id: ID): Promise<Blob> {
  let p = blobs.get(id);
  if (!p) {
    p = getRepository()
      .getAsset(id)
      .then((a) => {
        if (!a) throw new Error("Arquivo não encontrado no armazenamento local");
        return a.blob;
      });
    p.catch(() => blobs.delete(id));
    blobs.set(id, p);
  }
  return p;
}

export async function getAssetBytes(id: ID): Promise<{ bytes: Uint8Array; mime: string }> {
  const blob = await getAssetBlob(id);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type };
}

export function getImageBitmap(id: ID): Promise<ImageBitmap> {
  let p = bitmaps.get(id);
  if (!p) {
    p = getAssetBlob(id).then((b) => createImageBitmap(b));
    p.catch(() => bitmaps.delete(id));
    bitmaps.set(id, p);
  }
  return p;
}

/** Fundo rasterizado para exibição. PDFs são renderizados pelo pdf.js na largura pedida (px). */
export function getBackgroundDrawable(bg: Background, widthPx: number): Promise<Drawable> {
  if (bg.kind === "image") return getImageBitmap(bg.assetId);
  // Arredonda a largura para reaproveitar renderizações próximas.
  const bucket = Math.min(8000, Math.max(256, Math.ceil(widthPx / 256) * 256));
  const key = `${bg.assetId}#${bg.pdfPage}@${bucket}`;
  let p = backgrounds.get(key);
  if (!p) {
    p = openPdf(bg.assetId, async () => (await getAssetBytes(bg.assetId)).bytes).then((doc) => renderPdfPage(doc, bg.pdfPage, bucket));
    p.catch(() => backgrounds.delete(key));
    backgrounds.set(key, p);
  }
  return p;
}

export function forgetAsset(id: ID) {
  blobs.delete(id);
  bitmaps.delete(id);
  for (const k of [...backgrounds.keys()]) if (k.startsWith(`${id}#`)) backgrounds.delete(k);
  forgetPdf(id);
}
