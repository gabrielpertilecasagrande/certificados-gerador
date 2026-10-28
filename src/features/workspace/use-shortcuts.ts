"use client";

import { useEffect } from "react";
import { applyOverride } from "@/lib/render/resolve";
import { redo, undo, useWorkspace } from "./store";

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el?.closest("input, textarea, select, [contenteditable=true]");
};

/** Atalhos globais do editor. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const s = useWorkspace.getState();
      const key = e.key.toLowerCase();

      if (mod && key === "z" && !isTyping(e.target)) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === "y" && !isTyping(e.target)) {
        e.preventDefault();
        redo();
        return;
      }
      if (s.tab !== "editor" || isTyping(e.target)) return;

      const template = s.project?.templates.find((t) => t.id === s.activeTemplateId) ?? s.project?.templates[0];
      const participant = s.individualMode ? s.project?.participants.find((p) => p.id === s.activeParticipantId) : undefined;
      // Em modo individual, o deslocamento parte da posição já ajustada do participante.
      const selected = (template?.elements.filter((el) => s.selectedIds.includes(el.id)) ?? []).map((el) =>
        participant ? applyOverride(el, participant.overrides[el.id]) : el,
      );

      if (mod && key === "a") {
        e.preventDefault();
        s.setUi({ selectedIds: template?.elements.filter((el) => !el.locked && !el.hidden).map((el) => el.id) ?? [] });
      } else if (mod && key === "c") {
        s.copySelection();
      } else if (mod && key === "v") {
        if (!s.individualMode) s.paste();
      } else if (mod && key === "d") {
        e.preventDefault();
        if (!s.individualMode && selected.length) s.duplicateElements(selected.map((el) => el.id));
      } else if (mod && key === "g") {
        e.preventDefault();
        if (e.shiftKey) s.ungroupSelection();
        else s.groupSelection();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected.length && !s.individualMode) {
        e.preventDefault();
        s.deleteElements(selected.filter((el) => !el.locked).map((el) => el.id));
      } else if (e.key === "Escape") {
        s.setUi({ selectedIds: [] });
      } else if (e.key.startsWith("Arrow") && selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        s.editElements(selected.filter((el) => !el.locked).map((el) => ({ id: el.id, patch: { x: el.x + dx, y: el.y + dy } })));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
