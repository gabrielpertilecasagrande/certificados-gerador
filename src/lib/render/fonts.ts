import * as fontkitNs from "@pdf-lib/fontkit";
import manifest from "./font-manifest.json";

export interface FontVariant {
  family: string;
  weight: number;
  italic: boolean;
  file: string;
}

export const FONT_VARIANTS: FontVariant[] = manifest as FontVariant[];
export const FONT_FAMILIES: string[] = [...new Set(FONT_VARIANTS.map((v) => v.family))];
export const DEFAULT_FAMILY = "Montserrat";

export const FONT_CATEGORIES: Record<string, "sans" | "serif" | "script" | "display"> = {
  Inter: "sans",
  Montserrat: "sans",
  "Open Sans": "sans",
  Roboto: "sans",
  Poppins: "sans",
  Raleway: "sans",
  Oswald: "display",
  Lora: "serif",
  "Playfair Display": "serif",
  Merriweather: "serif",
  "EB Garamond": "serif",
  Cinzel: "display",
  "Great Vibes": "script",
  "Dancing Script": "script",
  "Pinyon Script": "script",
};

export function weightsFor(family: string): number[] {
  return [...new Set(FONT_VARIANTS.filter((v) => v.family === family).map((v) => v.weight))].sort((a, b) => a - b);
}

export function hasItalic(family: string): boolean {
  return FONT_VARIANTS.some((v) => v.family === family && v.italic);
}

/** Escolhe o arquivo de fonte mais próximo do estilo pedido. */
export function resolveFontVariant(family: string, weight: number, italic: boolean): FontVariant {
  let candidates = FONT_VARIANTS.filter((v) => v.family === family);
  if (candidates.length === 0) candidates = FONT_VARIANTS.filter((v) => v.family === DEFAULT_FAMILY);
  const sameStyle = candidates.filter((v) => v.italic === italic);
  const pool = sameStyle.length ? sameStyle : candidates;
  return pool.reduce((best, v) => (Math.abs(v.weight - weight) < Math.abs(best.weight - weight) ? v : best));
}

/** Nome CSS único por arquivo, usado para registrar a fonte no navegador via FontFace. */
export const cssFontName = (file: string) => `cert-${file.replace(/\.ttf$/, "")}`;

export type FontkitFont = fontkitNs.Font;

// O pacote publica apenas `export default` no build ESM, mas os tipos declaram exports nomeados.
export const fontkit: typeof fontkitNs =
  (fontkitNs as unknown as { default?: typeof fontkitNs }).default ?? fontkitNs;

/** Cache de fontes analisadas (fontkit) + bytes originais (para embutir no PDF). */
export class FontStore {
  private fonts = new Map<string, FontkitFont>();
  private bytes = new Map<string, Uint8Array>();
  private pending = new Map<string, Promise<void>>();

  constructor(private readonly loader: (file: string) => Promise<Uint8Array>) {}

  has(file: string) {
    return this.fonts.has(file);
  }

  get(file: string): FontkitFont {
    const f = this.fonts.get(file);
    if (!f) throw new Error(`Fonte não carregada: ${file}`);
    return f;
  }

  getBytes(file: string): Uint8Array {
    const b = this.bytes.get(file);
    if (!b) throw new Error(`Fonte não carregada: ${file}`);
    return b;
  }

  add(file: string, data: Uint8Array) {
    this.bytes.set(file, data);
    this.fonts.set(file, fontkit.create(data));
  }

  async load(files: Iterable<string>): Promise<void> {
    await Promise.all(
      [...new Set(files)].map((file) => {
        if (this.fonts.has(file)) return Promise.resolve();
        let p = this.pending.get(file);
        if (!p) {
          p = this.loader(file).then((data) => this.add(file, data));
          p.catch(() => this.pending.delete(file));
          this.pending.set(file, p);
        }
        return p;
      }),
    );
  }
}
