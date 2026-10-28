"use client";

import type { Project } from "@/lib/model/types";
import { getRepository } from "@/lib/persistence/indexeddb";
import { drawCertificate, type Drawable } from "@/lib/render/canvas";
import { fontFilesForTemplates, resolveCertificate } from "@/lib/render/resolve";
import { getBackgroundDrawable, getImageBitmap } from "./assets";
import { browserFonts, ensureFonts } from "./fonts";

const THUMB_WIDTH = 560;

/** Gera a miniatura do projeto (primeiro participante) e retorna o projeto atualizado. */
export async function renderThumbnail(project: Project): Promise<Blob | null> {
  const participant = project.participants[0] ?? null;
  const template = project.templates.find((t) => t.id === participant?.templateId) ?? project.templates[0];
  if (!template) return null;
  await ensureFonts(fontFilesForTemplates([template], project.customFonts));
  const cert = resolveCertificate(project, participant, browserFonts, { template });
  const scale = THUMB_WIDTH / template.page.widthPt;
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH;
  canvas.height = Math.round(template.page.heightPt * scale);
  const images = new Map<string, Drawable>();
  for (const it of cert.items) if (it.el.type === "image") images.set(it.el.assetId, await getImageBitmap(it.el.assetId).catch(() => null as never));
  const background = template.background ? await getBackgroundDrawable(template.background, THUMB_WIDTH * 2).catch(() => null) : null;
  drawCertificate(canvas.getContext("2d")!, cert, scale, { background, images });
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/png"));
}

export async function updateThumbnail(project: Project): Promise<string | null> {
  const blob = await renderThumbnail(project);
  if (!blob) return null;
  const id = project.thumbnailAssetId ?? `thumb-${project.id}`;
  await getRepository().putAsset({ id, projectId: project.id, blob, mime: "image/png", name: "thumbnail.png", createdAt: Date.now() });
  return id;
}
