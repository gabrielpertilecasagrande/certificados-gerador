"use client";

import { ArrowDownToLine, ArrowUpToLine, ChevronDown, ChevronUp, ClipboardPaste, Copy, CopyPlus, Group, Lock, Trash2, Ungroup, Unlock } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/menu";
import { useActiveTemplate, useWorkspace } from "@/features/workspace/store";

/** Menu de contexto (botão direito) do canvas: age sobre a seleção atual. */
export function CanvasContextMenu({ children }: { children: React.ReactNode }) {
  const template = useActiveTemplate();
  const selectedIds = useWorkspace((s) => s.selectedIds);
  const clipboard = useWorkspace((s) => s.clipboard);
  const individualMode = useWorkspace((s) => s.individualMode);
  const s = useWorkspace.getState;
  const selected = template?.elements.filter((e) => selectedIds.includes(e.id)) ?? [];
  const has = selected.length > 0;
  const locked = has && selected.every((e) => e.locked);
  const grouped = selected.length > 1 && selected.every((e) => e.groupId && e.groupId === selected[0].groupId);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem disabled={!has} onSelect={() => s().copySelection()} shortcut="Ctrl+C">
          <Copy /> Copiar
        </ContextMenuItem>
        <ContextMenuItem disabled={!clipboard.length || individualMode} onSelect={() => s().paste()} shortcut="Ctrl+V">
          <ClipboardPaste /> Colar
        </ContextMenuItem>
        <ContextMenuItem disabled={!has || individualMode} onSelect={() => s().duplicateElements(selectedIds)} shortcut="Ctrl+D">
          <CopyPlus /> Duplicar
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!has || individualMode} onSelect={() => s().reorder(selectedIds, "front")}>
          <ArrowUpToLine /> Trazer para frente
        </ContextMenuItem>
        <ContextMenuItem disabled={!has || individualMode} onSelect={() => s().reorder(selectedIds, "forward")}>
          <ChevronUp /> Avançar
        </ContextMenuItem>
        <ContextMenuItem disabled={!has || individualMode} onSelect={() => s().reorder(selectedIds, "backward")}>
          <ChevronDown /> Recuar
        </ContextMenuItem>
        <ContextMenuItem disabled={!has || individualMode} onSelect={() => s().reorder(selectedIds, "back")}>
          <ArrowDownToLine /> Enviar para trás
        </ContextMenuItem>
        <ContextMenuSeparator />
        {grouped ? (
          <ContextMenuItem disabled={individualMode} onSelect={() => s().ungroupSelection()} shortcut="Ctrl+Shift+G">
            <Ungroup /> Desagrupar
          </ContextMenuItem>
        ) : (
          <ContextMenuItem disabled={selected.length < 2 || individualMode} onSelect={() => s().groupSelection()} shortcut="Ctrl+G">
            <Group /> Agrupar
          </ContextMenuItem>
        )}
        <ContextMenuItem
          disabled={!has || individualMode}
          onSelect={() => {
            s().updateElements(selected.map((e) => ({ id: e.id, patch: { locked: !locked } })));
            if (!locked) s().setUi({ selectedIds: [] });
          }}
        >
          {locked ? <Unlock /> : <Lock />} {locked ? "Desbloquear" : "Bloquear"}
        </ContextMenuItem>
        <ContextMenuItem danger disabled={!has || individualMode} onSelect={() => s().deleteElements(selectedIds)} shortcut="Del">
          <Trash2 /> Excluir
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
