"use client";

import {
  Braces,
  ChevronDown,
  ChevronUp,
  Circle,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  Lock,
  Minus,
  PenLine,
  Plus,
  Signature,
  Square,
  Trash2,
  Type,
  Unlock,
  Pilcrow,
  Database,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Badge, Switch } from "@/components/ui/misc";
import { createShapeElement, createTextElement } from "@/lib/model/defaults";
import type { Element, GlobalVariable, ImageElement, Template, TextElement } from "@/lib/model/types";
import { cn } from "@/lib/utils/cn";
import { newId } from "@/lib/utils/id";
import { mmToPt } from "@/lib/utils/units";
import { DERIVED_KEYS, knownVariables, PRESET_VARIABLES, slugify, uniqueKey } from "@/lib/variables";
import { useActiveTemplate, useWorkspace } from "@/features/workspace/store";
import { importImageAsset } from "./insert-assets";

type Tab = "insert" | "layers" | "data";

export function LeftPanel() {
  const [tab, setTab] = useState<Tab>("insert");
  const template = useActiveTemplate();
  if (!template) return null;
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-1 border-b border-border p-2" role="tablist">
        {(
          [
            ["insert", "Inserir", Plus],
            ["layers", "Camadas", Layers],
            ["data", "Dados fixos", Database],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground",
              tab === id && "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {tab === "insert" && <InsertTab template={template} />}
        {tab === "layers" && <LayersTab template={template} />}
        {tab === "data" && <GlobalsTab />}
      </div>
    </div>
  );
}

function Tile({ icon, label, onClick, testId }: { icon: React.ReactNode; label: string; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-3 text-xs font-medium shadow-soft transition-colors hover:border-primary/50 hover:bg-primary-soft/40 [&_svg]:size-5 [&_svg]:text-primary"
    >
      {icon}
      {label}
    </button>
  );
}

function InsertTab({ template }: { template: Template }) {
  const project = useWorkspace((s) => s.project)!;
  const addElement = useWorkspace((s) => s.addElement);
  const ensureColumn = useWorkspace((s) => s.ensureColumn);
  const individualMode = useWorkspace((s) => s.individualMode);
  const imageInput = useRef<HTMLInputElement>(null);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [newVar, setNewVar] = useState("");

  const variables = useMemo(() => {
    const known = knownVariables(project);
    const keys = new Set(known.map((k) => k.key));
    const presets = PRESET_VARIABLES.filter((p) => !keys.has(p.key)).map((p) => ({ ...p, source: "preset" as const }));
    return [...known, ...presets];
  }, [project]);

  const usedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const el of template.elements) if (el.type === "text") for (const m of el.content.matchAll(/\{\{\s*([\w.-]+)/g)) s.add(m[1]);
    return s;
  }, [template.elements]);

  const insertField = (key: string, label: string) => {
    // Cria a coluna correspondente quando a variável ainda não existe.
    const known = knownVariables(project).some((v) => v.key === key);
    if (!known) {
      if ((DERIVED_KEYS as readonly string[]).includes(key)) ensureColumn("nome", "Nome");
      else ensureColumn(key, label);
    }
    const isName = key === "nome" || key === "nome_completo";
    const n = template.elements.filter((e) => e.type === "text").length;
    const el = createTextElement(template.page, {
      name: label,
      content: `{{${key}}}`,
      fontSize: isName ? 34 : 16,
      fontWeight: isName ? 700 : 400,
      height: isName ? 54 : 28,
      fit: isName ? { mode: "shrink", minSize: 16, maxSize: 34, maxLines: 1 } : { mode: "shrink", minSize: 9, maxSize: 16, maxLines: 1 },
    });
    if (!isName) {
      el.width = Math.min(el.width, mmToPt(120));
      el.x = (template.page.widthPt - el.width) / 2;
      el.y = Math.min(template.page.heightPt - el.height - 10, template.page.heightPt / 2 + 40 + (n % 5) * 30);
    }
    addElement(el);
  };

  const addCustomVariable = () => {
    const label = newVar.trim();
    if (!label) return;
    const key = uniqueKey(slugify(label), knownVariables(project).map((v) => v.key));
    insertField(key, label);
    setNewVar("");
  };

  if (individualMode) {
    return <p className="p-4 text-sm text-muted">Saia do modo “somente este certificado” para inserir novos elementos no modelo.</p>;
  }

  return (
    <div className="space-y-5 p-3">
      <div>
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Campos variáveis</p>
        <ul className="space-y-1" data-testid="variable-list">
          {variables.map((v) => (
            <li key={v.key}>
              <button
                type="button"
                onClick={() => insertField(v.key, v.label)}
                className="group flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-[13px] hover:border-border hover:bg-surface"
              >
                <Braces className="size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">{v.label}</span>
                {usedKeys.has(v.key) && <Badge tone="primary">no modelo</Badge>}
                <Plus className="size-3.5 text-muted opacity-0 group-hover:opacity-100" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            addCustomVariable();
          }}
        >
          <Input value={newVar} onChange={(e) => setNewVar(e.target.value)} placeholder="Nova variável…" className="h-8" aria-label="Nome da nova variável" />
          <Button type="submit" size="icon" disabled={!newVar.trim()} aria-label="Criar variável">
            <Plus />
          </Button>
        </form>
      </div>

      <div>
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Textos</p>
        <div className="grid grid-cols-2 gap-2">
          <Tile
            icon={<Type />}
            label="Texto simples"
            onClick={() => addElement(createTextElement(template.page, { name: "Texto", content: "Texto", fontSize: 18, fontWeight: 400, height: 30, fit: { mode: "fixed", minSize: 8, maxSize: 18, maxLines: 3 } }))}
          />
          <Tile
            icon={<Pilcrow />}
            label="Texto composto"
            onClick={() => {
              const el = createTextElement(template.page, {
                name: "Parágrafo",
                content: "Certificamos que {{nome}} participou do evento {{evento}}, realizado em {{data}}, com carga horária de {{carga_horaria}} horas.",
                fontFamily: "Lora",
                fontSize: 15,
                fontWeight: 400,
                lineHeight: 1.45,
                height: 90,
                fit: { mode: "wrap", minSize: 10, maxSize: 15, maxLines: 5 },
              });
              // Dados normalmente iguais para todos viram "dados fixos" (a planilha pode sobrescrever).
              const current = useWorkspace.getState().project!;
              const missing = ([["evento", "Evento"], ["data", "Data"], ["carga_horaria", "Carga horária"]] as const).filter(
                ([k]) => !knownVariables(current).some((v) => v.key === k),
              );
              if (missing.length) useWorkspace.getState().setGlobals([...current.globals, ...missing.map(([key, label]) => ({ id: newId(), key, label, value: "" }))]);
              ensureColumn("nome", "Nome");
              addElement(el);
            }}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Imagens</p>
        <div className="grid grid-cols-2 gap-2">
          <Tile icon={<ImageIcon />} label="Logo / imagem" onClick={() => imageInput.current?.click()} />
          <Tile icon={<Signature />} label="Assinatura" onClick={() => setSignatureOpen(true)} />
        </div>
        <input
          ref={imageInput}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const r = await importImageAsset(file);
            if (!r) return;
            const width = mmToPt(40);
            const height = width / r.ratio;
            const el: ImageElement = {
              id: newId(),
              type: "image",
              name: file.name.replace(/\.[^.]+$/, ""),
              assetId: r.assetId,
              x: (template.page.widthPt - width) / 2,
              y: mmToPt(15),
              width,
              height,
              rotation: 0,
              opacity: 1,
              locked: false,
              hidden: false,
              keepRatio: true,
            };
            addElement(el);
          }}
        />
      </div>

      <div>
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Formas</p>
        <div className="grid grid-cols-3 gap-2">
          <Tile icon={<Minus />} label="Linha" onClick={() => addElement(createShapeElement(template.page, "line"))} />
          <Tile icon={<Square />} label="Retângulo" onClick={() => addElement(createShapeElement(template.page, "rect"))} />
          <Tile icon={<Circle />} label="Círculo" onClick={() => addElement(createShapeElement(template.page, "ellipse"))} />
        </div>
      </div>

      <SignatureDialog open={signatureOpen} onOpenChange={setSignatureOpen} template={template} />
    </div>
  );
}

