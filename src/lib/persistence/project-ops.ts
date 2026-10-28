import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createProject, detectPreset, pageFromPreset } from "@/lib/model/defaults";
import { migrateProject } from "@/lib/model/migrate";
import type { AssetRecord, Background, ID, PagePreset, PageSize, Project } from "@/lib/model/types";
import { newId } from "@/lib/utils/id";
import type { ProjectRepository } from "./repository";

export interface ArtworkInput {
  kind: "pdf" | "image";
  blob: Blob;
  mime: string;
  name: string;
  pages: { widthPt: number; heightPt: number }[];
}

export async function storeAsset(repo: ProjectRepository, projectId: ID, blob: Blob, name: string, mime = blob.type): Promise<ID> {
  const id = newId();
  await repo.putAsset({ id, projectId, blob, mime, name, createdAt: Date.now() });
  return id;
}

export function backgroundFromArtwork(assetId: ID, art: ArtworkInput, pdfPage: number): Background {
  const size = art.pages[Math.max(0, pdfPage - 1)] ?? art.pages[0];
  return {
    assetId,
    kind: art.kind,
    pdfPage,
    naturalWidthPt: size.widthPt,
    naturalHeightPt: size.heightPt,
    fit: "stretch",
    visible: true,
    locked: true,
  };
}

/** Página com o tamanho original da arte (PDF) ou com a proporção da imagem sobre o preset escolhido. */
export function pageForArtwork(art: ArtworkInput, pdfPage: number, preset: PagePreset | "original"): PageSize {
  const size = art.pages[Math.max(0, pdfPage - 1)] ?? art.pages[0];
  if (preset === "original") {
    if (art.kind === "pdf") return { widthPt: size.widthPt, heightPt: size.heightPt, preset: detectPreset(size.widthPt, size.heightPt) };
    // Imagem: usa A4/A5 na orientação da imagem quando a proporção bate; senão, A4 com a proporção da imagem.
    const landscape = size.widthPt >= size.heightPt;
    const a4 = pageFromPreset(landscape ? "A4-landscape" : "A4-portrait");
    const ratio = size.widthPt / size.heightPt;
    if (Math.abs(ratio - a4.widthPt / a4.heightPt) < 0.02) return a4;
    return landscape
      ? { widthPt: a4.widthPt, heightPt: a4.widthPt / ratio, preset: "custom" }
      : { widthPt: a4.heightPt * ratio, heightPt: a4.heightPt, preset: "custom" };
  }
  if (preset === "custom") return { widthPt: size.widthPt, heightPt: size.heightPt, preset: "custom" };
  return pageFromPreset(preset);
}

export async function createNewProject(
  repo: ProjectRepository,
  opts: { name: string; artwork?: ArtworkInput; pdfPage?: number; page: PageSize | "original" },
): Promise<Project> {
  const project = createProject(opts.name.trim() || "Novo projeto");
  const template = project.templates[0];
  if (opts.artwork) {
    const pdfPage = opts.pdfPage ?? 1;
    const assetId = await storeAsset(repo, project.id, opts.artwork.blob, opts.artwork.name, opts.artwork.mime);
    template.background = backgroundFromArtwork(assetId, opts.artwork, pdfPage);
    template.page = opts.page === "original" ? pageForArtwork(opts.artwork, pdfPage, "original") : opts.page;
  } else {
    template.page = opts.page === "original" ? pageFromPreset("A4-landscape") : opts.page;
  }
  await repo.saveProject(project);
  return project;
}

function remapAssets(project: Project, map: Map<ID, ID>): Project {
  const p = structuredClone(project);
  const m = (id: ID) => map.get(id) ?? id;
  for (const t of p.templates) {
    if (t.background) t.background.assetId = m(t.background.assetId);
    for (const el of t.elements) if (el.type === "image") el.assetId = m(el.assetId);
  }
  if (p.thumbnailAssetId) p.thumbnailAssetId = m(p.thumbnailAssetId);
  return p;
}

export async function duplicateProject(repo: ProjectRepository, id: ID): Promise<Project> {
  const src = await repo.getProject(id);
  if (!src) throw new Error("Projeto não encontrado");
  const newProjectId = newId();
  const map = new Map<ID, ID>();
  for (const a of await repo.listAssets(id)) {
    const nid = newId();
    map.set(a.id, nid);
    await repo.putAsset({ ...a, id: nid, projectId: newProjectId, createdAt: Date.now() });
  }
  const now = Date.now();
  const copy: Project = { ...remapAssets(src, map), id: newProjectId, name: `${src.name} (cópia)`, createdAt: now, updatedAt: now, status: "draft" };
  await repo.saveProject(copy);
  return copy;
}

/** Backup portátil do projeto (.certproj = ZIP com project.json + arquivos). */
export async function exportBackup(repo: ProjectRepository, id: ID): Promise<Blob> {
  const project = await repo.getProject(id);
  if (!project) throw new Error("Projeto não encontrado");
  const assets = await repo.listAssets(id);
  const files: Record<string, Uint8Array> = {
    "project.json": strToU8(JSON.stringify(project)),
    "assets.json": strToU8(JSON.stringify(assets.map(({ id: aid, mime, name, createdAt }) => ({ id: aid, mime, name, createdAt })))),
  };
  for (const a of assets) files[`assets/${a.id}`] = new Uint8Array(await a.blob.arrayBuffer());
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped.slice().buffer as ArrayBuffer], { type: "application/zip" });
}

export async function importBackup(repo: ProjectRepository, file: Blob): Promise<Project> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error("Arquivo de backup inválido");
  }
  if (!entries["project.json"]) throw new Error("Arquivo de backup inválido");
  const project = migrateProject(JSON.parse(strFromU8(entries["project.json"])) as Project);
  const metas = JSON.parse(strFromU8(entries["assets.json"] ?? strToU8("[]"))) as Omit<AssetRecord, "blob" | "projectId">[];
  const newProjectId = newId();
  const map = new Map<ID, ID>();
  for (const meta of metas) {
    const bytes = entries[`assets/${meta.id}`];
    if (!bytes) continue;
    const nid = newId();
    map.set(meta.id, nid);
    await repo.putAsset({ id: nid, projectId: newProjectId, mime: meta.mime, name: meta.name, createdAt: Date.now(), blob: new Blob([bytes.slice().buffer as ArrayBuffer], { type: meta.mime }) });
  }
  const restored: Project = { ...remapAssets(project, map), id: newProjectId, updatedAt: Date.now() };
  await repo.saveProject(restored);
  return restored;
}
