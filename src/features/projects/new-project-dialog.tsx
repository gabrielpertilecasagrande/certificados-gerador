"use client";

import { FileText, Image as ImageIcon, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { pageFromPreset } from "@/lib/model/defaults";
import type { PageSize } from "@/lib/model/types";
import { getRepository } from "@/lib/persistence/indexeddb";
import { createNewProject } from "@/lib/persistence/project-ops";
import { ptToMm } from "@/lib/utils/units";
import { ArtworkDropzone, type PickedArtwork } from "./artwork-dropzone";
import { PageSizePicker } from "./page-size-picker";

export function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [art, setArt] = useState<PickedArtwork | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [page, setPage] = useState<PageSize | "original">(pageFromPreset("A4-landscape"));
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setArt(null);
    setPdfPage(1);
    setPage(pageFromPreset("A4-landscape"));
  };

  async function create() {
    setBusy(true);
    try {
      const project = await createNewProject(getRepository(), {
        name,
        artwork: art ?? undefined,
        pdfPage,
        page,
      });
      onOpenChange(false);
      reset();
      router.push(`/projects/${project.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o projeto");
    } finally {
      setBusy(false);
    }
  }

  const size = art?.pages[pdfPage - 1];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent title="Novo projeto" description="Dê um nome e importe a arte do certificado. Todo o resto é opcional.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="project-name">Nome do projeto</Label>
              <Input id="project-name" autoFocus placeholder="Ex.: Congresso Regional 2026" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Arte de fundo</Label>
              {art ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/60 p-3">
                  <div className="flex size-9 items-center justify-center rounded-md bg-primary-soft text-primary">
                    {art.kind === "pdf" ? <FileText className="size-4" /> : <ImageIcon className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{art.name}</p>
                    <p className="text-xs text-muted">
                      {art.kind === "pdf" ? `PDF · ${art.pages.length} página(s)` : `Imagem · ${art.pixelWidth}×${art.pixelHeight}px`}
                      {size && ` · ${Math.round(ptToMm(size.widthPt))}×${Math.round(ptToMm(size.heightPt))} mm`}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setArt(null)} aria-label="Remover arte">
                    <X />
                  </Button>
                </div>
              ) : (
                <ArtworkDropzone
                  onPicked={(a) => {
                    setArt(a);
                    setPdfPage(1);
                    setPage("original");
                    if (!name) setName(a.name.replace(/\.[^.]+$/, ""));
                  }}
                />
              )}
              {!art && <p className="text-xs text-muted">Sem arte, o projeto começa com uma página em branco.</p>}
            </div>

            {art?.kind === "pdf" && art.pages.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="pdf-page">Página do PDF usada como fundo</Label>
                <Select id="pdf-page" value={pdfPage} onChange={(e) => setPdfPage(Number(e.target.value))}>
                  {art.pages.map((p, i) => (
                    <option key={i} value={i + 1}>
                      Página {i + 1} — {Math.round(ptToMm(p.widthPt))}×{Math.round(ptToMm(p.heightPt))} mm
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <PageSizePicker value={page} onChange={setPage} originalLabel={art ? "Tamanho original da arte (recomendado)" : undefined} />
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy && <Spinner />}
              Criar projeto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
