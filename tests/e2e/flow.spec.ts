import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { addNameField, createProject, importParticipants, login, waitSaved } from "./helpers";

test("fluxo principal: arte PDF → campo nome → planilha → ajustes → exportação → reabrir", async ({ page }) => {
  await login(page);
  await createProject(page, "Seminário de Teste", "arte-horizontal.pdf");

  // Campo de nome com tipografia personalizada.
  await addNameField(page);
  const panel = page.getByTestId("properties-panel");
  await panel.getByLabel("Tamanho da fonte").fill("30");
  await panel.getByLabel("Tamanho da fonte").press("Enter");
  await panel.getByLabel("Fonte", { exact: true }).selectOption("Playfair Display");
  await expect(panel.getByLabel("Fonte", { exact: true })).toHaveValue("Playfair Display");
  await panel.getByRole("button", { name: "Centralizar na horizontal" }).click();

  // Importação de 100 participantes (CSV).
  await importParticipants(page, "participantes-100.csv", 100);

  // Edição direta na célula.
  const grid = page.getByTestId("participants-grid");
  const firstCell = grid.locator("[data-row='0'] [role=gridcell]").first();
  await firstCell.dblclick();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Maria Clara da Silva");
  await page.keyboard.press("Enter");
  await expect(grid.locator("[data-row='0'] [role=gridcell]").first()).toHaveText("Maria Clara da Silva");

  // Edição em massa: 3 linhas selecionadas → carga horária 20.
  for (const i of [0, 1, 2]) await grid.locator(`[data-row='${i}'] input[type=checkbox]`).click();
  await expect(page.getByTestId("bulk-bar")).toContainText("3 selecionado");
  await page.getByTestId("bulk-bar").getByRole("button", { name: "Definir valor" }).click();
  await page.getByLabel("Coluna").selectOption({ label: "Carga horária" });
  await page.getByRole("textbox", { name: "Valor" }).fill("20");
  await expect(page.getByTestId("bulk-preview")).toContainText("3 célula(s) em 3 registro(s)");
  await page.getByTestId("bulk-apply").click();
  await expect(grid.locator("[data-row='2'] [role=gridcell]").nth(2)).toHaveText("20");

  // Padronização com prévia: MAIÚSCULAS em toda a coluna Empresa.
  await page.getByRole("button", { name: "Limpar seleção" }).click();
  await page.getByRole("button", { name: "Editar em massa" }).click();
  await page.getByRole("menuitem", { name: "MAIÚSCULAS" }).click();
  await page.getByLabel("Coluna").selectOption({ label: "Empresa" });
  await expect(page.getByTestId("bulk-preview")).toContainText("100 célula(s) em 100 registro(s)");
  await page.getByTestId("bulk-apply").click();
  await expect(grid.locator("[data-row='0'] [role=gridcell]").nth(1)).toHaveText("EMPRESA A");

  // Pré-visualização com dados reais e navegação.
  await page.getByRole("tab", { name: "Pré-visualização" }).click();
  await expect(page.getByTestId("participant-position")).toHaveText("1 de 100");
  await page.getByRole("button", { name: "Próximo certificado" }).click();
  await page.getByRole("button", { name: "Próximo certificado" }).click();
  await expect(page.getByTestId("participant-position")).toHaveText("3 de 100");

  // Ajuste individual do 3º participante (nome longo).
  await page.getByTestId("edit-individual").click();
  await expect(page.getByText("Editando somente este certificado")).toBeVisible();
  await page.getByTestId("editor-canvas").click({ position: { x: 600, y: 300 } });
  await page.getByRole("tab", { name: "Camadas" }).click();
  await page.locator("li", { hasText: "Nome completo" }).first().click();
  await panel.getByLabel("Tamanho da fonte").fill("22");
  await panel.getByLabel("Tamanho da fonte").press("Enter");
  await expect(page.getByRole("button", { name: /Restaurar global \(1\)/ })).toBeVisible();
  // O modelo global continua em 30 pt.
  await page.getByTestId("individual-toggle").click();
  await expect(panel.getByLabel("Tamanho da fonte")).toHaveValue("30");
  await waitSaved(page);

  // Exportação ZIP com PDFs individuais.
  await page.getByRole("tab", { name: "Exportação" }).click();
  const zipDownload = page.waitForEvent("download");
  await page.getByTestId("start-export").click();
  const zip = await zipDownload;
  expect(zip.suggestedFilename()).toBe("Seminário de Teste - certificados.zip");
  const entries = unzipSync(new Uint8Array(await readFile((await zip.path())!)));
  const names = Object.keys(entries);
  expect(names).toHaveLength(100);
  expect(names).toContain("Certificado_Maria Clara da Silva.pdf");
  const pdf = await PDFDocument.load(entries["Certificado_Maria Clara da Silva.pdf"]);
  expect(pdf.getPageCount()).toBe(1);
  expect(Math.round(pdf.getPage(0).getWidth())).toBe(842);
  expect(Math.round(pdf.getPage(0).getHeight())).toBe(595);
  await expect(page.getByTestId("export-progress")).toHaveAttribute("data-status", "done");

  // PDF consolidado.
  await page.getByRole("radio", { name: /PDF único/ }).click();
  const mergedDownload = page.waitForEvent("download");
  await page.getByTestId("start-export").click();
  const merged = await PDFDocument.load(await readFile((await (await mergedDownload).path())!));
  expect(merged.getPageCount()).toBe(100);

  // Reabrir: persistência após recarregar a página.
  await waitSaved(page);
  await page.reload();
  await page.getByRole("tab", { name: "Participantes" }).click();
  await expect(page.getByTestId("participants-grid").locator("[data-row='0'] [role=gridcell]").first()).toHaveText("Maria Clara da Silva");
  await page.getByRole("tab", { name: "Editor" }).click();
  await page.getByRole("tab", { name: "Camadas" }).click();
  await page.locator("li", { hasText: "Nome completo" }).first().click();
  await expect(panel.getByLabel("Tamanho da fonte")).toHaveValue("30");
  await expect(panel.getByLabel("Fonte", { exact: true })).toHaveValue("Playfair Display");

  // Lista de projetos mostra o projeto com 100 participantes.
  await page.getByRole("link", { name: "Voltar aos projetos" }).click();
  const card = page.locator("li", { hasText: "Seminário de Teste" });
  await expect(card).toContainText("100");
  await expect(card).toContainText("Exportado");
});
