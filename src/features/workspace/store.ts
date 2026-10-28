"use client";

import { current, produce, type Draft } from "immer";
import { create } from "zustand";
import { temporal } from "zundo";
import type {
  Background,
  Column,
  CustomFont,
  Element,
  Guide,
  ElementOverride,
  ExportSettings,
  GlobalVariable,
  ID,
  PageSize,
  Participant,
  Project,
  Template,
  TemplateRule,
  VersionData,
} from "@/lib/model/types";
import { restoreVersion } from "@/lib/persistence/versions";
import { templateAssignments } from "@/lib/participants/templates";
import { newId } from "@/lib/utils/id";
import { slugify, uniqueKey } from "@/lib/variables";

export type SaveState = "saved" | "dirty" | "saving" | "error";
export type WorkspaceTab = "editor" | "participants" | "preview" | "export";

const OVERRIDABLE: (keyof ElementOverride)[] = [
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "fontSize",
  "content",
  "align",
  "lineHeight",
  "letterSpacing",
  "fit",
  "hidden",
];

interface DocState {
  project: Project | null;
}

interface UiState {
  tab: WorkspaceTab;
  activeTemplateId: ID | null;
  selectedIds: ID[];
  /** Participante exibido no editor/pré-visualização. */
  activeParticipantId: ID | null;
  /** Quando ativo, alterações no canvas viram exceções do participante ativo. */
  individualMode: boolean;
  saveState: SaveState;
  clipboard: Element[];
  selectedRowIds: Set<ID>;
  /** Linhas visíveis na tabela (após busca/filtro), usadas por "exportar filtrados". */
  filteredRowIds: ID[] | null;
}

interface Actions {
  load(project: Project): void;
  mutate(recipe: (draft: Draft<Project>) => void): void;
  setUi(patch: Partial<UiState>): void;

  rename(name: string): void;
  setGlobals(globals: GlobalVariable[]): void;
  setExportSettings(patch: Partial<ExportSettings>): void;

  updateTemplate(recipe: (t: Draft<Template>) => void, templateId?: ID): void;
  setPage(page: PageSize): void;
  setBackground(bg: Background | null): void;

  addElement(el: Element): void;
  updateElement(id: ID, patch: Partial<Element>): void;
  updateElements(patches: { id: ID; patch: Partial<Element> }[]): void;
  /** Aplica no modelo ou, em modo individual, como exceção do participante ativo. */
  editElements(patches: { id: ID; patch: Partial<Element> }[]): void;
  deleteElements(ids: ID[]): void;
  duplicateElements(ids: ID[], offset?: number): void;
  copySelection(): void;
  paste(): void;
  reorder(ids: ID[], where: "forward" | "backward" | "front" | "back"): void;
  groupSelection(): void;
  ungroupSelection(): void;

  ensureColumn(key: string, label: string): Column;
  addColumn(label: string): Column;
  renameColumn(id: ID, label: string): void;
  deleteColumn(id: ID): void;
  addParticipants(list: Participant[], columns?: Column[], replace?: boolean): void;
  addEmptyParticipant(): ID;
  updateCell(participantId: ID, columnId: ID, value: string): void;
  updateCells(changes: { participantId: ID; columnId: ID; value: string }[]): void;
  deleteParticipants(ids: ID[]): void;
  duplicateParticipants(ids: ID[]): void;
  assignTemplate(ids: ID[], templateId: ID): void;

  addTemplate(template: Template): void;
  duplicateTemplate(id: ID): ID;
  renameTemplate(id: ID, name: string): void;
  deleteTemplate(id: ID): void;
  setTemplateRules(rules: TemplateRule[]): void;
  /** Reaplica as regras (todos os participantes ou só `ids`); retorna quantos mudaram. */
  applyTemplateRules(ids?: ID[]): number;

  addGuide(guide: Omit<Guide, "id">): ID;
  moveGuide(id: ID, pos: number): void;
  removeGuide(id: ID): void;
  clearGuides(): void;

  /** Restaura o layout de uma versão (modelos, dados fixos, fontes, regras), mantendo os participantes. */
  restoreLayout(data: VersionData): void;

