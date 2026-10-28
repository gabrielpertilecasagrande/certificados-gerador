"use client";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  CloudUpload,
  Download,
  Eye,
  LayoutTemplate,
  Maximize,
  Redo2,
  Table2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "zustand";
import { Button } from "@/components/ui/button";
import { Spinner, Tip } from "@/components/ui/misc";
import { LogoutButton } from "@/components/logout-button";
import { cn } from "@/lib/utils/cn";
import { useView } from "@/features/editor/view-store";
import { redo, undo, useWorkspace, type WorkspaceTab } from "./store";

const TABS: { id: WorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "editor", label: "Editor", icon: LayoutTemplate },
  { id: "participants", label: "Participantes", icon: Table2 },
  { id: "preview", label: "Pré-visualização", icon: Eye },
  { id: "export", label: "Exportação", icon: Download },
];

function SaveIndicator() {
  const state = useWorkspace((s) => s.saveState);
  const map = {
    saved: { icon: <Check className="size-3.5" />, label: "Salvo", cls: "text-muted" },
    dirty: { icon: <CloudUpload className="size-3.5" />, label: "Alterações pendentes", cls: "text-muted" },
    saving: { icon: <Spinner className="size-3" />, label: "Salvando…", cls: "text-muted" },
    error: { icon: <AlertCircle className="size-3.5" />, label: "Erro ao salvar", cls: "text-danger" },
  }[state];
  return (
    <span className={cn("hidden items-center gap-1 text-xs md:inline-flex", map.cls)} data-testid="save-state" data-state={state}>
      {map.icon}
      {map.label}
    </span>
  );
}

function ProjectName() {
  const name = useWorkspace((s) => s.project?.name ?? "");
  const rename = useWorkspace((s) => s.rename);
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={name}
        className="h-8 w-56 rounded-md border border-primary bg-surface px-2 text-sm font-semibold outline-none ring-3 ring-primary/15"
        onBlur={(e) => {
          rename(e.target.value);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        aria-label="Nome do projeto"
      />
    );
  }
  return (
    <button className="max-w-[16rem] truncate rounded-md px-2 py-1 text-sm font-semibold hover:bg-surface-2" onClick={() => setEditing(true)} title="Renomear projeto">
      {name}
    </button>
  );
}

export function TopBar() {
  const tab = useWorkspace((s) => s.tab);
  const setUi = useWorkspace((s) => s.setUi);
  const canUndo = useStore(useWorkspace.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useWorkspace.temporal, (s) => s.futureStates.length > 0);
  const zoom = useView((s) => s.zoom);
  const zoomBy = useView((s) => s.zoomBy);
  const requestFit = useView((s) => s.requestFit);

  return (
    <header className="flex h-13 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 sm:px-3">
      <Tip label="Voltar aos projetos">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar aos projetos">
          <Link href="/">
            <ArrowLeft />
          </Link>
        </Button>
      </Tip>
      <ProjectName />
      <SaveIndicator />

      <nav className="mx-auto flex items-center gap-0.5 overflow-x-auto rounded-lg bg-surface-2 p-0.5" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setUi({ tab: id })}
            className={cn(
              "flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground",
              tab === id && "bg-surface text-foreground shadow-soft",
            )}
          >
            <Icon className="size-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-0.5">
        <Tip label="Desfazer" shortcut="Ctrl+Z">
          <Button variant="ghost" size="icon" disabled={!canUndo} onClick={undo} aria-label="Desfazer">
            <Undo2 />
          </Button>
        </Tip>
        <Tip label="Refazer" shortcut="Ctrl+Shift+Z">
          <Button variant="ghost" size="icon" disabled={!canRedo} onClick={redo} aria-label="Refazer">
            <Redo2 />
          </Button>
        </Tip>
        {tab === "editor" && (
          <div className="ml-1 hidden items-center gap-0.5 border-l border-border pl-1.5 lg:flex">
            <Button variant="ghost" size="icon" onClick={() => zoomBy(1 / 1.2)} aria-label="Diminuir zoom">
              <ZoomOut />
            </Button>
            <span className="w-11 text-center text-xs tabular-nums text-muted">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" onClick={() => zoomBy(1.2)} aria-label="Aumentar zoom">
              <ZoomIn />
            </Button>
            <Tip label="Ajustar à tela">
              <Button variant="ghost" size="icon" onClick={requestFit} aria-label="Ajustar à tela">
                <Maximize />
              </Button>
            </Tip>
          </div>
        )}
        <Button variant="primary" size="sm" className="ml-1.5" onClick={() => setUi({ tab: "export" })}>
          <Download /> <span className="hidden sm:inline">Exportar</span>
        </Button>
        <LogoutButton compact />
      </div>
    </header>
  );
}
