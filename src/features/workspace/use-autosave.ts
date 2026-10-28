"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getRepository } from "@/lib/persistence/indexeddb";
import { updateThumbnail } from "@/lib/runtime/thumbnail";
import { useWorkspace } from "./store";

const SAVE_DELAY = 600;
const THUMB_DELAY = 4000;

/** Salvamento automático no IndexedDB com indicador de estado e proteção ao fechar a página. */
export function useAutosave() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const save = async () => {
      const { project } = useWorkspace.getState();
      if (!project) return;
      useWorkspace.setState({ saveState: "saving" });
      try {
        await getRepository().saveProject(project);
        // Só marca como salvo se nada mudou durante a gravação.
        if (useWorkspace.getState().project === project) useWorkspace.setState({ saveState: "saved" });
      } catch (e) {
        console.error(e);
        useWorkspace.setState({ saveState: "error" });
        toast.error("Falha ao salvar no navegador. Verifique o espaço disponível.");
      }
    };

    const scheduleThumb = () => {
      if (thumbTimer.current) clearTimeout(thumbTimer.current);
      thumbTimer.current = setTimeout(async () => {
        const { project } = useWorkspace.getState();
        if (!project) return;
        try {
          const id = await updateThumbnail(project);
          if (id && useWorkspace.getState().project?.thumbnailAssetId !== id) {
            // Fora do histórico de desfazer: a miniatura não é uma edição do usuário.
            const temporal = useWorkspace.temporal.getState();
            temporal.pause();
            useWorkspace.setState((s) => (s.project ? { project: { ...s.project, thumbnailAssetId: id }, saveState: "dirty" } : s));
            temporal.resume();
          }
        } catch (e) {
          console.warn("Miniatura não gerada", e);
        }
      }, THUMB_DELAY);
    };

    const unsub = useWorkspace.subscribe((state, prev) => {
      if (!state.project || state.project === prev.project || !prev.project || state.project.id !== prev.project.id) return;
      if (state.saveState !== "dirty" && state.saveState !== "saving") useWorkspace.setState({ saveState: "dirty" });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(save, SAVE_DELAY);
      if (state.project.thumbnailAssetId === prev.project.thumbnailAssetId) scheduleThumb();
    });

    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void save();
      }
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      const s = useWorkspace.getState().saveState;
      if (s === "dirty" || s === "saving") {
        flush();
        e.preventDefault();
      }
    };
    const onHide = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      unsub();
      flush();
      if (thumbTimer.current) clearTimeout(thumbTimer.current);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);
}
