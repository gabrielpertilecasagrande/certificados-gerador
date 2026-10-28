import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { addNameField, createProject, importParticipants, login } from "./helpers";

test.beforeEach(async ({ page }) => login(page));

test("PDF vertical define a página em retrato", async ({ page }) => {
  await createProject(page, "Vertical", "arte-vertical.pdf");
  await page.getByTestId("editor-canvas").click({ position: { x: 20, y: 20 } });
  const panel = page.getByTestId("properties-panel");
  await expect(panel).toContainText("210 × 297 mm");
});

for (const art of ["arte.png", "arte.jpg"]) {
  test(`arte ${art} como fundo e exportação PNG`, async ({ page }) => {
    await createProject(page, `Imagem ${art}`, art);
    await addNameField(page);
    await importParticipants(page, "participantes-10.xlsx", 10);
    await page.getByRole("tab", { name: "Exportação" }).click();
    await page.getByRole("radio", { name: /Imagens PNG/ }).click();
    await page.getByRole("radio", { name: /150 DPI/ }).click();
    const dl = page.waitForEvent("download");
    await page.getByTestId("start-export").click();
    const entries = unzipSync(new Uint8Array(await readFile((await (await dl).path())!)));
    const files = Object.keys(entries);
    expect(files).toHaveLength(10);
    expect(files).toContain("Certificado_José Antônio Conceição.png");
    const png = entries[files[0]];
    expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
    // A4 a 150 DPI ≈ 1754 px de largura.
    const width = new DataView(png.buffer, png.byteOffset).getUint32(16);
    expect(width).toBe(1754);
  });
}

test("XLSX + organização do ZIP por coluna e PDF com acentos", async ({ page }) => {
  await createProject(page, "Por categoria", "arte-horizontal.pdf");
  await addNameField(page);
  await importParticipants(page, "participantes-10.xlsx", 10);
  await page.getByRole("tab", { name: "Exportação" }).click();
  await page.getByLabel("Padrão do nome do arquivo").fill("{{nome|upper}}");
  await page.getByRole("radio", { name: "Por coluna" }).click();
  await page.getByLabel("Coluna para pastas").selectOption({ label: "Categoria" });
  const dl = page.waitForEvent("download");
  await page.getByTestId("start-export").click();
  const entries = unzipSync(new Uint8Array(await readFile((await (await dl).path())!)));
  const names = Object.keys(entries).sort();
  expect(names).toContain("Palestrante/MARIA SILVA.pdf");
  expect(names).toContain("Participante/ÇÉDRIC MÜLLER.pdf");
  const doc = await PDFDocument.load(entries["Participante/ÇÉDRIC MÜLLER.pdf"]);
  expect(doc.getPageCount()).toBe(1);
});

test("nome que não cabe é sinalizado no diagnóstico", async ({ page }) => {
  await createProject(page, "Overflow", "arte-horizontal.pdf");
  await addNameField(page);
  const panel = page.getByTestId("properties-panel");
  await panel.getByLabel("Largura em mm").fill("40");
  await panel.getByLabel("Largura em mm").press("Enter");
  await panel.getByLabel("Tamanho mínimo").fill("30");
  await panel.getByLabel("Tamanho mínimo").press("Enter");
  await importParticipants(page, "participantes-10.csv", 10);
  await page.getByRole("tab", { name: "Pré-visualização" }).click();
  const diag = page.getByTestId("diagnostics");
  await expect(diag).toContainText("Todos os certificados verificados");
  await expect(diag).toContainText(/não coube na caixa/);
  await diag.getByText(/Pedro Henrique/).click();
  await expect(page.getByTestId("preview-issues")).toContainText("não coube");
});
