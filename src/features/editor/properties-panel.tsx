"use client";

import {
  AlignCenter,
  AlignEndHorizontal,
  AlignHorizontalJustifyCenter,
  AlignHorizontalSpaceAround,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignEndVertical,
  AlignVerticalJustifyCenter,
  AlignVerticalSpaceAround,
  ArrowDownToLine,
  ArrowUpToLine,
  Braces,
  Eye,
  EyeOff,
  Group as GroupIcon,
  Italic,
  Lock,
  RotateCcw,
  Trash2,
  Ungroup,
  Unlock,
  FoldVertical,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input, NumberField, Select, Textarea } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Badge, Segmented, Tip } from "@/components/ui/misc";
import type { Element, ElementOverride, ImageElement, ShapeElement, TextElement, TextFit } from "@/lib/model/types";
import { FONT_CATEGORIES, FONT_FAMILIES, familyAvailable, hasItalic, resolveFontVariant, weightsFor } from "@/lib/render/fonts";
import { applyOverride } from "@/lib/render/resolve";
import type { Issue } from "@/lib/render/resolve";
import { round, ptToMm, mmToPt } from "@/lib/utils/units";
import { knownVariables, variablesIn } from "@/lib/variables";
import { useActiveParticipant, useActiveTemplate, useWorkspace } from "@/features/workspace/store";
import { alignPatches, distributePatches, type AlignKind } from "./align";
import { requestFontUpload } from "./custom-fonts";
import { PagePanel } from "./page-panel";
import { ColorInput, Row, Section } from "./panel-ui";

const WEIGHT_LABEL: Record<number, string> = { 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extrabold" };

const OVERRIDABLE = new Set<keyof ElementOverride>(["x", "y", "width", "height", "rotation", "fontSize", "content", "align", "lineHeight", "letterSpacing", "fit"]);

export function PropertiesPanel({ issues }: { issues: Issue[] }) {
  const template = useActiveTemplate();
  const selectedIds = useWorkspace((s) => s.selectedIds);
  const participant = useActiveParticipant();
  const individualMode = useWorkspace((s) => s.individualMode);

  const selected = useMemo(
    () => (template ? template.elements.filter((e) => selectedIds.includes(e.id)) : []),
    [template, selectedIds],
  );

  if (!template) return null;
  if (selected.length === 0) return <PagePanel template={template} />;
  if (selected.length > 1) return <MultiPanel elements={selected} />;

  const base = selected[0];
  const effective = individualMode && participant ? applyOverride(base, participant.overrides[base.id]) : base;
  const elIssues = issues.filter((i) => i.elementId === base.id);
  return <ElementPanel key={base.id} el={effective} hasOverride={!!participant?.overrides[base.id]} issues={elIssues} />;
}

function useEdit(el: Element) {
  const editElements = useWorkspace((s) => s.editElements);
  const individualMode = useWorkspace((s) => s.individualMode);
  return {
    individualMode,
    edit: (patch: Partial<Element>) => editElements([{ id: el.id, patch }]),
    /** Em modo individual, propriedades de estilo valem para todos e ficam bloqueadas. */
    lockedInIndividual: (key: keyof ElementOverride | string) => individualMode && !OVERRIDABLE.has(key as keyof ElementOverride),
  };
}

function GeometrySection({ el }: { el: Element }) {
  const { edit } = useEdit(el);
  const mm = (v: number) => round(ptToMm(v), 1);
  return (
    <Section title="Posição e tamanho">
      <div className="grid grid-cols-2 gap-2">
        <NumberField prefix="X" suffix="mm" value={mm(el.x)} onValueChange={(v) => edit({ x: mmToPt(v) })} aria-label="Posição X em mm" />
        <NumberField prefix="Y" suffix="mm" value={mm(el.y)} onValueChange={(v) => edit({ y: mmToPt(v) })} aria-label="Posição Y em mm" />
        <NumberField prefix="L" suffix="mm" min={1} value={mm(el.width)} onValueChange={(v) => edit({ width: mmToPt(v) })} aria-label="Largura em mm" />
        {el.type !== "line" ? (
          <NumberField prefix="A" suffix="mm" min={1} value={mm(el.height)} onValueChange={(v) => edit({ height: mmToPt(v) })} aria-label="Altura em mm" />
        ) : (
          <div />
        )}
        <NumberField prefix="↻" suffix="°" value={el.rotation} digits={0} onValueChange={(v) => edit({ rotation: ((v % 360) + 360) % 360 })} aria-label="Rotação" />
      </div>
      <PageAlignButtons el={el} />
    </Section>
  );
}

function PageAlignButtons({ el }: { el: Element }) {
  const template = useActiveTemplate()!;
  const editElements = useWorkspace((s) => s.editElements);
  const run = (kind: AlignKind, rel: "page" | "margins" = "page") => editElements(alignPatches([el], kind, template, rel));
  const btn = (kind: AlignKind, icon: React.ReactNode, label: string) => (
    <Tip label={label}>
      <Button variant="ghost" size="icon-sm" onClick={() => run(kind)} aria-label={label}>
        {icon}
      </Button>
    </Tip>
  );
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-surface-2/40 px-1 py-0.5">
      {btn("left", <AlignStartVertical />, "Alinhar à esquerda da página")}
      {btn("hcenter", <AlignHorizontalJustifyCenter />, "Centralizar na horizontal")}
      {btn("right", <AlignEndVertical />, "Alinhar à direita da página")}
      {btn("top", <AlignStartHorizontal />, "Alinhar ao topo")}
      {btn("vcenter", <AlignVerticalJustifyCenter />, "Centralizar na vertical")}
      {btn("bottom", <AlignEndHorizontal />, "Alinhar à base")}
      <Tip label="Centralizar entre as margens">
        <Button variant="ghost" size="icon-sm" onClick={() => run("hcenter", "margins")} aria-label="Centralizar entre margens">
          <FoldVertical className="rotate-90" />
        </Button>
      </Tip>
    </div>
  );
}

