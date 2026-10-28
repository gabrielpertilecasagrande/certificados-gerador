import { expect, test, type Page } from "@playwright/test";
import { addNameField, createProject, login } from "./helpers";

const num = async (page: Page, label: string) => parseFloat((await page.getByTestId("properties-panel").getByLabel(label).inputValue()).replace(",", "."));

test("editor: arrastar, redimensionar, centralizar, desfazer e atalhos", async ({ page }) => {
  await login(page);
  await createProject(page, "Editor", "arte-horizontal.pdf");
  await addNameField(page);
  const canvas = page.getByTestId("editor-canvas");
  const box = (await canvas.boundingBox())!;

  const x0 = await num(page, "Posição X em mm");
  const y0 = await num(page, "Posição Y em mm");
  const w0 = await num(page, "Largura em mm");

  // Arrastar o campo (o centro da área do canvas fica sobre o campo recém-inserido).
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 60, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => num(page, "Posição Y em mm")).toBeGreaterThan(y0 + 10);
  const x1 = await num(page, "Posição X em mm");
  expect(x1).toBeGreaterThan(x0 + 10);

  // Desfazer volta à posição original; refazer reaplica.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => num(page, "Posição X em mm")).toBeCloseTo(x0, 0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => num(page, "Posição X em mm")).toBeCloseTo(x1, 0);

  // Centralizar na horizontal.
  await page.getByTestId("properties-panel").getByRole("button", { name: "Centralizar na horizontal" }).click();
  await expect.poll(() => num(page, "Posição X em mm")).toBeCloseTo(x0, 0);

  // Setas movem 1 pt (Shift: 10 pt).
  await canvas.click({ position: { x: 5, y: 5 } });
  await page.getByRole("tab", { name: "Camadas" }).click();
  await page.locator("li", { hasText: "Nome completo" }).first().click();
  const yBefore = await num(page, "Posição Y em mm");
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(() => num(page, "Posição Y em mm")).toBeCloseTo(yBefore + 3.5, 0);

  // Largura numérica.
  await page.getByTestId("properties-panel").getByLabel("Largura em mm").fill("120");
  await page.getByTestId("properties-panel").getByLabel("Largura em mm").press("Enter");
  await expect.poll(() => num(page, "Largura em mm")).toBe(120);
  expect(w0).not.toBe(120);

  // Duplicar (Ctrl+D) e excluir (Delete).
  await page.locator("li", { hasText: "Nome completo" }).first().click();
  await page.keyboard.press("ControlOrMeta+d");
  await expect(page.locator("li", { hasText: "Nome completo (cópia)" })).toHaveCount(1);
  await page.keyboard.press("Delete");
  await expect(page.locator("li", { hasText: "Nome completo (cópia)" })).toHaveCount(0);

  // Bloquear impede arrastar pelo canvas.
  await page.locator("li", { hasText: "Nome completo" }).first().click();
  await page.getByTestId("properties-panel").getByRole("button", { name: "Bloquear" }).click();
  const xLocked = await num(page, "Posição X em mm");
  const nb = (await canvas.boundingBox())!;
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2 + 20);
  await page.mouse.down();
  await page.mouse.move(nb.x + nb.width / 2 + 100, nb.y + nb.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await page.locator("li", { hasText: "Nome completo" }).first().click();
  expect(await num(page, "Posição X em mm")).toBeCloseTo(xLocked, 0);
});
