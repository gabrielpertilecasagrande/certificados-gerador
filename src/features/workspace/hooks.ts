"use client";

import { useEffect, useMemo, useState } from "react";
import type { Participant, Project, Template } from "@/lib/model/types";
import { fontFileFor, fontFilesForTemplates, resolveCertificate, type ResolvedCertificate } from "@/lib/render/resolve";
import { browserFonts, ensureFonts } from "@/lib/runtime/fonts";
import { useWorkspace } from "./store";

/** Garante que todas as fontes usadas nos modelos estejam carregadas; retorna uma versão que muda ao carregar. */
export function useFontsVersion(): number {
  const templates = useWorkspace((s) => s.project?.templates);
  const key = useMemo(() => (templates ? fontFilesForTemplates(templates).sort().join("|") : ""), [templates]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!key) return;
    const files = key.split("|").filter(Boolean);
    if (files.every((f) => browserFonts.has(f))) return;
    let cancelled = false;
    ensureFonts(files)
      .then(() => !cancelled && setVersion((v) => v + 1))
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [key]);
  return version;
}

export function fontsReadyFor(template: Template | null): boolean {
  if (!template) return false;
  return template.elements.every((el) => el.type !== "text" || browserFonts.has(fontFileFor(el)));
}

export function useResolved(
  project: Project | null,
  participant: Participant | null,
  template: Template | null,
  fontsVersion: number,
): ResolvedCertificate | null {
  return useMemo(() => {
    void fontsVersion;
    if (!project || !template || !fontsReadyFor(template)) return null;
    return resolveCertificate(project, participant, browserFonts, { template, includeHidden: false });
  }, [project, participant, template, fontsVersion]);
}

export function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