function ElementPanel({ el, hasOverride, issues }: { el: Element; hasOverride: boolean; issues: Issue[] }) {
  const { edit, individualMode } = useEdit(el);
  const updateElement = useWorkspace((s) => s.updateElement);
  const deleteElements = useWorkspace((s) => s.deleteElements);
  const clearOverrides = useWorkspace((s) => s.clearOverrides);
  const participant = useActiveParticipant();
  const typeLabel = el.type === "text" ? "Texto" : el.type === "image" ? "Imagem" : el.type === "line" ? "Linha" : el.type === "ellipse" ? "Círculo" : "Retângulo";

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Input
          value={el.name}
          onChange={(e) => updateElement(el.id, { name: e.target.value })}
          className="h-8 border-transparent bg-transparent px-1 font-semibold shadow-none hover:border-border"
          aria-label="Nome do elemento"
          disabled={individualMode}
        />
        <Badge>{typeLabel}</Badge>
      </div>
      {individualMode && (
        <div className="border-b border-amber-200 bg-warning-soft px-4 py-2.5 text-xs text-amber-900">
          Ajustando <strong>somente este certificado</strong>. Posição, tamanho, ajuste e texto ficam como exceção deste participante.
          {hasOverride && participant && (
            <button className="mt-1.5 flex items-center gap-1 font-medium text-amber-800 underline-offset-2 hover:underline" onClick={() => clearOverrides(participant.id, el.id)}>
              <RotateCcw className="size-3.5" /> Restaurar configuração global
            </button>
          )}
        </div>
      )}
      {!individualMode && hasOverride && (
        <div className="border-b border-border bg-surface-2/60 px-4 py-2 text-xs text-muted">Este participante tem um ajuste individual neste elemento.</div>
      )}
      {issues.length > 0 && (
        <div className="space-y-1 border-b border-border bg-danger-soft/60 px-4 py-2.5">
          {issues.map((i, k) => (
            <p key={k} className={i.severity === "error" ? "text-xs text-danger" : "text-xs text-warning"}>
              {i.message}
            </p>
          ))}
        </div>
      )}
      {el.type === "text" && <TextSections el={el} />}
      {el.type === "image" && <ImageSection el={el} />}
      {(el.type === "rect" || el.type === "ellipse" || el.type === "line") && <ShapeSection el={el} />}
      <GeometrySection el={el} />
      {!individualMode && (
        <div className="flex flex-wrap gap-2 px-4 pt-4">
          <Button size="sm" onClick={() => edit({ locked: !el.locked })}>
            {el.locked ? <Unlock /> : <Lock />} {el.locked ? "Desbloquear" : "Bloquear"}
          </Button>
          <Button size="sm" onClick={() => edit({ hidden: !el.hidden })}>
            {el.hidden ? <Eye /> : <EyeOff />} {el.hidden ? "Mostrar" : "Ocultar"}
          </Button>
          <Button size="sm" variant="danger-ghost" onClick={() => deleteElements([el.id])}>
            <Trash2 /> Excluir
          </Button>
        </div>
      )}
    </div>
  );
}

