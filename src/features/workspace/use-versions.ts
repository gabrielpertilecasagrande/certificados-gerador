"use client";

import { useEffect } from "react";
import { getRepository } from "@/lib/persistence/indexeddb";
import { saveVersion, snapshotKey, snapshotOf } from "@/lib/persistence/versions";
import { useWorkspace } from "./store";

const AUTO_INTERVAL = 10 * 60 * 1000;
const CHECK_EVERY = 60 * 1000;

/** Versões automáticas do layout: ao abrir o projeto e a cada 10 minutos com alterações. */
export function useAutoVersions(projectId: string | undefined) {
  useEffect(() => {
    if (!projectId) return;
    let lastKey = "";
    let lastAt = Date.now();
    let busy = false;

    const snapshot = async (label: string) => {
      const project = useWorkspace.getState().project;
      if (!project || project.id !== projectId || busy) return;
      busy = true;
      try {
        await saveVersion(getRepository(), project, label, true);
        lastKey = snapshotKey(snapshotOf(project));
        lastAt = Date.now();
        window.dispatchEvent(new CustomEvent("cert:versions-changed"));
      } catch (e) {
        console.warn("Versão automática não salva", e);
      } finally {
        busy = false;
      }
    };

    const first = setTimeout(() => snapshot("Ao abrir o projeto"), 1500);
    const timer = setInterval(() => {
      const project = useWorkspace.getState().project;
      if (!project || Date.now() - lastAt < AUTO_INTERVAL) return;
      if (snapshotKey(snapshotOf(project)) !== lastKey) void snapshot("Automática");
    }, CHECK_EVERY);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [projectId]);
}
