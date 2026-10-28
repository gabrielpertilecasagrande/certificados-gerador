// Baixa as fontes (TTF estáticas, licença OFL/Apache) usadas pelo editor e pela exportação PDF.
// Uso: node scripts/fetch-fonts.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const FAMILIES = {
  Inter: "ital,wght@0,400;0,600;0,700;1,400;1,700",
  Montserrat: "ital,wght@0,400;0,600;0,700;1,400;1,700",
  "Open Sans": "ital,wght@0,400;0,600;0,700;1,400;1,700",
  Roboto: "ital,wght@0,400;0,700;1,400;1,700",
  Poppins: "ital,wght@0,400;0,600;0,700;1,400;1,700",
  Raleway: "ital,wght@0,400;0,700;1,400;1,700",
  Oswald: "wght@400;600;700",
  Lora: "ital,wght@0,400;0,700;1,400;1,700",
  "Playfair Display": "ital,wght@0,400;0,700;1,400;1,700",
  Merriweather: "ital,wght@0,400;0,700;1,400;1,700",
  "EB Garamond": "ital,wght@0,400;0,700;1,400;1,700",
  Cinzel: "wght@400;700",
  "Great Vibes": "wght@400",
  "Dancing Script": "wght@400;700",
  "Pinyon Script": "wght@400",
};

const out = path.resolve("public/fonts");
await mkdir(out, { recursive: true });
const manifest = [];
for (const [family, axes] of Object.entries(FAMILIES)) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:${axes}`;
  const css = await (await fetch(url, { headers: { "User-Agent": "Wget/1.12" } })).text();
  const re = /font-style:\s*(\w+);\s*font-weight:\s*(\d+);\s*src:\s*url\((https:[^)]+\.ttf)\)/g;
  let m;
  while ((m = re.exec(css))) {
    const [, style, weight, src] = m;
    const italic = style === "italic";
    const file = `${family.replace(/\s+/g, "")}-${weight}${italic ? "i" : ""}.ttf`;
    const buf = Buffer.from(await (await fetch(src)).arrayBuffer());
    await writeFile(path.join(out, file), buf);
    manifest.push({ family, weight: Number(weight), italic, file });
    console.log(file, buf.length);
  }
}
const json = JSON.stringify(manifest, null, 2);
await writeFile(path.resolve("src/lib/render/font-manifest.json"), json);
