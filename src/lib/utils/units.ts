export const PT_PER_MM = 72 / 25.4;

export const mmToPt = (mm: number) => mm * PT_PER_MM;
export const ptToMm = (pt: number) => pt / PT_PER_MM;

/** Arredonda para `digits` casas decimais (padrão 1), útil em campos numéricos. */
export const round = (value: number, digits = 1) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
