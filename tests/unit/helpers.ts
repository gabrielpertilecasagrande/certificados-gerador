import { readFile } from "node:fs/promises";
import path from "node:path";
import { FontStore } from "@/lib/render/fonts";

export const fontStore = () =>
  new FontStore(async (file) => new Uint8Array(await readFile(path.resolve("public/fonts", file))));
