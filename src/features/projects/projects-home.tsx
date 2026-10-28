"use client";

import {
  Copy,
  Download,
  FolderOpen,
  ImageOff,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Badge, Spinner } from "@/components/ui/misc";
import type { ProjectStatus, ProjectSummary } from "@/lib/model/types";
import { getRepository } from "@/lib/persistence/indexeddb";
import { duplicateProject, exportBackup, importBackup } from "@/lib/persistence/project-ops";
import { downloadBlob } from "@/lib/runtime/download";
import { stripAccents } from "@/lib/variables";
import { sanitizeFileName } from "@/lib/variables/filename";
import { plural, relativeTime } from "@/lib/utils/format";
import { NewProjectDialog } from "./new-project-dialog";

const STATUS: Record<ProjectStatus, { label: string; tone: "neutral" | "primary" | "success" }> = {
  draft: { label: "Em edição", tone: "neutral" },
  ready: { label: "Pronto", tone: "primary" },
  exported: { label: "Exportado", tone: "success" },
};

function Thumbnail({ assetId }: { assetId: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!assetId) return;
    let revoked = false;
    let u: string | null = null;
    getRepository()
      .getAsset(assetId)
      .then((a) => {
        if (!a || revoked) return;
        u = URL.createObjectURL(a.blob);
        setUrl(u);
      });
    return () => {
      revoked = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [assetId]);
  if (!assetId || !url) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted/60">
        <ImageOff className="size-6" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- blob local
  return <img src={url} alt="" className="h-full w-full object-contain" draggable={false} />;
}

export function ProjectsHome() {
  const router = useRouter();
  const confirm = useConfirm();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [newName, setNewName] = useState("");
  const backupInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setProjects(await getRepository().listProjects());
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível acessar o armazenamento local do navegador");
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial do IndexedDB
    refresh();
    navigator.storage?.persist?.().catch(() => {});
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = stripAccents(query).toLowerCase().trim();
    return (projects ?? []).filter((p) => !q || stripAccents(p.name).toLowerCase().includes(q));
  }, [projects, query]);

  async function onDuplicate(p: ProjectSummary) {
    const copy = await duplicateProject(getRepository(), p.id);
    toast.success(`"${copy.name}" criado`);
    refresh();
  }

  async function onDelete(p: ProjectSummary) {
    const ok = await confirm({
      title: `Excluir "${p.name}"?`,
      description: "O projeto, a arte e a lista de participantes serão removidos deste navegador. Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir projeto",
      danger: true,
    });
    if (!ok) return;
    await getRepository().deleteProject(p.id);
    toast.success("Projeto excluído");
    refresh();
  }

  async function onRename() {
    if (!renaming) return;
    const repo = getRepository();
    const project = await repo.getProject(renaming.id);
    if (project && newName.trim()) await repo.saveProject({ ...project, name: newName.trim(), updatedAt: Date.now() });
    setRenaming(null);
    refresh();
  }

  async function onBackup(p: ProjectSummary) {
    const blob = await exportBackup(getRepository(), p.id);
    downloadBlob(blob, `${sanitizeFileName(p.name)}.certproj`);
  }

  async function onRestore(file: File | undefined) {
    if (!file) return;
    try {
      const p = await importBackup(getRepository(), file);
      toast.success(`Projeto "${p.name}" restaurado`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao restaurar backup");
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Logo className="size-7" />
          <span className="text-[15px] font-semibold tracking-tight">Estúdio de Certificados</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => backupInput.current?.click()} className="hidden sm:inline-flex">
              <Upload /> Restaurar backup
            </Button>
            <input ref={backupInput} type="file" hidden accept=".certproj,application/zip" onChange={(e) => { onRestore(e.target.files?.[0]); e.target.value = ""; }} />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
            <p className="mt-1 text-sm text-muted">
              {projects ? plural(projects.length, "projeto salvo neste navegador", "projetos salvos neste navegador") : "Carregando…"}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1 sm:w-72 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input placeholder="Buscar projetos" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" aria-label="Buscar projetos" />
            </div>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> Novo projeto
            </Button>
          </div>
        </div>

        {projects === null ? (
          <div className="flex h-64 items-center justify-center text-muted">
            <Spinner className="size-6" />
          </div>
        ) : projects.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-surface px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
              <FolderOpen className="size-6" />
            </div>
            <h2 className="mt-4 text-base font-semibold">Nenhum projeto ainda</h2>
            <p className="mt-1 max-w-sm text-sm text-muted">Crie um projeto, importe a arte do certificado e a planilha de participantes. Em poucos minutos você terá todos os PDFs.</p>
            <Button variant="primary" className="mt-5" onClick={() => setCreating(true)}>
              <Plus /> Criar primeiro projeto
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted">Nenhum projeto corresponde a “{query}”.</p>
        ) : (
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => (
              <li key={p.id} className="group relative overflow-hidden rounded-xl border border-border bg-surface shadow-soft transition-shadow hover:shadow-pop">
                <Link href={`/projects/${p.id}`} className="block" aria-label={`Abrir ${p.name}`}>
                  <div className="aspect-[1.414] border-b border-border bg-canvas/60 p-3">
                    <div className="h-full w-full overflow-hidden rounded-sm">
                      <Thumbnail assetId={p.thumbnailAssetId} />
                    </div>
                  </div>
                </Link>
                <div className="flex items-start gap-2 p-3.5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/projects/${p.id}`} className="block truncate text-sm font-semibold hover:text-primary">
                      {p.name}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5" />
                        {p.participantCount.toLocaleString("pt-BR")}
                      </span>
                      <span>Editado {relativeTime(p.updatedAt)}</span>
                    </div>
                    <Badge tone={STATUS[p.status].tone} className="mt-2">
                      {STATUS[p.status].label}
                    </Badge>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${p.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => router.push(`/projects/${p.id}`)}>
                        <FolderOpen /> Abrir
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setRenaming(p);
                          setNewName(p.name);
                        }}
                      >
                        <Pencil /> Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onDuplicate(p)}>
                        <Copy /> Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onBackup(p)}>
                        <Download /> Baixar backup (.certproj)
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem danger onSelect={() => onDelete(p)}>
                        <Trash2 /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-10 text-center text-xs text-muted">
          Os projetos ficam salvos no armazenamento deste navegador. Use “Baixar backup” para guardar uma cópia ou levar a outro computador.
        </p>
      </main>

      <NewProjectDialog open={creating} onOpenChange={setCreating} />

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent title="Renomear projeto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onRename();
            }}
          >
            <DialogBody>
              <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Novo nome" />
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setRenaming(null)}>Cancelar</Button>
              <Button type="submit" variant="primary">
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
