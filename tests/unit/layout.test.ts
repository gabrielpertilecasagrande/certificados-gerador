import { beforeAll, describe, expect, it } from "vitest";
import { layoutText, measureText, type LayoutInput } from "@/lib/render/layout";
import type { FontStore } from "@/lib/render/fonts";
import { fontStore } from "./helpers";

let fonts: FontStore;
const FILE = "Montserrat-700.ttf";

beforeAll(async () => {
  fonts = fontStore();
  await fonts.load([FILE]);
});

const base = (text: string, over: Partial<LayoutInput> = {}): LayoutInput => ({
  text,
  font: fonts.get(FILE),
  fontSize: 34,
  letterSpacing: 0,
  lineHeight: 1.2,
  align: "center",
  verticalAlign: "middle",
  padding: 0,
  width: 520,
  height: 60,
  fit: { mode: "shrink", minSize: 16, maxSize: 34, maxLines: 1 },
  textTransform: "none",
  ...over,
});

describe("auto-ajuste de nomes", () => {
  it("mantém o tamanho padrão para nomes curtos", () => {
    const r = layoutText(base("ANA SILVA"));
    expect(r.fontSize).toBe(34);
    expect(r.reduced).toBe(false);
    expect(r.overflow).toBe(false);
    expect(r.lines).toHaveLength(1);
  });

  it("reduz apenas nomes longos, até caber na largura", () => {
    const r = layoutText(base("ANA CAROLINA PEREIRA DE OLIVEIRA MACHADO"));
    expect(r.fontSize).toBeLessThan(34);
    expect(r.fontSize).toBeGreaterThanOrEqual(16);
    expect(r.lines[0].width).toBeLessThanOrEqual(520.01);
    expect(r.overflow).toBe(false);
    // Usa o maior tamanho possível: +0,2 pt já não caberia.
    expect(measureText(fonts.get(FILE), r.lines[0].text, r.fontSize + 0.2, 0)).toBeGreaterThan(520);
  });

  it("sinaliza (sem cortar) quando nem o mínimo cabe", () => {
    const text = "ANA CAROLINA PEREIRA DE OLIVEIRA MACHADO DOS SANTOS FERREIRA ALBUQUERQUE";
    const r = layoutText(base(text, { width: 200 }));
    expect(r.overflow).toBe(true);
    expect(r.fontSize).toBe(16);
    expect(r.lines.map((l) => l.text).join(" ")).toBe(text);
  });

  it("quebra em até N linhas no modo quebra", () => {
    const r = layoutText(
      base("ANA CAROLINA PEREIRA DE OLIVEIRA MACHADO", { height: 100, fit: { mode: "wrap", minSize: 16, maxSize: 34, maxLines: 2 } }),
    );
    expect(r.lines).toHaveLength(2);
    expect(r.fontSize).toBe(34);
    expect(r.overflow).toBe(false);
    expect(r.lines[1].baseline - r.lines[0].baseline).toBeCloseTo(34 * 1.2, 5);
  });

  it("modo proporcional busca o maior tamanho dentro dos limites", () => {
    const r = layoutText(base("ANA", { fit: { mode: "grow", minSize: 10, maxSize: 60, maxLines: 1 } }));
    expect(r.fontSize).toBeGreaterThan(34);
    expect(r.fontSize).toBeLessThanOrEqual(60);
  });

  it("alinha à direita e centraliza", () => {
    const right = layoutText(base("ANA", { align: "right" }));
    expect(right.lines[0].x + right.lines[0].width).toBeCloseTo(520, 5);
    const center = layoutText(base("ANA"));
    expect(center.lines[0].x * 2 + center.lines[0].width).toBeCloseTo(520, 5);
  });

  it("aplica transformação de caixa e acentos", () => {
    const r = layoutText(base("joão ação", { textTransform: "uppercase" }));
    expect(r.lines[0].text).toBe("JOÃO AÇÃO");
  });
});
