import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createProject, createTemplate, createTextElement } from "@/lib/model/defaults";
import { migrateProject } from "@/lib/model/migrate";
import type { Project } from "@/lib/model/types";
import { readFontInfo } from "@/lib/import/font";
import { templateAssignments, distinctValues } from "@/lib/participants/templates";
import { restoreVersion, snapshotOf } from "@/lib/persistence/versions";
import { FontStore, customFontFile, resolveFontVariant } from "@/lib/render/fonts";
import { resolveCertificate } from "@/lib/render/resolve";
import { PdfComposer } from "@/lib/export/pdf";
import { snapBox } from "@/features/editor/snapping";

const fontBytes = (f: string) => readFile(path.resolve("public/fonts", f)).then((b) => new Uint8Array(b));

function twoTemplates(): Project {
  const p = createProject("Evento");
  const speaker = { ...createTemplate("Palestrante"), id: "tSpk" };
  p.templates[0].id = "tPart";
  p.templates.push(speaker);
  p.columns = [
    { id: "n", key: "nome", label: "Nome" },
    { id: "c", key: "categoria", label: "Categoria" },
  ];
  p.participants = [
    { id: "a", templateId: "tPart", overrides: {}, values: { n: "Ana", c: "Palestrante" } },
    { id: "b", templateId: "tPart", overrides: {}, values: { n: "Bia", c: "  PALESTRANTE " } },
    { id: "c", templateId: "tPart", overrides: {}, values: { n: "Caio", c: "Participante" } },
  ];
  return p;
}

describe("vários modelos", () => {
  it("aplica regras por categoria ignorando acento/caixa/espaços", () => {
    const p = twoTemplates();
    p.templateRules = [{ columnId: "c", value: "palestrante", templateId: "tSpk" }];
    expect(templateAssignments(p)).toEqual([
      { participantId: "a", templateId: "tSpk" },
      { participantId: "b", templateId: "tSpk" },
    ]);
    expect(templateAssignments(p, ["c"])).toEqual([]);
    expect(distinctValues(p, "c")).toEqual([
      { value: "Palestrante", count: 2 },
      { value: "Participante", count: 1 },
    ]);
  });

  it("ignora regras de modelos removidos", () => {
    const p = twoTemplates();
    p.templateRules = [{ columnId: "c", value: "Palestrante", templateId: "inexistente" }];
    expect(templateAssignments(p)).toEqual([]);
  });

  it("migra projetos da fase 1", () => {
    const old = createProject("Antigo") as Partial<Project>;
    delete old.templateRules;
    delete old.customFonts;
    delete (old.templates![0] as Partial<Project["templates"][0]>).guides;
    const m = migrateProject(old as Project);
    expect(m.templateRules).toEqual([]);
    expect(m.customFonts).toEqual([]);
    expect(m.templates[0].guides).toEqual([]);
  });
});