  addCustomFont(font: CustomFont): void;
  removeCustomFont(id: ID): void;

  setOverride(participantId: ID, elementId: ID, patch: ElementOverride): void;
  clearOverrides(participantId: ID, elementId?: ID): void;
}

export type WorkspaceStore = DocState & UiState & Actions;

const initialUi: UiState = {
  tab: "editor",
  activeTemplateId: null,
  selectedIds: [],
  activeParticipantId: null,
  individualMode: false,
  saveState: "saved",
  clipboard: [],
  selectedRowIds: new Set(),
  filteredRowIds: null,
};

function activeTemplate(draft: Draft<Project>, id: ID | null): Draft<Template> {
  return draft.templates.find((t) => t.id === id) ?? draft.templates[0];
}

export const useWorkspace = create<WorkspaceStore>()(
  temporal(
    (set, get) => {
      const mutate = (recipe: (d: Draft<Project>) => void) => {
        const { project } = get();
        if (!project) return;
        const changed = produce(project, recipe);
        // Nada mudou: não cria passo de desfazer nem marca como alterado.
        if (changed === project) return;
        const next = produce(changed, (d) => {
          d.updatedAt = Date.now();
        });
        set({ project: next, saveState: "dirty" });
      };
      const updateTemplate = (recipe: (t: Draft<Template>) => void, templateId?: ID) =>
        mutate((d) => recipe(activeTemplate(d, templateId ?? get().activeTemplateId)));

      return {
        project: null,
        ...initialUi,

        load(project) {
          set({
            ...initialUi,
            selectedRowIds: new Set(),
            project,
            activeTemplateId: project.templates[0]?.id ?? null,
            activeParticipantId: project.participants[0]?.id ?? null,
          });
          useWorkspace.temporal.getState().clear();
        },
        mutate,
        setUi(patch) {
          set(patch);
        },

        rename(name) {
          mutate((d) => {
            d.name = name.trim() || d.name;
          });
        },
        setGlobals(globals) {
          mutate((d) => {
            d.globals = globals;
          });
        },
        setExportSettings(patch) {
          mutate((d) => {
            Object.assign(d.exportSettings, patch);
          });
        },

        updateTemplate,
        setPage(page) {
          updateTemplate((t) => {
            t.page = page;
          });
        },
        setBackground(bg) {
          updateTemplate((t) => {
            t.background = bg;
          });
        },

        addElement(el) {
          updateTemplate((t) => {
            t.elements.push(el);
          });
          set({ selectedIds: [el.id] });
        },
        updateElement(id, patch) {
          get().updateElements([{ id, patch }]);
        },
        updateElements(patches) {
          updateTemplate((t) => {
            for (const { id, patch } of patches) {
              const el = t.elements.find((e) => e.id === id);
              if (el) Object.assign(el, patch);
            }
          });
        },
        editElements(patches) {
          const { individualMode, activeParticipantId } = get();
          if (!individualMode || !activeParticipantId) return get().updateElements(patches);
          if (!get().project?.participants.some((x) => x.id === activeParticipantId)) {
            // Participante não existe mais: sai do modo individual em vez de descartar a edição.
            set({ individualMode: false, activeParticipantId: get().project?.participants[0]?.id ?? null });
            return get().updateElements(patches);
          }
          mutate((d) => {
            const p = d.participants.find((x) => x.id === activeParticipantId);
            if (!p) return;
            for (const { id, patch } of patches) {
              const ov: Record<string, unknown> = { ...(p.overrides[id] ?? {}) };
              for (const k of OVERRIDABLE) if (k in patch) ov[k] = (patch as Record<string, unknown>)[k];
              p.overrides[id] = ov as ElementOverride;
            }
          });
        },
        deleteElements(ids) {
          const set_ = new Set(ids);
          mutate((d) => {
            for (const t of d.templates) t.elements = t.elements.filter((e) => !set_.has(e.id));
            for (const p of d.participants) for (const id of ids) delete p.overrides[id];
          });
          set({ selectedIds: get().selectedIds.filter((id) => !set_.has(id)) });
        },
        duplicateElements(ids, offset = 12) {
          const created: ID[] = [];
          updateTemplate((t) => {
            const groupMap = new Map<ID, ID>();
            for (const el of t.elements.filter((e) => ids.includes(e.id))) {
              const copy = { ...structuredClone(current(el)), id: newId(), x: el.x + offset, y: el.y + offset, name: `${el.name} (cópia)`, locked: false };
              if (el.groupId) {
                if (!groupMap.has(el.groupId)) groupMap.set(el.groupId, newId());
                copy.groupId = groupMap.get(el.groupId);
              }
              t.elements.push(copy as Draft<Element>);
              created.push(copy.id);
            }
          });
          set({ selectedIds: created });
        },
        copySelection() {
          const { project, selectedIds, activeTemplateId } = get();
          const t = project?.templates.find((x) => x.id === activeTemplateId) ?? project?.templates[0];
          if (!t) return;
          set({ clipboard: t.elements.filter((e) => selectedIds.includes(e.id)).map((e) => structuredClone(e)) });
        },
        paste() {
          const { clipboard } = get();
          if (!clipboard.length) return;
          const created: ID[] = [];
          updateTemplate((t) => {
            for (const el of clipboard) {
              const copy = { ...structuredClone(el), id: newId(), x: el.x + 12, y: el.y + 12, groupId: undefined };
              t.elements.push(copy as Draft<Element>);
              created.push(copy.id);
            }
          });
          set({ selectedIds: created, clipboard: clipboard.map((e) => ({ ...e, x: e.x + 12, y: e.y + 12 })) });
        },
        reorder(ids, where) {
          updateTemplate((t) => {
            const sel = new Set(ids);
            const els = t.elements;
            if (where === "front" || where === "back") {
              const picked = els.filter((e) => sel.has(e.id));
              const rest = els.filter((e) => !sel.has(e.id));
              t.elements = where === "front" ? [...rest, ...picked] : [...picked, ...rest];
              return;
            }
            const order = where === "forward" ? [...els.keys()].reverse() : [...els.keys()];
            for (const i of order) {
              const j = where === "forward" ? i + 1 : i - 1;
              if (!sel.has(els[i].id) || j < 0 || j >= els.length || sel.has(els[j].id)) continue;
              [els[i], els[j]] = [els[j], els[i]];
            }
          });
        },
        groupSelection() {
          const ids = get().selectedIds;
          if (ids.length < 2) return;
          const gid = newId();
          updateTemplate((t) => {
            for (const e of t.elements) if (ids.includes(e.id)) e.groupId = gid;
          });
        },
        ungroupSelection() {
          const ids = get().selectedIds;
          updateTemplate((t) => {
            for (const e of t.elements) if (ids.includes(e.id)) delete e.groupId;
          });
        },

        ensureColumn(key, label) {
          const existing = get().project?.columns.find((c) => c.key === key);
          if (existing) return existing;
          const col: Column = { id: newId(), key, label };
          mutate((d) => {
            d.columns.push(col);
          });
          return col;
        },
        addColumn(label) {
          const keys = get().project?.columns.map((c) => c.key) ?? [];
          const col: Column = { id: newId(), key: uniqueKey(slugify(label), keys), label: label.trim() || "Nova coluna" };
          mutate((d) => {
            d.columns.push(col);
          });
          return col;
        },
        renameColumn(id, label) {
          mutate((d) => {
            const c = d.columns.find((x) => x.id === id);
            if (c) c.label = label.trim() || c.label;
          });
        },
        deleteColumn(id) {
          mutate((d) => {
            d.columns = d.columns.filter((c) => c.id !== id);
            for (const p of d.participants) delete p.values[id];
          });
        },
        addParticipants(list, columns, replace = false) {
          const project = get().project;
          // Participantes novos seguem as regras de modelo (ex.: por categoria), no mesmo passo de desfazer.
          const assigned = project
            ? new Map(templateAssignments({ ...project, participants: list }).map((a) => [a.participantId, a.templateId]))
            : new Map<ID, ID>();
          const withTemplates = assigned.size ? list.map((p) => (assigned.has(p.id) ? { ...p, templateId: assigned.get(p.id)! } : p)) : list;
          mutate((d) => {
            if (columns) d.columns = columns;
            d.participants = replace ? withTemplates : [...d.participants, ...withTemplates];
          });
          const after = get();
          if (!after.project?.participants.some((p) => p.id === after.activeParticipantId)) {
            set({ activeParticipantId: after.project?.participants[0]?.id ?? null });
          }
        },
        addEmptyParticipant() {
          const id = newId();
          mutate((d) => {
            d.participants.push({ id, values: {}, templateId: activeTemplate(d, get().activeTemplateId).id, overrides: {} });
          });
          return id;
        },
        updateCell(participantId, columnId, value) {
          get().updateCells([{ participantId, columnId, value }]);
        },
        updateCells(changes) {
          mutate((d) => {
            const byId = new Map(d.participants.map((p) => [p.id, p]));
            for (const ch of changes) {
              const p = byId.get(ch.participantId);
              if (p && (p.values[ch.columnId] ?? "") !== ch.value) p.values[ch.columnId] = ch.value;
            }
          });
        },
        deleteParticipants(ids) {
          const del = new Set(ids);
          mutate((d) => {
            d.participants = d.participants.filter((p) => !del.has(p.id));
          });
          const { project, activeParticipantId, selectedRowIds } = get();
          set({
            selectedRowIds: new Set([...selectedRowIds].filter((id) => !del.has(id))),
            activeParticipantId: activeParticipantId && del.has(activeParticipantId) ? (project?.participants[0]?.id ?? null) : activeParticipantId,
          });
        },
        duplicateParticipants(ids) {
          mutate((d) => {
            const out: Draft<Participant>[] = [];
            for (const p of d.participants) {
              out.push(p);
              if (ids.includes(p.id)) out.push({ ...structuredClone(current(p)), id: newId() } as Draft<Participant>);
            }
            d.participants = out;
          });
        },
        assignTemplate(ids, templateId) {
          const s = new Set(ids);
          mutate((d) => {
            for (const p of d.participants) if (s.has(p.id)) p.templateId = templateId;
          });
        },

        addTemplate(template) {
          mutate((d) => {
            d.templates.push(template as Draft<Template>);
          });
          set({ activeTemplateId: template.id, selectedIds: [] });
        },
        duplicateTemplate(id) {
          const newTemplateId = newId();
          mutate((d) => {
            const src = d.templates.find((t) => t.id === id);
            if (!src) return;
            const copy = structuredClone(current(src));
            const groups = new Map<ID, ID>();
            copy.id = newTemplateId;
            copy.name = `${src.name} (cópia)`;
            copy.elements = copy.elements.map((e) => {
              const groupId = e.groupId ? (groups.get(e.groupId) ?? groups.set(e.groupId, newId()).get(e.groupId)) : undefined;
              return { ...e, id: newId(), groupId };
            });
            copy.guides = (copy.guides ?? []).map((g) => ({ ...g, id: newId() }));
            d.templates.push(copy as Draft<Template>);
          });
          set({ activeTemplateId: newTemplateId, selectedIds: [] });
          return newTemplateId;
        },
        renameTemplate(id, name) {
          mutate((d) => {
            const t = d.templates.find((x) => x.id === id);
            if (t && name.trim()) t.name = name.trim();
          });
        },
        deleteTemplate(id) {
          const project = get().project;
          if (!project || project.templates.length <= 1) return;
          mutate((d) => {
            d.templates = d.templates.filter((t) => t.id !== id);
            const fallback = d.templates[0].id;
            for (const p of d.participants) if (p.templateId === id) p.templateId = fallback;
            d.templateRules = d.templateRules.filter((r) => r.templateId !== id);
          });
          if (get().activeTemplateId === id) set({ activeTemplateId: get().project!.templates[0].id, selectedIds: [] });
        },
        setTemplateRules(rules) {
          mutate((d) => {
            d.templateRules = rules;
          });
        },
        applyTemplateRules(ids) {
          const project = get().project;
          if (!project) return 0;
          const changes = templateAssignments(project, ids);
          if (!changes.length) return 0;
          const byId = new Map(changes.map((c) => [c.participantId, c.templateId]));
          mutate((d) => {
            for (const p of d.participants) {
              const t = byId.get(p.id);
              if (t) p.templateId = t;
            }
          });
          return changes.length;
        },

        addGuide(guide) {
          const id = newId();
          updateTemplate((t) => {
            t.guides.push({ ...guide, id });
          });
          return id;
        },
        moveGuide(id, pos) {
          updateTemplate((t) => {
            const g = t.guides.find((x) => x.id === id);
            if (g) g.pos = pos;
          });
        },
        removeGuide(id) {
          updateTemplate((t) => {
            t.guides = t.guides.filter((g) => g.id !== id);
          });
        },
        clearGuides() {
          updateTemplate((t) => {
            t.guides = [];
          });
        },

        restoreLayout(data) {
          const project = get().project;
          if (!project) return;
          const restored = restoreVersion(project, data);
          mutate((d) => {
            d.templates = restored.templates as Draft<Template>[];
            d.globals = restored.globals;
            d.customFonts = restored.customFonts;
            d.templateRules = restored.templateRules;
            d.participants = restored.participants as Draft<Participant>[];
          });
          // Mantém o modelo aberto, se ele existir na versão restaurada.
          const templates = get().project?.templates ?? [];
          const active = templates.some((t) => t.id === get().activeTemplateId) ? get().activeTemplateId : (templates[0]?.id ?? null);
          set({ selectedIds: [], individualMode: false, activeTemplateId: active });
        },

        addCustomFont(font) {
          mutate((d) => {
            d.customFonts.push(font);
          });
        },
        removeCustomFont(id) {
          mutate((d) => {
            d.customFonts = d.customFonts.filter((f) => f.id !== id);
          });
        },

        setOverride(participantId, elementId, patch) {
          mutate((d) => {
            const p = d.participants.find((x) => x.id === participantId);
            if (p) p.overrides[elementId] = { ...(p.overrides[elementId] ?? {}), ...patch };
          });
        },
        clearOverrides(participantId, elementId) {
          mutate((d) => {
            const p = d.participants.find((x) => x.id === participantId);
            if (!p) return;
            if (elementId) delete p.overrides[elementId];
            else p.overrides = {};
          });
        },
      };
    },
    {
      partialize: (s) => ({ project: s.project }),
      equality: (a, b) => a.project === b.project,
      limit: 150,
    },
  ),
);

