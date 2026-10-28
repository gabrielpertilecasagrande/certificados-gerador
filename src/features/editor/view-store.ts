"use client";

import { create } from "zustand";

interface ViewState {
  zoom: number;
  /** Incrementado para pedir "ajustar à tela". */
  fitNonce: number;
  showMargins: boolean;
  showGuides: boolean;
  snap: boolean;
  showBackground: boolean;
  showRulers: boolean;
  guidesLocked: boolean;
  set(patch: Partial<Omit<ViewState, "set" | "requestFit" | "zoomBy">>): void;
  requestFit(): void;
  zoomBy(factor: number): void;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

export const useView = create<ViewState>()((set) => ({
  zoom: 1,
  fitNonce: 0,
  showMargins: false,
  showGuides: true,
  snap: true,
  showBackground: true,
  showRulers: true,
  guidesLocked: false,
  set: (patch) => set(patch),
  requestFit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),
  zoomBy: (factor) => set((s) => ({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom * factor)) })),
}));