describe("fontes personalizadas", () => {
  it("lê metadados e evita conflito com fontes embutidas", async () => {
    const info = readFontInfo(await fontBytes("Lora-700i.ttf"));
    expect(info).toEqual({ family: "Lora (projeto)", weight: 700, italic: true, missingChars: [] });
    expect(() => readFontInfo(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(/inválido/);
    expect(() => readFontInfo(new Uint8Array(0x10), [])).toThrow();
  });

  it("recusa estilo repetido", async () => {
    expect(() => readFontInfo(Buffer.from([0, 1, 0, 0]) as unknown as Uint8Array)).toThrow();
    const bytes = await fontBytes("Lora-400.ttf");
    expect(() => readFontInfo(bytes, [{ family: "Lora (projeto)", weight: 400, italic: false }])).toThrow(/já foi adicionada/);
  });

  it("resolve fonte do projeto, cai na padrão quando ausente e embute no PDF", async () => {
    const custom = [{ family: "Minha Fonte", weight: 400, italic: false, assetId: "f1" }];
    expect(resolveFontVariant("Minha Fonte", 700, false, custom).file).toBe(customFontFile("f1"));
    expect(resolveFontVariant("Sumiu", 400, false, custom).family).toBe("Montserrat");

    const p = createProject("Fontes");
    p.columns = [{ id: "n", key: "nome", label: "Nome" }];
    p.customFonts = [{ id: "x", family: "Minha Fonte", weight: 400, italic: false, assetId: "f1", fileName: "minha.ttf" }];
    p.templates[0].elements.push(createTextElement(p.templates[0].page, { content: "{{nome}}", fontFamily: "Minha Fonte", fontWeight: 400 }));
    p.templates[0].elements.push(createTextElement(p.templates[0].page, { content: "x", y: 10, fontFamily: "Sumiu" }));
    p.participants = [{ id: "a", templateId: p.templates[0].id, overrides: {}, values: { n: "Conceição Ávila" } }];

    const store = new FontStore(async (file) => (file === customFontFile("f1") ? fontBytes("Lora-400.ttf") : fontBytes(file)));
    await store.load([customFontFile("f1"), "Montserrat-700.ttf"]);
    const cert = resolveCertificate(p, p.participants[0], store);
    expect(cert.issues.map((i) => i.message)).toContain('Fonte "Sumiu" indisponível — usando a padrão');
    const composer = new PdfComposer(store, async () => ({ bytes: new Uint8Array(), mime: "" }));
    const doc = await composer.createDocument();
    await composer.addCertificate(doc, cert);
    const bytes = await doc.save();
    const pdf = await getDocument({ data: bytes.slice() }).promise;
    const page = await pdf.getPage(1);
    const text = (await page.getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ");
    expect(text).toContain("Conceição Ávila");
    const raw = Buffer.from(await (await PDFDocument.load(bytes)).save({ useObjectStreams: false })).toString("latin1");
    expect(raw).toMatch(/\/BaseFont \/[A-Z]*\+?Lora/);
  });
});

describe("guias", () => {
  it("o encaixe usa as guias do modelo", () => {
    const t = createTemplate();
    t.guides = [{ id: "g", orientation: "v", pos: 123 }];
    const r = snapBox({ x: 120, y: 300, width: 50, height: 20 }, t, [], 5);
    expect(r.dx).toBe(3);
    expect(r.guides).toContainEqual({ orientation: "v", pos: 123 });
  });
});

describe("histórico de versões", () => {
  it("restaura o layout mantendo participantes e corrigindo referências", () => {
    const p = twoTemplates();
    const el = createTextElement(p.templates[0].page, { content: "{{nome}}", fontSize: 30 });
    p.templates[0].elements.push(el);
    const v1 = snapshotOf(p);

    // Depois da versão: fonte muda, novo elemento com ajuste individual, participante no modelo Palestrante.
    p.templates[0].elements[0] = { ...el, fontSize: 18 };
    const extra = createTextElement(p.templates[0].page, { content: "extra" });
    p.templates[0].elements.push(extra);
    p.participants[0].overrides = { [extra.id]: { fontSize: 9 }, [el.id]: { fontSize: 20 } };
    p.participants[1].templateId = "tSpk";
    p.participants.push({ id: "d", templateId: "tPart", overrides: {}, values: { n: "Novo" } });

    // Versão sem o modelo Palestrante.
    const v0 = { ...v1, templates: v1.templates.filter((t) => t.id !== "tSpk") };
    const r = restoreVersion(p, v0);
    expect(r.templates).toHaveLength(1);
    expect(r.templates[0].elements).toHaveLength(1);
    expect(r.templates[0].elements[0].type === "text" && r.templates[0].elements[0].fontSize).toBe(30);
    expect(r.participants).toHaveLength(4);
    expect(r.participants[0].overrides).toEqual({ [el.id]: { fontSize: 20 } });
    expect(r.participants[1].templateId).toBe("tPart");
    // A versão é uma cópia: alterar o restaurado não altera o snapshot.
    (r.templates[0].elements[0] as { fontSize: number }).fontSize = 1;
    expect((v0.templates[0].elements[0] as { fontSize: number }).fontSize).toBe(30);
  });
});
