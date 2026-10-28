import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { addNameField, createProject, importParticipants, login, waitSaved } from "./helpers";

test("vários modelos, regras por categoria, fonte própria, guias e histórico de versões", async ({ page }) => {
  await login(page);
  await createProject(page, "Evento com modelos", "arte-horizontal.pdf");
  await addNameField(page);
  const panel = page.getByTestId("properties-panel");
  await importParticipants(page, "participantes-10.csv", 10);

  // Segundo modelo: duplicar e renomear.
  await page.getByRole("tab", { name: "Editor" }).click();
  await page.getByTestId("template-switcher").click();
  await page.getByRole("menuitem", { name: "Duplicar este modelo" }).click();
  await expect(page.getByTestId("template-switcher")).toContainText("Modelo principal (cópia)");
  await page.getByTestId("template-switcher").click();
  await page.getByRole("menuitem", { name: "Renomear…" }).click();
  await page.getByRole("textbox", { name: "Renomear modelo" }).fill("Palestrante");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("template-switcher")).toContainText("Palestrante");

  // Regra: Categoria = Palestrante → modelo Palestrante (linhas 1, 5 e 9).
  await page.getByRole("tab", { name: "Participantes" }).click();
  await page.getByTestId("template-rules").click();
  await page.getByLabel("Coluna").selectOption({ label: "Categoria" });
  await page.getByLabel("Modelo para Palestrante").selectOption({ label: "Palestrante" });
  await expect(page.getByTestId("rules-preview")).toHaveText("3 participante(s) mudarão de modelo");
  await page.getByTestId("apply-rules").click();
  await expect(page.getByLabel("Modelo da linha 5", { exact: true })).toHaveValue(await page.getByLabel("Modelo da linha 1", { exact: true }).inputValue());

  // Fonte própria (TTF) aplicada ao nome do modelo Palestrante.
  await page.getByRole("tab", { name: "Editor" }).click();
  await page.getByRole("tab", { name: "Dados fixos" }).click();
  await page.setInputFiles("[data-testid=font-input]", path.resolve("public/fonts/Lora-700i.ttf"));
  await page.getByTestId("font-license").check();
  await page.getByTestId("font-confirm").click();
  await expect(page.getByText("Lora (projeto)").first()).toBeVisible();
  await page.getByRole("tab", { name: "Camadas" }).click();
  await page.locator("li", { hasText: "Nome completo" }).first().click();
  await panel.getByLabel("Fonte", { exact: true }).selectOption("Lora (projeto)");
  await expect(panel.getByLabel("Fonte", { exact: true })).toHaveValue("Lora (projeto)");

  // Guia criada arrastando da régua superior.
  const ruler = (await page.getByTestId("ruler-h").boundingBox())!;
  await page.mouse.move(ruler.x + 300, ruler.y + 10);
  await page.mouse.down();
  await page.mouse.move(ruler.x + 300, ruler.y + 200, { steps: 6 });
  await expect(page.getByTestId("guide-position")).toBeVisible();
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await expect(panel.getByRole("button", { name: "Remover 1 guia(s)" })).toBeVisible();

  // Histórico: salvar versão, alterar, restaurar.
  await page.getByRole("button", { name: "Histórico de versões" }).click();
  await page.getByLabel("Nome da versão").fill("Antes do ajuste");
  await page.getByTestId("save-version").click();
  await expect(page.getByTestId("version-list")).toContainText("Antes do ajuste");
  await page.keyboard.press("Escape");
  await page.locator("li", { hasText: "Nome completo" }).first().click();
  await panel.getByLabel("Tamanho da fonte").fill("20");
  await panel.getByLabel("Tamanho da fonte").press("Enter");
  await expect(panel.getByLabel("Tamanho da fonte")).toHaveValue("20");
  await page.getByRole("button", { name: "Histórico de versões" }).click();
  await page.getByTestId("version-list").locator("li", { hasText: "Antes do ajuste" }).getByTestId("restore-version").click();
  await page.getByRole("button", { name: "Restaurar", exact: true }).click();
  await page.getByRole("tab", { name: "Camadas" }).click();
  await page.locator("li", { hasText: "Nome completo" }).first().click();
  await expect(panel.getByLabel("Tamanho da fonte")).toHaveValue("34");
  await expect(panel.getByLabel("Fonte", { exact: true })).toHaveValue("Lora (projeto)");

  // Exportação organizada por modelo.
  await page.getByRole("tab", { name: "Exportação" }).click();
  await page.getByRole("radio", { name: "Por modelo" }).click();
  const dl = page.waitForEvent("download");
  await page.getByTestId("start-export").click();
  const entries = unzipSync(new Uint8Array(await readFile((await (await dl).path())!)));
  const names = Object.keys(entries);
  expect(names.filter((n) => n.startsWith("Palestrante/"))).toHaveLength(3);
  expect(names.filter((n) => n.startsWith("Modelo principal/"))).toHaveLength(7);
  // Os dicionários ficam em object streams: regrava sem compressão para inspecionar a fonte embutida.
  const doc = await PDFDocument.load(entries["Palestrante/Certificado_Maria Silva.pdf"]);
  const raw = Buffer.from(await doc.save({ useObjectStreams: false })).toString("latin1");
  expect(raw).toMatch(/\/BaseFont \/[A-Z]*\+?Lora/);

  // Tudo persiste após recarregar.
  await waitSaved(page);
  await page.reload();
  await expect(page.getByTestId("template-switcher")).toContainText("Modelo (2)");
  await page.getByRole("tab", { name: "Dados fixos" }).click();
  await expect(page.getByText("Lora (projeto)").first()).toBeVisible();
  await page.getByTestId("template-switcher").click();
  await page.getByRole("menuitem", { name: /Palestrante/ }).click();
  await expect(panel.getByRole("button", { name: "Remover 1 guia(s)" })).toBeVisible();
});
