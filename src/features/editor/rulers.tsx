"use client";

import { useEffect, useRef } from "react";
import { PT_PER_MM } from "@/lib/utils/units";

export const RULER = 20;

const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500];

/** Escolhe o passo (mm) dos traços menores e dos rótulos conforme o zoom. */
export function rulerSteps(pxPerMm: number): { minor: number; major: number } {
  const minor = STEPS.find((s) => s * pxPerMm >= 5) ?? 500;
  const major = STEPS.find((s) => s >= minor * 5 && s * pxPerMm >= 45) ?? 500;
  return { minor, major };
}

interface RulerProps {
  orientation: "h" | "v";
  /** Comprimento da régua em px CSS. */
  length: number;
  /** Posição (px) da origem da página ao longo do eixo da régua. */
  origin: number;
  zoom: number;
  /** Faixa da seleção (pt) para destacar. */
  highlight?: { from: number; to: number } | null;
  onStartGuide: (e: React.PointerEvent) => void;
}

/** Régua em milímetros desenhada num <canvas>; arrastar a partir dela cria uma guia. */
export function Ruler({ orientation, length, origin, zoom, highlight, onStartGuide }: RulerProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const horizontal = orientation === "h";

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || length <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = horizontal ? length : RULER;
    const h = horizontal ? RULER : length;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#f8f9fb";
    ctx.fillRect(0, 0, w, h);
    const pxPerMm = zoom * PT_PER_MM;
    if (highlight) {
      const a = origin + highlight.from * zoom;
      const b = origin + highlight.to * zoom;
      ctx.fillStyle = "rgba(37,99,235,0.14)";
      if (horizontal) ctx.fillRect(a, 0, b - a, h);
      else ctx.fillRect(0, a, w, b - a);
    }
    const { minor, major } = rulerSteps(pxPerMm);
    const firstMm = Math.floor(-origin / pxPerMm / minor) * minor;
    const lastMm = Math.ceil((length - origin) / pxPerMm);
    ctx.strokeStyle = "#a3aab5";
    ctx.fillStyle = "#6b7280";
    ctx.font = "9px Inter UI, sans-serif";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let mm = firstMm; mm <= lastMm; mm += minor) {
      const p = Math.round(origin + mm * pxPerMm) + 0.5;
      const isMajor = mm % major === 0;
      const isMid = !isMajor && mm % (major / 2) === 0;
      const len = isMajor ? RULER : isMid ? 8 : 5;
      if (horizontal) {
        ctx.moveTo(p, RULER);
        ctx.lineTo(p, RULER - len);
      } else {
        ctx.moveTo(RULER, p);
        ctx.lineTo(RULER - len, p);
      }
      if (isMajor) {
        if (horizontal) ctx.fillText(String(mm), p + 3, 9);
        else {
          ctx.save();
          ctx.translate(9, p + 3);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = "right";
          ctx.fillText(String(mm), 0, 0);
          ctx.restore();
        }
      }
    }
    ctx.stroke();
    ctx.strokeStyle = "#e4e7ec";
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(0, RULER - 0.5);
      ctx.lineTo(w, RULER - 0.5);
    } else {
      ctx.moveTo(RULER - 0.5, 0);
      ctx.lineTo(RULER - 0.5, h);
    }
    ctx.stroke();
  }, [horizontal, length, origin, zoom, highlight]);

  return (
    <canvas
      ref={ref}
      onPointerDown={onStartGuide}
      className={horizontal ? "absolute left-5 top-0 z-10 cursor-row-resize" : "absolute left-0 top-5 z-10 cursor-col-resize"}
      style={horizontal ? { width: length, height: RULER } : { width: RULER, height: length }}
      aria-label={horizontal ? "Régua horizontal (arraste para criar uma guia)" : "Régua vertical (arraste para criar uma guia)"}
      data-testid={horizontal ? "ruler-h" : "ruler-v"}
    />
  );
}
