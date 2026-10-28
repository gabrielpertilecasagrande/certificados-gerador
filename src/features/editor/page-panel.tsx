"use client";

import { Eye, EyeOff, FileText, ImagePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { NumberField, Select } from "@/components/ui/input";
import { Segmented, Switch } from "@/components/ui/misc";
import { ArtworkDropzone, type PickedArtwork } from "@/features/projects/artwork-dropzone";
import { PageSizePicker } from "@/features/projects/page-size-picker";
import { useWorkspace } from "@/features/workspace/store";
import type { PageSize, Template } from "@/lib/model/types";
import { getRepository } from "@/lib/persistence/indexeddb";
import { backgroundFromArtwork, pageForArtwork, storeAsset } from "@/lib/persistence/project-ops";
import { mmToPt, ptToMm, round } from "@/lib/utils/units";
import { Row, Section } from "./panel-ui";
import { useView } from "./view-store";

export function PagePanel({ template }: { template: Template }) {
  const setPage = useWorkspace((s) => s.setPage);
  const updateTemplate = useWorkspace((s) => s.updateTemplate);
  const setBackground = useWorkspace((s) => s.setBackground);
  const view = useView();
  const confirm = useConfirm();
  const [replacing, setReplacing] = useState(false);
  const bg = template.background;

  return (
    <div className="pb-6">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Página</p>
        <p className="text-xs text-muted">Selecione um elemento no certificado para editar suas propriedades.</p>
      </div>
      <Section title="Formato">
        <PageSizePicker value={template.page} onChange={(p) => p !== "original" && setPage(p as PageSize)} />
        <p className="text-xs text-muted">
          {round(ptToMm(template.page.widthPt))} × {round(ptToMm(template.page.heightPt))} mm
        </p>
        <Row label="Margens">
          <NumberField suffix="mm" min={0} max={100} value={round(ptToMm(template.marginPt))} onValueChange={(v) => updateTemplate((t) => void (t.marginPt = mmToPt(v)))} aria-label="Margens" />
        </Row>
      </Section>

      <Section title="Arte de fundo">
        {bg ? (
          <>
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2/50 p-2 text-xs">
              <FileText className="size-4 text-primary" />
              <span className="flex-1">{bg.kind === "pdf" ? `PDF · página ${bg.pdfPage} (vetorial)` : "Imagem"}</span>
              <span className="text-muted">Bloqueada</span>
            </div>
            <Row label="Enquadrar">
              <Segmented
                value={bg.fit}
                onChange={(fit) => updateTemplate((t) => void (t.background!.fit = fit))}
                options={[
                  { value: "stretch", label: "Página", title: "Ocupar a página inteira" },
                  { value: "contain", label: "Conter", title: "Caber inteira, mantendo proporção" },
                  { value: "cover", label: "Cobrir", title: "Cobrir a página, mantendo proporção" },
                ]}
                className="w-full"
              />
            </Row>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setReplacing(true)}>
                <ImagePlus /> Substituir
              </Button>
              <Button size="sm" onClick={() => updateTemplate((t) => void (t.background!.visible = !t.background!.visible))}>
                {bg.visible ? <EyeOff /> : <Eye />} {bg.visible ? "Não exportar" : "Exportar fundo"}
              </Button>
              <Button
                size="sm"
                variant="danger-ghost"
                onClick={async () => {
                  if (await confirm({ title: "Remover a arte de fundo?", confirmLabel: "Remover", danger: true })) setBackground(null);
                }}
              >
                <Trash2 /> Remover
              </Button>
            </div>
            {!bg.visible && <p className="text-xs text-warning">O fundo está oculto e não sairá nos arquivos exportados.</p>}
          </>
        ) : (
          <ArtworkDropzone compact onPicked={(art) => applyArtwork(art)} />
        )}
      </Section>

      <Section title="Visualização">
        <label className="flex items-center justify-between text-[13px]">
          Exibir arte de fundo <Switch checked={view.showBackground} onCheckedChange={(v) => view.set({ showBackground: v })} />
        </label>
        <label className="flex items-center justify-between text-[13px]">
          Exibir margens <Switch checked={view.showMargins} onCheckedChange={(v) => view.set({ showMargins: v })} />
        </label>
        <label className="flex items-center justify-between text-[13px]">
          Guias de centro <Switch checked={view.showGuides} onCheckedChange={(v) => view.set({ showGuides: v })} />
        </label>
        <label className="flex items-center justify-between text-[13px]">
          Encaixe magnético <Switch checked={view.snap} onCheckedChange={(v) => view.set({ snap: v })} />
        </label>
      </Section>

      <ReplaceBackgroundDialog open={replacing} onOpenChange={setReplacing} onPicked={(art, page, keepPage) => applyArtwork(art, page, keepPage)} />
    </div>
  );

  async function applyArtwork(art: PickedArtwork, pdfPage = 1, keepPage = false) {
    const project = useWorkspace.getState().project;
    if (!project) return;
    try {
      const assetId = await storeAsset(getRepository(), project.id, art.blob, art.name, art.mime);
      useWorkspace.getState().updateTemplate((t) => {
        t.background = backgroundFromArtwork(assetId, art, pdfPage);
        if (!keepPage && art.kind === "pdf") t.page = pageForArtwork(art, pdfPage, "original");
      });
      toast.success("Arte aplicada como fundo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aplicar a arte");
    }
  }
}

function ReplaceBackgroundDialog({
  open,
  onOpenChange,
  onPicked,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPicked: (art: PickedArtwork, page: number, keepPage: boolean) => void;
}) {
  const [art, setArt] = useState<PickedArtwork | null>(null);
  const [page, setPage] = useState(1);
  const [keepPage, setKeepPage] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setArt(null);
      }}
    >
      <DialogContent title="Substituir arte de fundo" description="Os campos e participantes são mantidos.">
        <DialogBody className="space-y-3">
          {!art ? (
            <ArtworkDropzone onPicked={(a) => setArt(a)} />
          ) : (
            <>
              <p className="text-sm">{art.name}</p>
              {art.kind === "pdf" && art.pages.length > 1 && (
                <Select value={page} onChange={(e) => setPage(Number(e.target.value))} aria-label="Página do PDF">
                  {art.pages.map((_, i) => (
                    <option key={i} value={i + 1}>
                      Página {i + 1}
                    </option>
                  ))}
                </Select>
              )}
              {art.kind === "pdf" && (
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={keepPage} onChange={(e) => setKeepPage(e.target.checked)} />
                  Manter o tamanho de página atual (não usar o tamanho do PDF)
                </label>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!art}
            onClick={() => {
              if (art) onPicked(art, page, keepPage);
              onOpenChange(false);
              setArt(null);
            }}
          >
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
