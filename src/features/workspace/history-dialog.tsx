"use client";

import { History, Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge, Spinner, Tip } from "@/components/ui/misc";
import { usePrompt } from "@/components/ui/prompt";
import type { ProjectVersion } from "@/lib/model/types";
import { getRepository } from "@/lib/persistence/indexeddb";
import { restoreVersion, saveVersion } from "@/lib/persistence/versions";
import { renderThumbnail } from "@/lib/runtime/thumbnail";
import { relativeTime } from "@/lib/utils/format";
import { undo, useWorkspace } from "./store";

export function HistoryButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tip label="Histórico de versões">
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Histórico de versões">
          <History />
        </Button>
      </Tip>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && <HistoryContent onClose={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function Thumb({ version }: { version: ProjectVersion }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let u: string | null = null;
    const project = useWorkspace.getState().project;
    if (!project) return;
    renderThumbnail(restoreVersion(project, version.data))
      .then((blob) => {
        if (!blob || !alive) return;
        u = URL.createObjectURL(blob);
        setUrl(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [version]);
  return (
    <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-canvas">
      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura local */}
      {url ? <img src={url} alt="" className="h-full w-full object-contain" /> : <Spinner className="size-3 text-muted" />}
    </div>
  );
}

function HistoryContent({ onClose }: { onClose: () => void }) {
  const project = useWorkspace((s) => s.project)!;
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [versions, setVersions] = useState<ProjectVersion[] | null>(null);
  const [label, setLabel] = useState("");

  const refresh = useCallback(async () => setVersions(await getRepository().listVersions(project.id)), [project.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga do IndexedDB
    refresh();
    window.addEventListener("cert:versions-changed", refresh);
    return () => window.removeEventListener("cert:versions-changed", refresh);
  }, [refresh]);

  const saveNow = async () => {
    await saveVersion(getRepository(), project, label.trim() || "Versão salva", false);
    setLabel("");
    toast.success("Versão salva");
    refresh();
  };

  const restore = async (v: ProjectVersion) => {
    const ok = await confirm({
      title: `Restaurar “${v.label}”?`,
      description: "Os modelos, campos, dados fixos e fontes voltam a essa versão. Os participantes são mantidos. A situação atual é salva no histórico antes.",
      confirmLabel: "Restaurar",
    });
    if (!ok) return;
    const current = useWorkspace.getState().project!;
    await saveVersion(getRepository(), current, `Antes de restaurar “${v.label}”`, false);
    useWorkspace.getState().restoreLayout(v.data);
    toast.success("Versão restaurada", { action: { label: "Desfazer", onClick: undo } });
    onClose();
  };

  return (
    <DialogContent wide title="Histórico de versões" description="Versões do layout (modelos, campos, dados fixos e fontes). Os participantes não fazem parte das versões.">
      <DialogBody className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveNow();
          }}
        >
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome da versão (ex.: aprovada pela coordenação)" aria-label="Nome da versão" />
          <Button type="submit" variant="primary" data-testid="save-version">
            <Save /> Salvar versão
          </Button>
        </form>
        {versions === null ? (
          <div className="flex justify-center py-8 text-muted">
            <Spinner className="size-5" />
          </div>
        ) : versions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Nenhuma versão ainda. Versões automáticas são criadas ao abrir o projeto e a cada 10 minutos de edição.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border" data-testid="version-list">
            {versions.map((v) => {
              const elements = v.data.templates.reduce((n, t) => n + t.elements.length, 0);
              return (
                <li key={v.id} className="flex items-center gap-3 p-2.5">
                  <Thumb version={v} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {v.label} {v.auto ? <Badge>automática</Badge> : <Badge tone="primary">manual</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      {relativeTime(v.createdAt)} · {new Date(v.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {v.data.templates.length} modelo(s), {elements} elemento(s)
                    </p>
                  </div>
                  <Button size="sm" onClick={() => restore(v)} data-testid="restore-version">
                    <RotateCcw /> Restaurar
                  </Button>
                  <Tip label="Renomear">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Renomear versão"
                      onClick={async () => {
                        const name = await prompt({ title: "Renomear versão", defaultValue: v.label });
                        if (!name) return;
                        await getRepository().saveVersion({ ...v, label: name, auto: false });
                        refresh();
                      }}
                    >
                      <Pencil />
                    </Button>
                  </Tip>
                  <Tip label="Excluir">
                    <Button
                      size="icon-sm"
                      variant="danger-ghost"
                      aria-label="Excluir versão"
                      onClick={async () => {
                        await getRepository().deleteVersion(v.id);
                        refresh();
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </Tip>
                </li>
              );
            })}
          </ul>
        )}
      </DialogBody>
    </DialogContent>
  );
}
