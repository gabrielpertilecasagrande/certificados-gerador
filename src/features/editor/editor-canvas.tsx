"use client";

import Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ellipse, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Transformer } from "react-konva";
import type { Element, ImageElement, ShapeElement, Template } from "@/lib/model/types";
import { drawTextLines, type Drawable } from "@/lib/render/canvas";
import { backgroundRect } from "@/lib/render/geometry";
import { layoutText } from "@/lib/render/layout";
import type { ResolvedCertificate, ResolvedItem, ResolvedText } from "@/lib/render/resolve";
import { getBackgroundDrawable, getImageBitmap } from "@/lib/runtime/assets";
import { browserFonts } from "@/lib/runtime/fonts";
import { useWorkspace } from "@/features/workspace/store";
import { snapBox, type Guide } from "./snapping";
import { MAX_ZOOM, MIN_ZOOM, useView } from "./view-store";

const PRIMARY = "#2563eb";
const DANGER = "#dc2626";
const AMBER = "#d97706";

interface Props {
  template: Template;
  cert: ResolvedCertificate | null;
  /** Elementos com exceção individual para o participante exibido. */
  overriddenIds: Set<string>;
  individualMode: boolean;
}

function useContainerSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

function useDrawable(load: (() => Promise<Drawable>) | null, key: string): Drawable | null {
  const [state, setState] = useState<{ key: string; img: Drawable } | null>(null);
  useEffect(() => {
    if (!load) return;
    let alive = true;
    load()
      .then((img) => alive && setState({ key, img }))
      .catch((e) => console.error(e));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifica a carga
  }, [key]);
  // Mantém a imagem anterior enquanto a nova resolução carrega (sem piscar).
  return state?.img ?? null;
}

