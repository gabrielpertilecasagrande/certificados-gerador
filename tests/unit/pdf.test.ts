import { beforeAll, describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFDict, rgb, StandardFonts } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createProject, createTextElement, pageFromPreset } from "@/lib/model/defaults";
import type { Participant, Project } from "@/lib/model/types";
import { PdfComposer, type AssetBytes } from "@/lib/export/pdf";
import { fontFilesForTemplates, resolveCertificate } from "@/lib/render/resolve";
import type { FontStore } from "@/lib/render/fonts";
import { fontStore } from "./helpers";

let fonts: FontStore;
let bgBytes: Uint8Array;

async function makeBackgroundPdf(width: number, height: number) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([width, height]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 20, y: 20, width: width - 40, height: height - 40, borderColor: rgb(0.1, 0.3, 0.7), borderWidth: 4 });
  page.drawText("CERTIFICADO", { x: 60, y: height - 80, size: 36, font: f });
  return doc.save();
}

function buildProject(n: number, orientation: "A4-landscape" | "A4-portrait" = "A4-landscape"): Project {
  const p = createProject("Teste");
  const t = p.templates[0];
  t.page = pageFromPreset(orientation);
  t.background = {
    assetId: "bg",
    kind: "pdf",
    pdfPage: 1,
    naturalWidthPt: t.page.widthPt,
    naturalHeightPt: t.page.heightPt,
    fit: "stretch",
    visible: true,
    locked: true,
  };
  t.elements.push(createTextElement(t.page, { content: "{{nome}}", name: "Nome" }));
  t.elements.push(
    createTextElement(t.page, {
      content: "Participou de {{evento}} com carga horária de {{carga_horaria}} horas.",
      y: 380,
      fontFamily: "Lora",
      fontWeight: 400,
      fontSize: 14,
      fit: { mode: "fixed", minSize: 10, maxSize: 14, maxLines: 4 },
    }),
  );
  p.columns = [
    { id: "c1", key: "nome", label: "Nome" },
    { id: "c2", key: "carga_horaria", label: "Carga horária" },
  ];
  p.globals = [{ id: "g", key: "evento", label: "Evento", value: "Seminário de Inovação" }];
  const names = ["João Ção Ávila", "ANA CAROLINA PEREIRA DE OLIVEIRA MACHADO", "Zé"];
  p.participants = Array.from({ length: n }, (_, i): Participant => ({
    id: `p${i}`,
    templateId: t.id,
    values: { c1: `${names[i % names.length]} ${i}`, c2: "8" },
    overrides: {},
  }));
  return p;
}

beforeAll(async () => {
  fonts = fontStore();
  bgBytes = await makeBackgroundPdf(841.89, 595.28);
});

const assets = async (): Promise<AssetBytes> => ({ bytes: bgBytes, mime: "application/pdf" });

async function textOf(bytes: Uint8Array, pageNumber = 1) {
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items.map((i) => ("str" in i ? i.str : "")).join(" ");
}

describe("exportação PDF", () => {
  it("gera um PDF A4 horizontal com fundo vetorial e texto acentuado", async () => {
    const project = buildProject(1);
    await fonts.load(fontFilesForTemplates(project.templates));
    const composer = new PdfComposer(fonts, assets);
    const doc = await composer.createDocument();
    const cert = resolveCertificate(project, project.participants[0], fonts);
    expect(cert.issues.filter((i) => i.severity === "error")).toEqual([]);
    await composer.addCertificate(doc, cert);
    const bytes = await doc.save();

    const loaded = await PDFDocument.load(bytes);
    const { width, height } = loaded.getPage(0).getSize();
    expect(width).toBeCloseTo(841.89, 1);
    expect(height).toBeCloseTo(595.28, 1);
    // Fundo incorporado como XObject de formulário (vetorial), não como imagem.
    const xobjects = loaded.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
    const subtypes = xobjects!.keys().map((k) => (xobjects!.lookup(k) as unknown as { dict: PDFDict }).dict.get(PDFName.of("Subtype"))?.toString());
    expect(subtypes).toContain("/Form");
    expect(subtypes).not.toContain("/Image");

    const text = await textOf(bytes);
    expect(text).toContain("CERTIFICADO");
    expect(text).toContain("João Ção Ávila 0");
    expect(text).toContain("Seminário de Inovação");
  });

  it("gera A4 vertical", async () => {
    const project = buildProject(1, "A4-portrait");
    await fonts.load(fontFilesForTemplates(project.templates));
    const composer = new PdfComposer(fonts, assets);
    const doc = await composer.createDocument();
    await composer.addCertificate(doc, resolveCertificate(project, project.participants[0], fonts));
    const loaded = await PDFDocument.load(await doc.save());
    const { width, height } = loaded.getPage(0).getSize();
    expect(width).toBeLessThan(height);
  });

  it.each([10, 100, 1000])("gera PDF consolidado com %i certificados", async (n) => {
    const project = buildProject(n);
    await fonts.load(fontFilesForTemplates(project.templates));
    const composer = new PdfComposer(fonts, assets);
    const doc = await composer.createDocument();
    const t0 = performance.now();
    for (const p of project.participants) await composer.addCertificate(doc, resolveCertificate(project, p, fonts));
    const bytes = await doc.save();
    const ms = performance.now() - t0;
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(n);
    expect(await textOf(bytes, n)).toContain(`${n - 1}`);
    expect(ms).toBeLessThan(60_000);
  });

  it("gera 100 PDFs individuais", async () => {
    const project = buildProject(100);
    await fonts.load(fontFilesForTemplates(project.templates));
    const composer = new PdfComposer(fonts, assets);
    for (const p of project.participants) {
      const doc = await composer.createDocument();
      await composer.addCertificate(doc, resolveCertificate(project, p, fonts));
      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(1000);
    }
  });
});
