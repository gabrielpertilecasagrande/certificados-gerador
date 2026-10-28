"use client";

import { FolderX } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { EditorView } from "@/features/editor/editor-view";
import { ExportView } from "@/features/export/export-view";
import { ParticipantsView } from "@/features/participants/participants-view";
import { PreviewView } from "@/features/preview/preview-view";
import { getRepository } from "@/lib/persistence/indexeddb";
import { useWorkspace } from "./store";
import { TopBar } from "./top-bar";
import { useAutosave } from "./use-autosave";
import { useShortcuts } from "./use-shortcuts";

export function Workspace() {
  const { id } = useParams<{ id: string }>();
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const loadedId = useWorkspace((s) => s.project?.id);
  const tab = useWorkspace((s) => s.tab);

  useAutosave();
  useShortcuts();

  useEffect(() => {
    let alive = true;
    getRepository()
      .getProject(id)
      .then((p) => {
        if (!alive) return;
        if (!p) return setStatus("missing");
        useWorkspace.getState().load(p);
        setStatus("ready");
      })
      .catch(() => alive && setStatus("missing"));
    return () => {
      alive = false;
    };
  }, [id]);

  if (status === "missing") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <FolderX className="size-10 text-muted" />
        <p className="text-base font-semibold">Projeto não encontrado neste navegador</p>
        <p className="max-w-sm text-sm text-muted">Os projetos ficam salvos localmente. Se ele foi criado em outro computador, use o backup (.certproj).</p>
        <Button asChild variant="primary">
          <Link href="/">Voltar aos projetos</Link>
        </Button>
      </div>
    );
  }
  if (status === "loading" || loadedId !== id) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar />
      {tab === "editor" && <EditorView />}
      {tab === "participants" && <ParticipantsView />}
      {tab === "preview" && <PreviewView />}
      {tab === "export" && <ExportView />}
    </div>
  );
}