export function EditorCanvas({ template, cert, overriddenIds, individualMode }: Props) {
  const { ref, size } = useContainerSize();
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const { zoom, fitNonce, showMargins, showGuides, snap, showBackground } = useView();
  const setView = useView((s) => s.set);
  const [offset, setOffset] = useState({ x: 40, y: 40 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const panning = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const selectedIds = useWorkspace((s) => s.selectedIds);
  const setUi = useWorkspace((s) => s.setUi);
  const editElements = useWorkspace((s) => s.editElements);

  const W = template.page.widthPt;
  const H = template.page.heightPt;

  // Ajustar à tela: ao abrir, ao mudar o tamanho da página e quando pedido.
  const fit = useCallback(() => {
    if (!size.width || !size.height) return;
    const z = Math.min((size.width - 96) / W, (size.height - 96) / H);
    const zoomFit = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    setView({ zoom: zoomFit });
    setOffset({ x: (size.width - W * zoomFit) / 2, y: (size.height - H * zoomFit) / 2 });
  }, [size.width, size.height, W, H, setView]);

  const hasSize = size.width > 0;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza a vista com o tamanho do contêiner
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce, hasSize, W, H]);

  // Zoom por botões mantém o centro da área visível.
  const prevZoom = useRef(zoom);
  useEffect(() => {
    const prev = prevZoom.current;
    prevZoom.current = zoom;
    if (prev === zoom || !size.width) return;
    const cx = size.width / 2;
    const cy = size.height / 2;
    setOffset((o) => ({ x: cx - ((cx - o.x) / prev) * zoom, y: cy - ((cy - o.y) / prev) * zoom }));
  }, [zoom, size.width, size.height]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]")) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpaceDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Fundo renderizado na resolução de exibição.
  const bg = template.background;
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const bgWidthPx = Math.round(W * zoom * dpr);
  const bgBucket = Math.ceil(bgWidthPx / 512);
  const bgImage = useDrawable(
    bg ? () => getBackgroundDrawable(bg, bgBucket * 512) : null,
    bg ? `${bg.assetId}#${bg.pdfPage}@${bg.kind === "pdf" ? bgBucket : 0}` : "none",
  );
  const bgBox = bg ? backgroundRect(bg, template.page) : null;

  const items = useMemo(() => cert?.items ?? [], [cert]);
  const elementsById = useMemo(() => new Map(template.elements.map((e) => [e.id, e])), [template.elements]);

  // Liga o Transformer aos nós selecionados.
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = selectedIds
      .map((id) => stage.findOne(`#el-${id}`))
      .filter((n): n is Konva.Node => !!n && n.draggable());
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, items]);

  const single = selectedIds.length === 1 ? elementsById.get(selectedIds[0]) : undefined;

  const selectElement = (el: Element, additive: boolean) => {
    const groupIds = el.groupId ? template.elements.filter((e) => e.groupId === el.groupId).map((e) => e.id) : [el.id];
    if (additive) {
      const has = selectedIds.includes(el.id);
      setUi({ selectedIds: has ? selectedIds.filter((id) => !groupIds.includes(id)) : [...new Set([...selectedIds, ...groupIds])] });
    } else if (!selectedIds.includes(el.id)) {
      setUi({ selectedIds: groupIds });
    }
  };

  const toPage = (p: { x: number; y: number }) => ({ x: (p.x - offset.x) / zoom, y: (p.y - offset.y) / zoom });

  const commitPositions = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const patches = selectedIds
      .map((id) => {
        const n = stage.findOne(`#el-${id}`);
        return n ? { id, patch: { x: n.x(), y: n.y() } } : null;
      })
      .filter((p): p is { id: string; patch: { x: number; y: number } } => !!p);
    if (patches.length) editElements(patches);
  };

  const onDragMove = (e: Konva.KonvaEventObject<DragEvent>, el: Element) => {
    if (!snap || selectedIds.length > 1 || el.rotation % 360 !== 0) return;
    const node = e.target;
    const box = { x: node.x(), y: node.y(), width: el.width, height: el.height };
    const others = template.elements.filter((o) => o.id !== el.id);
    const r = snapBox(box, template, others, 6 / zoom);
    if (r.dx || r.dy) node.position({ x: node.x() + r.dx, y: node.y() + r.dy });
    setGuides(r.guides);
  };

  const onTransformEnd = (el: Element, node: Konva.Node) => {
    const sx = node.scaleX();
    const sy = node.scaleY();
    node.scale({ x: 1, y: 1 });
    const box = (node as Konva.Group).findOne<Konva.Rect>(".box");
    const baseW = box ? box.width() : el.width;
    const baseH = box ? box.height() : el.height;
    const width = Math.max(4, baseW * (box && el.type === "text" ? 1 : sx));
    const height = el.type === "line" ? 0 : Math.max(4, baseH * (box && el.type === "text" ? 1 : sy));
    editElements([{ id: el.id, patch: { x: node.x(), y: node.y(), width, height, rotation: node.rotation() } }]);
  };

  // Durante o redimensionamento de textos, converte a escala em largura/altura para re-diagramar ao vivo.
  const [liveBox, setLiveBox] = useState<{ id: string; width: number; height: number } | null>(null);
  const onTextTransform = (el: Element, node: Konva.Node) => {
    const box = (node as Konva.Group).findOne<Konva.Rect>(".box");
    if (!box) return;
    const width = Math.max(4, box.width() * node.scaleX());
    const height = Math.max(4, box.height() * node.scaleY());
    node.scale({ x: 1, y: 1 });
    box.size({ width, height });
    setLiveBox({ id: el.id, width, height });
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const pointer = stage.getPointerPosition() ?? { x: size.width / 2, y: size.height / 2 };
      const factor = Math.exp(-e.evt.deltaY * 0.0025);
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
      prevZoom.current = z;
      setOffset({ x: pointer.x - ((pointer.x - offset.x) / zoom) * z, y: pointer.y - ((pointer.y - offset.y) / zoom) * z });
      setView({ zoom: z });
    } else {
      setOffset((o) => ({ x: o.x - (e.evt.shiftKey ? e.evt.deltaY : e.evt.deltaX), y: o.y - (e.evt.shiftKey ? 0 : e.evt.deltaY) }));
    }
  };

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    if (spaceDown || e.evt.button === 1) {
      panning.current = { x: pos.x, y: pos.y, ox: offset.x, oy: offset.y };
      return;
    }
    const target = e.target;
    const clickedEmpty = target === stage || target.hasName("page") || target.hasName("background");
    if (clickedEmpty) {
      if (!e.evt.shiftKey) setUi({ selectedIds: [] });
      const p = toPage(pos);
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    }
  };

  const onStageMouseMove = () => {
    const stage = stageRef.current;
    const pos = stage?.getPointerPosition();
    if (!pos) return;
    if (panning.current) {
      const p = panning.current;
      setOffset({ x: p.ox + pos.x - p.x, y: p.oy + pos.y - p.y });
      return;
    }
    if (marquee) {
      const p = toPage(pos);
      setMarquee({ ...marquee, x1: p.x, y1: p.y });
    }
  };

  const onStageMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
    panning.current = null;
    if (!marquee) return;
    const x0 = Math.min(marquee.x0, marquee.x1);
    const x1 = Math.max(marquee.x0, marquee.x1);
    const y0 = Math.min(marquee.y0, marquee.y1);
    const y1 = Math.max(marquee.y0, marquee.y1);
    setMarquee(null);
    if (x1 - x0 < 2 && y1 - y0 < 2) return;
    const hit = template.elements
      .filter((el) => !el.hidden && !el.locked && el.x < x1 && el.x + el.width > x0 && el.y < y1 && el.y + Math.max(el.height, 1) > y0)
      .map((el) => el.id);
    setUi({ selectedIds: e.evt.shiftKey ? [...new Set([...selectedIds, ...hit])] : hit });
  };

  const renderItem = (item: ResolvedItem) => {
    const el = item.el;
    const selected = selectedIds.includes(el.id);
    const overridden = overriddenIds.has(el.id);
    const common = {
      id: `el-${el.id}`,
      x: el.x,
      y: el.y,
      rotation: el.rotation,
      draggable: !el.locked && !spaceDown,
      listening: !el.locked,
      onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (spaceDown || e.evt.button !== 0) return;
        e.cancelBubble = true;
        selectElement(el, e.evt.shiftKey);
      },
      onTap: () => selectElement(el, false),
      onDblClick: () => {
        if (el.type === "text") window.dispatchEvent(new CustomEvent("cert:focus-content"));
      },
      onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => onDragMove(e, el),
      onDragEnd: () => {
        setGuides([]);
        commitPositions();
      },
      onMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>) => {
        const c = e.target.getStage()?.container();
        if (c && !el.locked) c.style.cursor = "move";
      },
      onMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>) => {
        const c = e.target.getStage()?.container();
        if (c) c.style.cursor = "";
      },
    };
    const outline = (w: number, h: number, overflow = false) =>
      overflow || overridden ? (
        <Rect
          width={w}
          height={Math.max(h, 1)}
          stroke={overflow ? DANGER : AMBER}
          strokeWidth={1.25 / zoom}
          dash={[4 / zoom, 3 / zoom]}
          listening={false}
          strokeScaleEnabled={false}
        />
      ) : null;

    if (item.kind === "text") {
      const live = liveBox?.id === el.id ? liveBox : null;
      return (
        <TextNode
          key={el.id}
          item={item}
          width={live?.width ?? el.width}
          height={live?.height ?? el.height}
          common={common}
          outline={outline}
          selected={selected}
          zoom={zoom}
          onTransform={(n) => onTextTransform(el, n)}
          onTransformEnd={(n) => {
            setLiveBox(null);
            onTransformEnd(el, n);
          }}
        />
      );
    }
    if (el.type === "image") {
      return (
        <ImageNode key={el.id} el={el} common={common} onTransformEnd={(n) => onTransformEnd(el, n)}>
          {outline(el.width, el.height)}
        </ImageNode>
      );
    }
    const s = el as ShapeElement;
    return (
      <Group key={el.id} {...common} opacity={s.opacity} onTransformEnd={(e) => onTransformEnd(el, e.target)}>
        {s.type === "line" ? (
          <>
            <Rect name="box" width={s.width} height={Math.max(s.strokeWidth, 6 / zoom)} y={-Math.max(s.strokeWidth, 6 / zoom) / 2} fill="transparent" />
            <Line points={[0, 0, s.width, 0]} stroke={s.stroke ?? "#000"} strokeWidth={s.strokeWidth} listening={false} />
          </>
        ) : s.type === "ellipse" ? (
          <>
            <Rect name="box" width={s.width} height={s.height} fill="transparent" />
            <Ellipse
              x={s.width / 2}
              y={s.height / 2}
              radiusX={s.width / 2}
              radiusY={s.height / 2}
              fill={s.fill ?? undefined}
              stroke={s.stroke ?? undefined}
              strokeWidth={s.stroke ? s.strokeWidth : 0}
              listening={false}
            />
          </>
        ) : (
          <Rect
            name="box"
            width={s.width}
            height={s.height}
            fill={s.fill ?? "transparent"}
            stroke={s.stroke ?? undefined}
            strokeWidth={s.stroke ? s.strokeWidth : 0}
            cornerRadius={s.cornerRadius}
          />
        )}
        {outline(s.width, s.height)}
      </Group>
    );
  };

  const cursor = spaceDown ? "grab" : undefined;

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden bg-canvas" style={{ cursor }} data-testid="editor-canvas">
      {size.width > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          onWheel={handleWheel}
          onMouseDown={onStageMouseDown}
          onMouseMove={onStageMouseMove}
          onMouseUp={onStageMouseUp}
          onMouseLeave={() => (panning.current = null)}
        >
          <Layer>
            <Group x={offset.x} y={offset.y} scaleX={zoom} scaleY={zoom}>
              <Rect
                name="page"
                width={W}
                height={H}
                fill="#ffffff"
                shadowColor="#101828"
                shadowBlur={24 / zoom}
                shadowOpacity={0.12}
                shadowOffsetY={4 / zoom}
              />
              <Group clipX={0} clipY={0} clipWidth={W} clipHeight={H}>
                {bg && bg.visible && showBackground && bgImage && bgBox && (
                  <KImage name="background" image={bgImage as CanvasImageSource} x={bgBox.x} y={bgBox.y} width={bgBox.width} height={bgBox.height} listening={false} />
                )}
              </Group>
              {showMargins && (
                <Rect
                  x={template.marginPt}
                  y={template.marginPt}
                  width={W - 2 * template.marginPt}
                  height={H - 2 * template.marginPt}
                  stroke="#60a5fa"
                  strokeWidth={1 / zoom}
                  dash={[6 / zoom, 4 / zoom]}
                  listening={false}
                />
              )}
              {showGuides && single && !single.locked && (
                <>
                  <Line points={[W / 2, 0, W / 2, H]} stroke="#93c5fd" strokeWidth={0.75 / zoom} dash={[3 / zoom, 3 / zoom]} listening={false} />
                  <Line points={[0, H / 2, W, H / 2]} stroke="#93c5fd" strokeWidth={0.75 / zoom} dash={[3 / zoom, 3 / zoom]} listening={false} />
                </>
              )}
              {items.map(renderItem)}
              {guides.map((g, i) =>
                g.orientation === "v" ? (
                  <Line key={i} points={[g.pos, -2000, g.pos, H + 2000]} stroke="#ec4899" strokeWidth={1 / zoom} listening={false} />
                ) : (
                  <Line key={i} points={[-2000, g.pos, W + 2000, g.pos]} stroke="#ec4899" strokeWidth={1 / zoom} listening={false} />
                ),
              )}
              {marquee && (
                <Rect
                  x={Math.min(marquee.x0, marquee.x1)}
                  y={Math.min(marquee.y0, marquee.y1)}
                  width={Math.abs(marquee.x1 - marquee.x0)}
                  height={Math.abs(marquee.y1 - marquee.y0)}
                  fill="rgba(37,99,235,0.08)"
                  stroke={PRIMARY}
                  strokeWidth={1 / zoom}
                  listening={false}
                />
              )}
            </Group>
            <Transformer
              ref={trRef}
              rotateEnabled
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={4}
              flipEnabled={false}
              keepRatio={single?.type === "image" && (single as ImageElement).keepRatio}
              enabledAnchors={
                single?.type === "line"
                  ? ["middle-left", "middle-right"]
                  : ["top-left", "top-center", "top-right", "middle-right", "middle-left", "bottom-left", "bottom-center", "bottom-right"]
              }
              anchorSize={8}
              anchorCornerRadius={2}
              anchorStroke={individualMode ? AMBER : PRIMARY}
              borderStroke={individualMode ? AMBER : PRIMARY}
              anchorFill="#fff"
              padding={0}
              ignoreStroke
              boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 0.5 ? oldBox : newBox)}
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
}

