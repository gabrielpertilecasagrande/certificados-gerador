import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createProject, createTextElement } from "@/lib/model/defaults";
import { IndexedDbRepository } from "@/lib/persistence/indexeddb";
import { exportBackup, importBackup } from "@/lib/persistence/project-ops";
import { MAX_AUTO_VERSIONS, saveVersion } from "@/lib/persistence/versions";

describe("versões no IndexedDB", () => {
  it("não repete versões automáticas iguais e limita a quantidade", async () => {
    const repo = new IndexedDbRepository(`t-${Math.random()}`);
    const p = createProject("V");
    await repo.saveProject(p);
    expect(await saveVersion(repo, p, "Ao abrir", true)).not.toBeNull();
    expect(await saveVersion(repo, p, "Ao abrir", true)).toBeNull();
    const manual = await saveVersion(repo, p, "Aprovada pelo cliente", false);
    for (let i = 0; i < MAX_AUTO_VERSIONS + 5; i++) {
      p.templates[0].marginPt = i;
      await saveVersion(repo, p, `auto ${i}`, true);
    }
    const all = await repo.listVersions(p.id);
    expect(all.filter((v) => v.auto)).toHaveLength(MAX_AUTO_VERSIONS);
    expect(all.some((v) => v.id === manual!.id)).toBe(true);
    await repo.deleteProject(p.id);
    expect(await repo.listVersions(p.id)).toEqual([]);
  });

  it("backup .certproj leva versões, fontes e guias", async () => {
    const repo = new IndexedDbRepository(`t-${Math.random()}`);
    const p = createProject("Backup");
    p.templates[0].guides = [{ id: "g", orientation: "h", pos: 100 }];
    p.templates[0].elements.push(createTextElement(p.templates[0].page, { content: "{{nome}}", fontFamily: "Minha" }));
    await repo.putAsset({ id: "fontA", projectId: p.id, mime: "font/ttf", name: "m.ttf", blob: new Blob([new Uint8Array([0, 1, 0, 0])]), createdAt: 1 });
    p.customFonts = [{ id: "f", family: "Minha", weight: 400, italic: false, assetId: "fontA", fileName: "m.ttf" }];
    await repo.saveProject(p);
    await saveVersion(repo, p, "v1", false);
    const blob = await exportBackup(repo, p.id);
    const restored = await importBackup(repo, blob);
    expect(restored.id).not.toBe(p.id);
    expect(restored.templates[0].guides).toEqual([{ id: "g", orientation: "h", pos: 100 }]);
    expect(restored.customFonts[0].assetId).not.toBe("fontA");
    expect(await repo.getAsset(restored.customFonts[0].assetId)).toBeTruthy();
    const versions = await repo.listVersions(restored.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].data.customFonts[0].assetId).toBe(restored.customFonts[0].assetId);
  });
});