function SignatureDialog({ open, onOpenChange, template }: { open: boolean; onOpenChange: (o: boolean) => void; template: Template }) {
  const mutateTemplate = useWorkspace((s) => s.updateTemplate);
  const setUi = useWorkspace((s) => s.setUi);
  const [file, setFile] = useState<File | null>(null);
  const [signer, setSigner] = useState("");
  const [role, setRole] = useState("");
  const [line, setLine] = useState(true);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const groupId = newId();
    const width = mmToPt(70);
    const x = (template.page.widthPt - width) / 2;
    const lineY = template.page.heightPt - mmToPt(40);
    const els: Element[] = [];
    if (file) {
      const r = await importImageAsset(file);
      if (r) {
        const h = Math.min(mmToPt(22), (width * 0.8) / r.ratio);
        const w = h * r.ratio;
        els.push({ id: newId(), type: "image", name: "Assinatura", assetId: r.assetId, x: x + (width - w) / 2, y: lineY - h + 4, width: w, height: h, rotation: 0, opacity: 1, locked: false, hidden: false, keepRatio: true, groupId });
      }
    }
    if (line) {
      const l = createShapeElement(template.page, "line");
      els.push({ ...l, name: "Linha de assinatura", x, y: lineY, width, height: 0, strokeWidth: 0.75, groupId });
    }
    const text = (name: string, content: string, y: number, size: number, weight: number): TextElement => ({
      ...createTextElement(template.page, { name, content, fontSize: size, fontWeight: weight, fontFamily: "Montserrat", height: size * 1.5, fit: { mode: "shrink", minSize: 7, maxSize: size, maxLines: 1 } }),
      x,
      y,
      width,
      groupId,
    });
    if (signer.trim()) els.push(text("Signatário", signer.trim(), lineY + 4, 11, 600));
    if (role.trim()) els.push(text("Cargo", role.trim(), lineY + (signer.trim() ? 21 : 4), 9, 400));
    mutateTemplate((t) => {
      t.elements.push(...(els as never[]));
    });
    setUi({ selectedIds: els.map((e) => e.id) });
    setBusy(false);
    onOpenChange(false);
    setFile(null);
    setSigner("");
    setRole("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Adicionar assinatura" description="Imagem da assinatura (PNG transparente ou SVG), nome e cargo do signatário.">
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label>Imagem da assinatura (opcional)</Label>
            <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sig-name">Nome do signatário</Label>
            <Input id="sig-name" value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Ex.: Profa. Dra. Helena Duarte" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sig-role">Cargo</Label>
            <Input id="sig-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ex.: Coordenadora do Evento" />
          </div>
          <label className="flex items-center justify-between text-[13px]">
            Linha de assinatura <Switch checked={line} onCheckedChange={setLine} />
          </label>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" disabled={busy || (!file && !signer.trim() && !role.trim() && !line)} onClick={create}>
            <PenLine /> Inserir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TYPE_ICON: Record<Element["type"], React.ComponentType<{ className?: string }>> = {
  text: Type,
  image: ImageIcon,
  rect: Square,
  ellipse: Circle,
  line: Minus,
};

function LayersTab({ template }: { template: Template }) {
  const selectedIds = useWorkspace((s) => s.selectedIds);
  const setUi = useWorkspace((s) => s.setUi);
  const updateElement = useWorkspace((s) => s.updateElement);
  const reorder = useWorkspace((s) => s.reorder);
  const deleteElements = useWorkspace((s) => s.deleteElements);
  const [editing, setEditing] = useState<string | null>(null);
  const list = [...template.elements].reverse();

  return (
    <div className="p-2">
      {list.length === 0 && <p className="p-3 text-sm text-muted">Nenhum elemento ainda. Use “Inserir” para adicionar campos.</p>}
      <ul className="space-y-0.5">
        {list.map((el) => {
          const Icon = TYPE_ICON[el.type];
          const selected = selectedIds.includes(el.id);
          return (
            <li
              key={el.id}
              className={cn(
                "group flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px]",
                selected ? "bg-primary-soft text-primary" : "hover:bg-surface-2",
                el.hidden && "opacity-50",
              )}
              onClick={(e) => setUi({ selectedIds: e.shiftKey ? [...new Set([...selectedIds, el.id])] : [el.id] })}
              onDoubleClick={() => setEditing(el.id)}
            >
              <Icon className="size-3.5 shrink-0" />
              {editing === el.id ? (
                <input
                  autoFocus
                  defaultValue={el.name}
                  className="h-6 min-w-0 flex-1 rounded border border-primary bg-surface px-1 text-[13px] text-foreground outline-none"
                  onBlur={(e) => {
                    updateElement(el.id, { name: e.target.value || el.name });
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate">
                  {el.name}
                  {el.groupId && <span className="ml-1 text-[10px] text-muted">grupo</span>}
                </span>
              )}
              <div className="flex items-center opacity-0 group-hover:opacity-100 [&>button]:rounded [&>button]:p-0.5 [&>button:hover]:bg-border">
                <button aria-label="Subir camada" onClick={(e) => (e.stopPropagation(), reorder([el.id], "forward"))}>
                  <ChevronUp className="size-3.5" />
                </button>
                <button aria-label="Descer camada" onClick={(e) => (e.stopPropagation(), reorder([el.id], "backward"))}>
                  <ChevronDown className="size-3.5" />
                </button>
                <button aria-label="Excluir" onClick={(e) => (e.stopPropagation(), deleteElements([el.id]))}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <button
                aria-label={el.hidden ? "Mostrar" : "Ocultar"}
                className={cn("rounded p-0.5 hover:bg-border", !el.hidden && "opacity-0 group-hover:opacity-100")}
                onClick={(e) => (e.stopPropagation(), updateElement(el.id, { hidden: !el.hidden }))}
              >
                {el.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
              <button
                aria-label={el.locked ? "Desbloquear" : "Bloquear"}
                className={cn("rounded p-0.5 hover:bg-border", !el.locked && "opacity-0 group-hover:opacity-100")}
                onClick={(e) => (e.stopPropagation(), updateElement(el.id, { locked: !el.locked }))}
              >
                {el.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
              </button>
            </li>
          );
        })}
        {template.background && (
          <li className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted">
            <ImageIcon className="size-3.5" />
            <span className="flex-1">Arte de fundo</span>
            <Lock className="size-3.5" />
          </li>
        )}
      </ul>
    </div>
  );
}

function GlobalsTab() {
  const project = useWorkspace((s) => s.project)!;
  const setGlobals = useWorkspace((s) => s.setGlobals);
  const [label, setLabel] = useState("");
  const update = (id: string, patch: Partial<GlobalVariable>) => setGlobals(project.globals.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const add = () => {
    const l = label.trim();
    if (!l) return;
    const key = uniqueKey(slugify(l), project.globals.map((g) => g.key));
    setGlobals([...project.globals, { id: newId(), key, label: l, value: "" }]);
    setLabel("");
  };
  const suggestions = [
    ["evento", "Evento"],
    ["data", "Data"],
    ["carga_horaria", "Carga horária"],
    ["instituicao", "Instituição"],
  ].filter(([k]) => !project.globals.some((g) => g.key === k));
  return (
    <div className="space-y-4 p-3">
      <p className="px-1 text-xs leading-relaxed text-muted">
        Valores iguais para todos os participantes (evento, data, organização…). Se a planilha tiver uma coluna com o mesmo nome, o valor da célula tem prioridade; células vazias usam o valor fixo.
      </p>
      {project.globals.map((g) => (
        <div key={g.id} className="space-y-1.5 rounded-lg border border-border bg-surface p-2.5 shadow-soft">
          <div className="flex items-center gap-1.5">
            <input
              value={g.label}
              onChange={(e) => update(g.id, { label: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none"
              aria-label="Nome da variável"
            />
            <code className="text-[11px] text-muted">{`{{${g.key}}}`}</code>
            <button aria-label="Excluir variável" className="rounded p-0.5 text-muted hover:bg-danger-soft hover:text-danger" onClick={() => setGlobals(project.globals.filter((x) => x.id !== g.id))}>
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <Input value={g.value} onChange={(e) => update(g.id, { value: e.target.value })} placeholder="Valor" className="h-8" aria-label={`Valor de ${g.label}`} />
        </div>
      ))}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome do dado fixo…" className="h-8" aria-label="Novo dado fixo" />
        <Button type="submit" size="icon" disabled={!label.trim()} aria-label="Adicionar dado fixo">
          <Plus />
        </Button>
      </form>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map(([k, l]) => (
            <button
              key={k}
              className="cursor-pointer rounded-full border border-dashed border-border-strong px-2.5 py-1 text-xs text-muted hover:border-primary hover:text-primary"
              onClick={() => setGlobals([...project.globals, { id: newId(), key: k, label: l, value: "" }])}
            >
              + {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
