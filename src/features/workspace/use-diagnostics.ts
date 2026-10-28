"use client";

import { useEffect, useState } from "react";
import type { ID, Project } from "@/lib/model/types";
import { findNameColumn } from "@/lib/variables";
import { validateParticipants } from "@/lib/import/validate";
import { fontFilesForTemplates, resolveCertificate, type Issue } from "@/lib/render/resolve";
import { browserFonts, ensureFonts } from "@/lib/runtime/fonts";
import { useDebouncedValue } from "./hooks";
import { useWorkspace } from "./store";

export interface Diagnostics {
  /** Problemas por participante (apenas os que têm algum). */
  byParticipant: Map<ID, Issue[]>;
  duplicates: Set<ID>;
  errorCount: number;
  warningCount: number;
  templateIssues: Issue[];
  done: boolean;
  progress: number;
}

const EMPTY: Diagnostics = { byParticipant: new Map(), duplicates: new Set(), errorCount: 0, warningCount: 0, templateIssues: [], done: false, progress: 0 };
const cache = new WeakMap<Project, Diagnostics>();

async function compute(project: Project, onProgress: (d: Diagnostics) => void, isCancelled: () => boolean): Promise<Diagnostics | null> {
  await ensureFonts(fontFilesForTemplates(project.templates));
  const byParticipant = new Map<ID, Issue[]>();
  const nameCol = findNameColumn(project.columns);
  const v = validateParticipants(project.participants, project.columns, nameCol?.id);
  const duplicates = new Set(v.duplicates.flat());
  const templateIssues: Issue[] = [];
  for (const t of project.templates) {
    if (!t.background) templateIssues.push({ code: "no-background", severity: "warning", message: `"${t.name}" não tem arte de fundo` });
  }
  let errorCount = 0;
  let warningCount = 0;
  const total = project.participants.length;
  const CHUNK = 150;
  for (let i = 0; i < total; i += CHUNK) {
    if (isCancelled()) return null;
    for (const p of project.participants.slice(i, i + CHUNK)) {
      const issues = resolveCertificate(project, p, browserFonts).issues.filter((x) => x.code !== "no-background");
      if (duplicates.has(p.id)) issues.push({ code: "duplicate", severity: "warning", message: "Nome duplicado na lista" });
      if (issues.length) {
        byParticipant.set(p.id, issues);
        if (issues.some((x) => x.severity === "error")) errorCount++;
        else warningCount++;
      }
    }
    onProgress({ byParticipant, duplicates, errorCount, warningCount, templateIssues, done: false, progress: Math.min(1, (i + CHUNK) / Math.max(1, total)) });
    await new Promise((r) => setTimeout(r, 0));
  }
  return { byParticipant, duplicates, errorCount, warningCount, templateIssues, done: true, progress: 1 };
}

/** Diagnóstico de todos os certificados (campos vazios, nomes que não couberam, duplicidades…), em segundo plano. */
export function useDiagnostics(): Diagnostics {
  const live = useWorkspace((s) => s.project);
  const project = useDebouncedValue(live, 400);
  const [state, setState] = useState<{ project: Project | null; d: Diagnostics }>({ project: null, d: EMPTY });

  useEffect(() => {
    if (!project) return;
    const cached = cache.get(project);
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resultado em cache
      setState({ project, d: cached });
      return;
    }
    let cancelled = false;
    compute(
      project,
      (d) => !cancelled && setState({ project, d: { ...d } }),
      () => cancelled,
    ).then((d) => {
      if (!d || cancelled) return;
      cache.set(project, d);
      setState({ project, d });
    });
    return () => {
      cancelled = true;
    };
  }, [project]);

  return state.d;
}
