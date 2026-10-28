"use client";

import { useEffect, useRef, useState } from "react";
import type { ResolvedCertificate } from "@/lib/render/resolve";
import { drawCertificate, type Drawable } from "@/lib/render/canvas";
import { getBackgroundDrawable, getImageBitmap } from "@/lib/runtime/assets";
import { cn } from "@/lib/utils/cn";

/** Renderiza um certificado resolvido num <canvas> com a largura dada (px CSS). */
export function CertificateCanvas({ cert, width, className }: { cert: ResolvedCertificate | null; width: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const page = cert?.template.page;
  const height = page ? Math.round((width * page.heightPt) / page.widthPt) : Math.round(width / 1.414);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !cert || width <= 0) return;
    let alive = true;
    (async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pxW = Math.round(width * dpr);
      const bg = cert.template.background;
      const background = bg ? await getBackgroundDrawable(bg, pxW).catch(() => null) : null;
      const images = new Map<string, Drawable>();
      for (const it of cert.items) {
        if (it.el.type === "image" && !images.has(it.el.assetId)) {
          const bmp = await getImageBitmap(it.el.assetId).catch(() => null);
          if (bmp) images.set(it.el.assetId, bmp);
        }
      }
      if (!alive) return;
      canvas.width = pxW;
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d")!;
      drawCertificate(ctx, cert, pxW / cert.template.page.widthPt, { background, images });
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [cert, width, height]);

  return (
    <div className={cn("relative overflow-hidden bg-white", className)} style={{ width, height }}>
      <canvas ref={ref} style={{ width, height }} className={cn("block transition-opacity duration-150", ready ? "opacity-100" : "opacity-0")} />
    </div>
  );
}
