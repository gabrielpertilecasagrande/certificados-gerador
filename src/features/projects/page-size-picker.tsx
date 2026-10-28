"use client";

import { PAGE_PRESETS, pageFromPreset } from "@/lib/model/defaults";
import type { PagePreset, PageSize } from "@/lib/model/types";
import { mmToPt, ptToMm } from "@/lib/utils/units";
import { Label, NumberField, Select } from "@/components/ui/input";

export function PageSizePicker({
  value,
  onChange,
  originalLabel,
}: {
  value: PageSize | "original";
  onChange: (v: PageSize | "original") => void;
  originalLabel?: string;
}) {
  const preset: PagePreset | "original" = value === "original" ? "original" : value.preset;
  return (
    <div className="space-y-2">
      <Label htmlFor="page-preset">Formato da página</Label>
      <Select
        id="page-preset"
        value={preset}
        onChange={(e) => {
          const v = e.target.value as PagePreset | "original";
          if (v === "original") onChange("original");
          else if (v === "custom") onChange({ ...(value === "original" ? pageFromPreset("A4-landscape") : value), preset: "custom" });
          else onChange(pageFromPreset(v));
        }}
      >
        {originalLabel && <option value="original">{originalLabel}</option>}
        {Object.entries(PAGE_PRESETS).map(([k, p]) => (
          <option key={k} value={k}>
            {p.label} — {p.widthMm} × {p.heightMm} mm
          </option>
        ))}
        <option value="custom">Personalizado</option>
      </Select>
      {value !== "original" && value.preset === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField value={ptToMm(value.widthPt)} suffix="mm" prefix="L" min={20} max={2000} onValueChange={(mm) => onChange({ ...value, widthPt: mmToPt(mm) })} />
          <NumberField value={ptToMm(value.heightPt)} suffix="mm" prefix="A" min={20} max={2000} onValueChange={(mm) => onChange({ ...value, heightPt: mmToPt(mm) })} />
        </div>
      )}
    </div>
  );
}