type Common = Record<string, unknown> & { id: string };

function TextNode({
  item,
  width,
  height,
  common,
  outline,
  selected,
  zoom,
  onTransform,
  onTransformEnd,
}: {
  item: ResolvedText;
  width: number;
  height: number;
  common: Common;
  outline: (w: number, h: number, overflow?: boolean) => React.ReactNode;
  selected: boolean;
  zoom: number;
  onTransform: (n: Konva.Node) => void;
  onTransformEnd: (n: Konva.Node) => void;
}) {
  const { el } = item;
  const layout = useMemo(() => {
    if (width === el.width && height === el.height) return item.layout;
    return layoutText({
      text: item.text,
      font: browserFonts.get(item.fontFile),
      fontSize: el.fontSize,
      letterSpacing: el.letterSpacing,
      lineHeight: el.lineHeight,
      align: el.align,
      verticalAlign: el.verticalAlign,
      padding: el.padding,
      width,
      height,
      fit: el.fit,
      textTransform: el.textTransform,
    });
  }, [item, el, width, height]);

  return (
    <Group {...common} onTransform={(e) => onTransform(e.target)} onTransformEnd={(e) => onTransformEnd(e.target)}>
      <Rect name="box" width={width} height={height} fill="transparent" />
      {!selected && !layout.overflow && (
        <Rect width={width} height={height} stroke="#2563eb" strokeWidth={0.75 / zoom} opacity={0.18} dash={[2 / zoom, 2 / zoom]} listening={false} />
      )}
      <Shape
        listening={false}
        sceneFunc={(ctx) => {
          drawTextLines((ctx as unknown as { _context: CanvasRenderingContext2D })._context, { el, fontFile: item.fontFile, layout });
        }}
      />
      {outline(width, height, layout.overflow)}
    </Group>
  );
}

function ImageNode({
  el,
  common,
  onTransformEnd,
  children,
}: {
  el: ImageElement;
  common: Common;
  onTransformEnd: (n: Konva.Node) => void;
  children?: React.ReactNode;
}) {
  const img = useDrawable(() => getImageBitmap(el.assetId), el.assetId);
  return (
    <Group {...common} opacity={el.opacity} onTransformEnd={(e) => onTransformEnd(e.target)}>
      <Rect name="box" width={el.width} height={el.height} fill={img ? "transparent" : "#f1f3f6"} />
      {img && <KImage image={img as CanvasImageSource} width={el.width} height={el.height} listening={false} />}
      {children}
    </Group>
  );
}
