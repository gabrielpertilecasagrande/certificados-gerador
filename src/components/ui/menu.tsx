"use client";

import { DropdownMenu as M, ContextMenu as C } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuSub = M.Sub;

const contentCls =
  "z-50 min-w-48 overflow-hidden rounded-lg border border-border bg-surface p-1 text-sm shadow-pop animate-pop-in";
const itemCls =
  "flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-muted";

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content sideOffset={sideOffset} className={cn(contentCls, "max-h-[70vh] overflow-y-auto scrollbar-thin", className)} {...props} />
    </M.Portal>
  );
}

export function DropdownMenuItem({ className, danger, ...props }: React.ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return <M.Item className={cn(itemCls, danger && "text-danger [&_svg]:text-danger data-[highlighted]:bg-danger-soft", className)} {...props} />;
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted", className)} {...props} />;
}

export function DropdownMenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}

export function DropdownMenuSubTrigger({ className, ...props }: React.ComponentProps<typeof M.SubTrigger>) {
  return <M.SubTrigger className={cn(itemCls, "data-[state=open]:bg-surface-2", className)} {...props} />;
}

export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent className={cn(contentCls, className)} {...props} />
    </M.Portal>
  );
}

export const ContextMenu = C.Root;
export const ContextMenuTrigger = C.Trigger;

export function ContextMenuContent({ className, ...props }: React.ComponentProps<typeof C.Content>) {
  return (
    <C.Portal>
      <C.Content className={cn(contentCls, className)} {...props} />
    </C.Portal>
  );
}

export function ContextMenuItem({ className, danger, shortcut, children, ...props }: React.ComponentProps<typeof C.Item> & { danger?: boolean; shortcut?: string }) {
  return (
    <C.Item className={cn(itemCls, danger && "text-danger [&_svg]:text-danger data-[highlighted]:bg-danger-soft", className)} {...props}>
      {children}
      {shortcut && <span className="ml-auto pl-4 text-[11px] text-muted">{shortcut}</span>}
    </C.Item>
  );
}

export function ContextMenuSeparator() {
  return <C.Separator className="my-1 h-px bg-border" />;
}