export function useActiveTemplate(): Template | null {
  return useWorkspace((s) => s.project?.templates.find((t) => t.id === s.activeTemplateId) ?? s.project?.templates[0] ?? null);
}

export function useActiveParticipant(): Participant | null {
  return useWorkspace((s) => s.project?.participants.find((p) => p.id === s.activeParticipantId) ?? null);
}

/** Após desfazer/refazer, seleção e participante ativo podem apontar para itens que não existem mais. */
function revalidateUi() {
  const s = useWorkspace.getState();
  const p = s.project;
  if (!p) return;
  const template = p.templates.find((t) => t.id === s.activeTemplateId) ?? p.templates[0];
  const elementIds = new Set(template?.elements.map((e) => e.id));
  const participantIds = new Set(p.participants.map((x) => x.id));
  const patch: Partial<UiState> = {};
  if (template.id !== s.activeTemplateId) patch.activeTemplateId = template.id;
  if (s.selectedIds.some((id) => !elementIds.has(id))) patch.selectedIds = s.selectedIds.filter((id) => elementIds.has(id));
  if (s.activeParticipantId && !participantIds.has(s.activeParticipantId)) {
    patch.activeParticipantId = p.participants[0]?.id ?? null;
    patch.individualMode = false;
  }
  if ([...s.selectedRowIds].some((id) => !participantIds.has(id))) patch.selectedRowIds = new Set([...s.selectedRowIds].filter((id) => participantIds.has(id)));
  if (Object.keys(patch).length) useWorkspace.setState(patch);
}

export const undo = () => {
  useWorkspace.temporal.getState().undo();
  revalidateUi();
};
export const redo = () => {
  useWorkspace.temporal.getState().redo();
  revalidateUi();
};
