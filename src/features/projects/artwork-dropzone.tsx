"use client";

import { FileImage, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { prepareArtwork, type PreparedArtwork } from "@/lib/import/background";
import { Spinner } from "@/components/ui/misc";

export type PickedArtwork = PreparedArtwork & { name: string };

export function ArtworkDropzone({
  onPicked,
  compact,
  className,
}: {
  onPicked: (art: PickedArtwork) => void;
  compact?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const art = await prepareArtwork(file);
      onPicked({ ...art, name: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Arquivo inválido");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border-strong bg-surface-2/50 text-center transition-colors hover:border-primary hover:bg-primary-soft/40",
          compact ? "gap-1 px-3 py-4" : "gap-2 px-6 py-8",
          over && "border-primary bg-primary-soft",
        )}
      >
        {busy ? <Spinner className="size-6 text-primary" /> : compact ? <FileImage className="size-5 text-muted" /> : <UploadCloud className="size-7 text-primary" />}
        <span className="text-sm font-medium">{busy ? "Lendo arquivo…" : "Arraste a arte do certificado ou clique para escolher"}</span>
        {!compact && <span className="text-xs text-muted">PDF, PNG, JPG, WEBP ou SVG — a arte é usada como fundo fixo</span>}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept="application/pdf,image/png,image/jpeg,image/webp,image/svg+xml,.pdf,.png,.jpg,.jpeg,.webp,.svg"
        onChange={(e) => {
          handle(e.target.files?.[0]);
          e.target.value = "";
        }}
        data-testid="artwork-input"
      />
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </div>
  );
}
