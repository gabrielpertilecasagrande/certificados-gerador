"use client";

import { Check, ChevronsUpDown, Copy, FilePlus2, LayoutTemplate, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Spinner } from "@/components/ui/misc";
import { usePrompt } from "@/components/ui/prompt";
import { ArtworkDropzone, type PickedArtwork } from "@/features/projects/artwork-dropzone";
import { PageSizePicker } from "@/features/projects/page-size-picker";
import { useActiveTemplate, useWorkspace } from "@/features/workspace/store";
import { createTemplate } from "@/lib/model/defaults";
import type { ID, PageSize } from "@/lib/model/types";
import { getRepository } from "@/lib/persistence/indexeddb";
import { backgroundFromArtwork, pageForArtwork, storeAsset } from "@/lib/persistence/project-ops";

/** Troca o modelo ativo e mantém um participante desse modelo na pré-visualização do editor. */
export function selectTemplate(id: ID) {
  const s = useWorkspace.getState();
  const current = s.project?.participants.find((p) => p.id === s.activeParticipantId);
  const first = s.project?.participants.find((p) => p.templateId === id);
  s.setUi({
    activeTemplateId: id,
    selectedIds: [],
    individualMode: false,
    activeParticipantId: current?.templateId === id ? current.id : (first?.id ?? s.activeParticipantId),
  });
}

export function TemplateSwitcher() {
  const project = useWorkspace((s) => s.project)!;
  const active = useActiveTemplate()!;
  const individualMode = useWorkspace((s) => s.individualMode);
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [creating, setCreating] = useState(false);
  const counts = new Map<ID, number>();
  for (const p of project.participants) counts.set(p.templateId, (counts.get(p.templateId) ?? 0) + 1);

  return (
    <div className="border-b border-border p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-left shadow-soft hover:border-border-strong disabled:opacity-60"
            disabled={individualMode}
            data-testid="template-switcher"
          >
            <LayoutTemplate className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] leading-tight text-muted">Modelo{project.templates.length > 1 ? ` (${project.templates.length})` : ""}</span>
              <span className="block truncate text-[13px] font-semibold leading-tight">{active.name}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Modelos do projeto</DropdownMenuLabel>
          {project.templates.map((t) => (
            <DropdownMenuItem key={t.id} onSelect={() => selectTemplate(t.id)}>
              <Check className={t.id === active.id ? "opacity-100" : "opacity-0"} />
              <span className="flex-1 truncate">{t.name}</span>
              <span className="text-[11px] tabular-nums text-muted">{(counts.get(t.id) ?? 0).toLocaleString("pt-BR")}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <FilePlus2 /> Novo modelo…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              useWorkspace.getState().duplicateTemplate(active.id);
              toast.success("Modelo duplicado");
            }}
          >
            <Copy /> Duplicar este modelo
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              const name = await prompt({ title: "Renomear modelo", defaultValue: active.name });
              if (name) useWorkspace.getState().renameTemplate(active.id, name);
            }}
          >
            <Pencil /> Renomear…
          </DropdownMenuItem>
          <DropdownMenuItem
            danger
            disabled={project.templates.length <= 1}
            onSelect={async () => {
              const n = counts.get(active.id) ?? 0;
              const ok = await confirm({
                title: `Excluir o modelo “${active.name}”?`,
                description: n ? `${n} participante(s) passarão a usar o modelo “${project.templates.find((t) => t.id !== active.id)!.name}”.` : "Você pode desfazer com Ctrl+Z.",
                confirmLabel: "Excluir modelo",
                danger: true,
              });
              if (ok) useWorkspace.getState().deleteTemplate(active.id);
            }}
          >
            <Trash2 /> Excluir modelo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewTemplateDialog open={creating} onOpenChange={setCreating} defaultPage={active.page} />
    </div>
  );
}

function NewTemplateDialog({ open, onOpenChange, defaultPage }: { open: boolean; onOpenChange: (o: boolean) => void; defaultPage: PageSize }) {
  const [name, setName] = useState("");
  const [art, setArt] = useState<PickedArtwork | null>(null);
  const [page, setPage] = useState<PageSize | "original">(defaultPage);
  const [busy, setBusy] = useState(false);
  const reset = () => {
    setName("");
    setArt(null);
    setPage(defaultPage);
  };

  async function create() {
    const project = useWorkspace.getState().project;
    if (!project) return;
    setBusy(true);
    try {
      const t = createTemplate(name.trim() || `Modelo ${project.templates.length + 1}`, page === "original" ? defaultPage : page);
      if (art) {
        const assetId = await storeAsset(getRepository(), project.id, art.blob, art.name, art.mime);
        t.background = backgroundFromArtwork(assetId, art, 1);
        if (page === "original") t.page = pageForArtwork(art, 1, "original");
      }
      useWorkspace.getState().addTemplate(t);
      selectTemplate(t.id);
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o modelo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent title="Novo modelo" description="Ex.: certificado de palestrante ou de organizador, com arte e campos próprios.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="template-name">Nome do modelo</Label>
              <Input id="template-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Palestrante" />
            </div>
            <div className="space-y-1.5">
              <Label>Arte de fundo (opcional)</Label>
              {art ? (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 p-2.5 text-sm">
                  <span className="flex-1 truncate">{art.name}</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => setArt(null)} aria-label="Remover arte">
                    <X />
                  </Button>
                </div>
              ) : (
                <ArtworkDropzone
                  compact
                  onPicked={(a) => {
                    setArt(a);
                    setPage("original");
                  }}
                />
              )}
            </div>
            <PageSizePicker value={page} onChange={setPage} originalLabel={art ? "Tamanho original da arte (recomendado)" : undefined} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={busy} data-testid="create-template">
              {busy && <Spinner />} Criar modelo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