function VariableMenu({ onPick }: { onPick: (key: string) => void }) {
  const project = useWorkspace((s) => s.project);
  const vars = useMemo(() => (project ? knownVariables(project) : []), [project]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-primary">
          <Braces /> Inserir variável
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Variáveis disponíveis</DropdownMenuLabel>
        {vars.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">Importe participantes ou crie variáveis.</p>}
        {vars.map((v) => (
          <DropdownMenuItem key={v.key} onSelect={() => onPick(v.key)}>
            <span className="flex-1">{v.label}</span>
            <code className="text-[11px] text-muted">{`{{${v.key}}}`}</code>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TextSections({ el }: { el: TextElement }) {
  const { edit, lockedInIndividual, individualMode } = useEdit(el);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const project = useWorkspace((s) => s.project);
  const participant = useActiveParticipant();
  const updateCell = useWorkspace((s) => s.updateCell);
  const customFonts = project?.customFonts ?? [];
  const weights = weightsFor(el.fontFamily, customFonts);
  const italicOk = hasItalic(el.fontFamily, customFonts);
  const customFamilies = [...new Set(customFonts.map((f) => f.family))];
  const fit = el.fit;
  const setFit = (patch: Partial<TextFit>) => edit({ fit: { ...fit, ...patch } });

  useEffect(() => {
    const focus = () => textRef.current?.focus();
    window.addEventListener("cert:focus-content", focus);
    return () => window.removeEventListener("cert:focus-content", focus);
  }, []);

  const insertVar = (key: string) => {
    const ta = textRef.current;
    const token = `{{${key}}}`;
    if (!ta) return edit({ content: el.content + token });
    const start = ta.selectionStart ?? el.content.length;
    const end = ta.selectionEnd ?? start;
    edit({ content: el.content.slice(0, start) + token + el.content.slice(end) });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const usedColumns = useMemo(() => {
    if (!project) return [];
    const keys = variablesIn(el.content);
    return project.columns.filter((c) => keys.includes(c.key));
  }, [project, el.content]);

  return (
    <>
      <Section title="Conteúdo" actions={<VariableMenu onPick={insertVar} />}>
        <Textarea
          ref={textRef}
          value={el.content}
          onChange={(e) => edit({ content: e.target.value })}
          rows={Math.min(6, Math.max(2, Math.ceil(el.content.length / 34)))}
          className="font-mono text-[13px]"
          aria-label="Conteúdo do texto"
          data-testid="text-content"
        />
        <p className="text-[11px] leading-snug text-muted">
          Use <code className="rounded bg-surface-2 px-1">{"{{variavel}}"}</code> para dados da planilha. Filtros: <code className="rounded bg-surface-2 px-1">|upper</code>{" "}
          <code className="rounded bg-surface-2 px-1">|title</code> <code className="rounded bg-surface-2 px-1">|first</code>
        </p>
        {individualMode && participant && usedColumns.length > 0 && (
          <div className="space-y-1.5 rounded-md border border-amber-200 bg-warning-soft/60 p-2">
            <p className="text-[11px] font-semibold text-amber-900">Dados deste participante</p>
            {usedColumns.map((c) => (
              <Row key={c.id} label={c.label}>
                <Input className="h-8" value={participant.values[c.id] ?? ""} onChange={(e) => updateCell(participant.id, c.id, e.target.value)} />
              </Row>
            ))}
          </div>
        )}
      </Section>

      <Section title="Tipografia">
        <Select
          value={el.fontFamily}
          disabled={lockedInIndividual("fontFamily")}
          onChange={(e) => {
            const family = e.target.value;
            if (family === "__add") return requestFontUpload();
            const v = resolveFontVariant(family, el.fontWeight, el.italic, customFonts);
            edit({ fontFamily: family, fontWeight: v.weight, italic: v.italic });
          }}
          aria-label="Fonte"
        >
          {!familyAvailable(el.fontFamily, customFonts) && <option value={el.fontFamily}>{el.fontFamily} (indisponível)</option>}
          <optgroup label="Fontes do projeto">
            {customFamilies.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            <option value="__add">+ Adicionar fonte…</option>
          </optgroup>
          {(["sans", "serif", "display", "script"] as const).map((cat) => (
            <optgroup key={cat} label={{ sans: "Sem serifa", serif: "Serifadas", display: "Títulos", script: "Manuscritas" }[cat]}>
              {FONT_FAMILIES.filter((f) => (FONT_CATEGORIES[f] ?? "sans") === cat).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Select value={el.fontWeight} disabled={lockedInIndividual("fontWeight")} onChange={(e) => edit({ fontWeight: Number(e.target.value) })} aria-label="Peso">
            {weights.map((w) => (
              <option key={w} value={w}>
                {WEIGHT_LABEL[w] ?? w}
              </option>
            ))}
          </Select>
          <Tip label="Itálico">
            <Button
              size="icon"
              variant={el.italic ? "primary" : "secondary"}
              disabled={!italicOk || lockedInIndividual("italic")}
              onClick={() => edit({ italic: !el.italic })}
              aria-label="Itálico"
              aria-pressed={el.italic}
            >
              <Italic />
            </Button>
          </Tip>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField prefix="T" suffix="pt" min={4} max={400} value={el.fontSize} onValueChange={(v) => edit({ fontSize: v })} aria-label="Tamanho da fonte" />
          <NumberField prefix="↕" min={0.6} max={4} step={0.05} digits={2} value={el.lineHeight} onValueChange={(v) => edit({ lineHeight: v })} aria-label="Altura da linha" />
          <NumberField prefix="↔" suffix="pt" min={-5} max={50} step={0.1} value={el.letterSpacing} onValueChange={(v) => edit({ letterSpacing: v })} aria-label="Espaçamento entre letras" />
          <NumberField prefix="◐" suffix="%" min={0} max={100} digits={0} value={Math.round(el.opacity * 100)} disabled={lockedInIndividual("opacity")} onValueChange={(v) => edit({ opacity: v / 100 })} aria-label="Opacidade" />
        </div>
        <ColorInput value={el.color} onChange={(c) => !lockedInIndividual("color") && c && edit({ color: c })} label="Cor do texto" />
        <Segmented
          value={el.textTransform}
          onChange={(v) => !lockedInIndividual("textTransform") && edit({ textTransform: v })}
          options={[
            { value: "none", label: "Aa", title: "Como digitado" },
            { value: "uppercase", label: "AA", title: "MAIÚSCULAS" },
            { value: "lowercase", label: "aa", title: "minúsculas" },
            { value: "capitalize", label: "Ab", title: "Capitalizar Palavras" },
          ]}
          className="w-full"
        />
        <div className="grid grid-cols-2 gap-2">
          <Segmented
            value={el.align}
            onChange={(v) => edit({ align: v })}
            options={[
              { value: "left", label: <AlignLeft />, title: "Esquerda" },
              { value: "center", label: <AlignCenter />, title: "Centro" },
              { value: "right", label: <AlignRight />, title: "Direita" },
            ]}
          />
          <Segmented
            value={el.verticalAlign}
            onChange={(v) => !lockedInIndividual("verticalAlign") && edit({ verticalAlign: v })}
            options={[
              { value: "top", label: <ArrowUpToLine />, title: "Topo" },
              { value: "middle", label: <AlignVerticalJustifyCenter />, title: "Meio" },
              { value: "bottom", label: <ArrowDownToLine />, title: "Base" },
            ]}
          />
        </div>
        <Row label="Margem interna">
          <NumberField suffix="mm" min={0} max={50} value={round(ptToMm(el.padding))} disabled={lockedInIndividual("padding")} onValueChange={(v) => edit({ padding: mmToPt(v) })} aria-label="Margem interna" />
        </Row>
      </Section>

      <Section title="Ajuste automático">
        <Select value={fit.mode} onChange={(e) => setFit({ mode: e.target.value as TextFit["mode"], maxLines: e.target.value === "wrap" ? Math.max(2, fit.maxLines) : fit.maxLines })} aria-label="Modo de ajuste">
          <option value="shrink">Reduzir somente se necessário</option>
          <option value="wrap">Quebrar linha (e reduzir se necessário)</option>
          <option value="grow">Proporcional (maior tamanho possível)</option>
          <option value="fixed">Tamanho fixo</option>
        </Select>
        <p className="text-[11px] leading-snug text-muted">
          {fit.mode === "shrink" && `Nomes que cabem ficam em ${el.fontSize} pt; os longos são reduzidos até o mínimo.`}
          {fit.mode === "wrap" && `Divide em até ${fit.maxLines} linhas; se ainda não couber, reduz até o mínimo.`}
          {fit.mode === "grow" && "Usa o maior tamanho entre o mínimo e o máximo que cabe na caixa."}
          {fit.mode === "fixed" && "Mantém o tamanho configurado. Textos que não couberem são sinalizados."}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {fit.mode !== "fixed" && (
            <NumberField prefix="mín" suffix="pt" min={2} max={el.fontSize} value={Math.min(fit.minSize, el.fontSize)} onValueChange={(v) => setFit({ minSize: v })} aria-label="Tamanho mínimo" />
          )}
          {fit.mode === "grow" && <NumberField prefix="máx" suffix="pt" min={fit.minSize} max={400} value={fit.maxSize} onValueChange={(v) => setFit({ maxSize: v })} aria-label="Tamanho máximo" />}
          {(fit.mode === "wrap" || fit.mode === "fixed" || fit.mode === "grow") && (
            <NumberField prefix="linhas" min={1} max={50} digits={0} value={fit.maxLines} onValueChange={(v) => setFit({ maxLines: Math.round(v) })} aria-label="Máximo de linhas" />
          )}
        </div>
      </Section>
    </>
  );
}

function ImageSection({ el }: { el: ImageElement }) {
  const { edit, individualMode } = useEdit(el);
  if (individualMode) return null;
  return (
    <Section title="Imagem">
      <Row label="Opacidade">
        <NumberField suffix="%" min={0} max={100} digits={0} value={Math.round(el.opacity * 100)} onValueChange={(v) => edit({ opacity: v / 100 })} />
      </Row>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={el.keepRatio} onChange={(e) => edit({ keepRatio: e.target.checked })} /> Manter proporção ao redimensionar
      </label>
      <ReplaceImageButton el={el} />
    </Section>
  );
}

function ReplaceImageButton({ el }: { el: ImageElement }) {
  const input = useRef<HTMLInputElement>(null);
  const replace = useWorkspace((s) => s.updateElement);
  return (
    <>
      <Button size="sm" className="w-full" onClick={() => input.current?.click()}>
        Substituir imagem
      </Button>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const { importImageAsset } = await import("./insert-assets");
          const r = await importImageAsset(file);
          if (r) replace(el.id, { assetId: r.assetId, height: el.keepRatio ? el.width / r.ratio : el.height });
        }}
      />
    </>
  );
}

function ShapeSection({ el }: { el: ShapeElement }) {
  const { edit, individualMode } = useEdit(el);
  if (individualMode) return null;
  return (
    <Section title="Aparência">
      {el.type !== "line" && (
        <Row label="Preenchimento">
          <ColorInput value={el.fill} allowNone onChange={(v) => edit({ fill: v })} label="Cor de preenchimento" />
        </Row>
      )}
      <Row label="Contorno">
        <ColorInput value={el.stroke} allowNone={el.type !== "line"} onChange={(v) => edit({ stroke: v ?? (el.type === "line" ? "#000000" : null) })} label="Cor do contorno" />
      </Row>
      <div className="grid grid-cols-2 gap-2">
        <NumberField prefix="esp" suffix="pt" min={0} max={50} step={0.25} value={el.strokeWidth} onValueChange={(v) => edit({ strokeWidth: v })} aria-label="Espessura" />
        {el.type === "rect" && <NumberField prefix="raio" suffix="pt" min={0} max={500} value={el.cornerRadius} onValueChange={(v) => edit({ cornerRadius: v })} aria-label="Arredondamento" />}
        <NumberField prefix="◐" suffix="%" min={0} max={100} digits={0} value={Math.round(el.opacity * 100)} onValueChange={(v) => edit({ opacity: v / 100 })} aria-label="Opacidade" />
      </div>
    </Section>
  );
}

function MultiPanel({ elements }: { elements: Element[] }) {
  const template = useActiveTemplate()!;
  const editElements = useWorkspace((s) => s.editElements);
  const group = useWorkspace((s) => s.groupSelection);
  const ungroup = useWorkspace((s) => s.ungroupSelection);
  const del = useWorkspace((s) => s.deleteElements);
  const grouped = elements.every((e) => e.groupId && e.groupId === elements[0].groupId);
  const a = (kind: AlignKind, icon: React.ReactNode, label: string) => (
    <Tip label={label}>
      <Button variant="secondary" size="icon" onClick={() => editElements(alignPatches(elements, kind, template, "selection"))} aria-label={label}>
        {icon}
      </Button>
    </Tip>
  );
  return (
    <div>
      <div className="border-b border-border px-4 py-3 text-sm font-semibold">{elements.length} elementos selecionados</div>
      <Section title="Alinhar entre si">
        <div className="flex flex-wrap gap-1.5">
          {a("left", <AlignStartVertical />, "Esquerda")}
          {a("hcenter", <AlignHorizontalJustifyCenter />, "Centro horizontal")}
          {a("right", <AlignEndVertical />, "Direita")}
          {a("top", <AlignStartHorizontal />, "Topo")}
          {a("vcenter", <AlignVerticalJustifyCenter />, "Centro vertical")}
          {a("bottom", <AlignEndHorizontal />, "Base")}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" disabled={elements.length < 3} onClick={() => editElements(distributePatches(elements, "h"))}>
            <AlignHorizontalSpaceAround /> Distribuir horizontal
          </Button>
          <Button size="sm" disabled={elements.length < 3} onClick={() => editElements(distributePatches(elements, "v"))}>
            <AlignVerticalSpaceAround /> Vertical
          </Button>
        </div>
      </Section>
      <Section title="Na página">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => editElements(alignPatches(elements, "hcenter", template, "page"))}>
            Centralizar cada um na página
          </Button>
        </div>
      </Section>
      <div className="flex flex-wrap gap-2 px-4 pt-4">
        {grouped ? (
          <Button size="sm" onClick={ungroup}>
            <Ungroup /> Desagrupar
          </Button>
        ) : (
          <Button size="sm" onClick={group}>
            <GroupIcon /> Agrupar
          </Button>
        )}
        <Button size="sm" variant="danger-ghost" onClick={() => del(elements.map((e) => e.id))}>
          <Trash2 /> Excluir
        </Button>
      </div>
    </div>
  );
}
