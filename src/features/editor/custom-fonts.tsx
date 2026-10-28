"use client";

import { FileType2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { readFontInfo, type FontInfo } from "@/lib/import/font";
import { getRepository } from "@/lib/persistence/indexeddb";
import { storeAsset } from "@/lib/persistence/project-ops";
import { customFontFile } from "@/lib/render/fonts";
import { ensureFonts } from "@/lib/runtime/fonts";
import { newId } from "@/lib/utils/id";
import { useWorkspace } from "@/features/workspace/store";

const WEIGHT: Record<number, string> = { 100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "ExtraBold", 900: "Black" };

/** Pede o envio de uma fonte (TTF/OTF); o diálogo fica montado no editor. */
export const requestFontUpload = () => window.dispatchEvent(new CustomEvent("cert:add-font"));

export function FontUploadDialog() {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: File; bytes: Uint8Array; info: FontInfo } | null>(null);
  const [licensed, setLicensed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const open = () => input.current?.click();
    window.addEventListener("cert:add-font", open);
    return () => window.removeEventListener("cert:add-font", open);
  }, []);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const info = readFontInfo(bytes, useWorkspace.getState().project?.customFonts ?? []);
      setLicensed(false);
      setPending({ file, bytes, info });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fonte inválida");
    }
  }

  async function confirm() {
    const project = useWorkspace.getState().project;
    if (!pending || !project) return;
    setBusy(true);
    try {
      const mime = pending.file.name.toLowerCase().endsWith(".otf") ? "font/otf" : "font/ttf";
      const assetId = await storeAsset(getRepository(), project.id, new Blob([pending.bytes.slice().buffer as ArrayBuffer], { type: mime }), pending.file.name, mime);
      await ensureFonts([customFontFile(assetId)]);
      useWorkspace.getState().addCustomFont({ id: newId(), assetId, fileName: pending.file.name, family: pending.info.family, weight: pending.info.weight, italic: pending.info.italic });
      toast.success(`Fonte “${pending.info.family}” adicionada`);
      setPending(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível adicionar a fonte");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        accept=".ttf,.otf,font/ttf,font/otf"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
        data-testid="font-input"
      />
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        {pending && (
          <DialogContent title="Adicionar fonte ao projeto" description={pending.file.name}>
            <DialogBody className="space-y-3 text-[13px]">
              <div className="rounded-lg border border-border bg-surface-2/50 p-3">
                <p className="text-base font-semibold">{pending.info.family}</p>
                <p className="text-muted">
                  {WEIGHT[pending.info.weight] ?? pending.info.weight}
                  {pending.info.italic ? " Itálico" : ""}
                </p>
              </div>
              {pending.info.missingChars.length > 0 && (
                <p className="flex gap-1.5 text-warning">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  Esta fonte não tem os caracteres {pending.info.missingChars.join(" ")} — nomes com esses acentos não sairão corretamente.
                </p>
              )}
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" checked={licensed} onChange={(e) => setLicensed(e.target.checked)} data-testid="font-license" />
                Tenho licença para usar esta fonte e incorporá-la em documentos PDF.
              </label>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setPending(null)}>Cancelar</Button>
              <Button variant="primary" disabled={!licensed || busy} onClick={confirm} data-testid="font-confirm">
                Adicionar fonte
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

/** Lista das fontes enviadas (aba "Dados fixos" do painel esquerdo). */
export function CustomFontsSection() {
  const project = useWorkspace((s) => s.project)!;
  const confirm = useConfirm();
  const usage = (family: string) => project.templates.reduce((n, t) => n + t.elements.filter((e) => e.type === "text" && e.fontFamily === family).length, 0);
  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Fontes do projeto</p>
      {project.customFonts.length === 0 && <p className="px-1 text-xs text-muted">Envie arquivos TTF ou OTF para usar fontes próprias no certificado.</p>}
      <ul className="space-y-1">
        {project.customFonts.map((f) => (
          <li key={f.id} className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-[13px]">
            <FileType2 className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{f.family}</span>
              <span className="block text-[11px] text-muted">
                {WEIGHT[f.weight] ?? f.weight}
                {f.italic ? " Itálico" : ""} · {f.fileName}
              </span>
            </span>
            <button
              className="rounded p-0.5 text-muted hover:bg-danger-soft hover:text-danger"
              aria-label={`Excluir fonte ${f.family}`}
              onClick={async () => {
                const used = usage(f.family);
                const ok = await confirm({
                  title: `Excluir a fonte “${f.family}”?`,
                  description: used ? `${used} campo(s) usam esta família e passarão para a fonte padrão.` : "Você pode desfazer com Ctrl+Z.",
                  confirmLabel: "Excluir",
                  danger: true,
                });
                if (ok) useWorkspace.getState().removeCustomFont(f.id);
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <Button size="sm" className="w-full" onClick={requestFontUpload}>
        <Plus /> Adicionar fonte (TTF/OTF)
      </Button>
    </div>
  );
}
