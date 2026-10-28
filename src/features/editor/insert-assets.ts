"use client";

import { prepareArtwork } from "@/lib/import/background";
import { getRepository } from "@/lib/persistence/indexeddb";
import { storeAsset } from "@/lib/persistence/project-ops";
import { useWorkspace } from "@/features/workspace/store";
import { toast } from "sonner";

/** Importa uma imagem (logo/assinatura) para o projeto atual. SVG/WEBP são convertidos para PNG. */
export async function importImageAsset(file: File): Promise<{ assetId: string; ratio: number } | null> {
  const project = useWorkspace.getState().project;
  if (!project) return null;
  try {
    const art = await prepareArtwork(file);
    if (art.kind !== "image") {
      toast.error("Use uma imagem PNG, JPG, WEBP ou SVG");
      return null;
    }
    const assetId = await storeAsset(getRepository(), project.id, art.blob, file.name, art.mime);
    const { widthPt, heightPt } = art.pages[0];
    return { assetId, ratio: widthPt / heightPt };
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Imagem inválida");
    return null;
  }
}
