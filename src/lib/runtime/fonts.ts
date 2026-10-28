"use client";

import { FontStore, cssFontName } from "@/lib/render/fonts";

export const browserFonts = new FontStore(async (file) => {
  const res = await fetch(`/fonts/${encodeURIComponent(file)}`);
  if (!res.ok) throw new Error(`Falha ao carregar fonte ${file}`);
  return new Uint8Array(await res.arrayBuffer());
});

const registered = new Map<string, Promise<void>>();

/** Carrega as fontes (métricas + FontFace no navegador) antes de diagramar/desenhar. */
export async function ensureFonts(files: Iterable<string>): Promise<void> {
  const list = [...new Set(files)];
  await browserFonts.load(list);
  await Promise.all(
    list.map((file) => {
      let p = registered.get(file);
      if (!p) {
        const face = new FontFace(cssFontName(file), browserFonts.getBytes(file).slice().buffer as ArrayBuffer);
        p = face.load().then((f) => {
          document.fonts.add(f);
        });
        registered.set(file, p);
      }
      return p;
    }),
  );
}
