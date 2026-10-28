/**
 * Modelo de documento — independente da interface.
 * Todas as medidas geométricas estão em pontos PDF (1 pt = 1/72 pol).
 */

export type ID = string;

export type PagePreset = "A4-landscape" | "A4-portrait" | "A5-landscape" | "A5-portrait" | "custom";

export interface PageSize {
  widthPt: number;
  heightPt: number;
  preset: PagePreset;
}

export interface Background {
  assetId: ID;
  kind: "pdf" | "image";
  /** Página (1-based) usada quando o fundo é um PDF de várias páginas. */
  pdfPage: number;
  /** Tamanho natural da página/imagem, em pt, usado para enquadramento. */
  naturalWidthPt: number;
  naturalHeightPt: number;
  /** stretch = ocupa a página toda; contain/cover mantêm a proporção. */
  fit: "stretch" | "contain" | "cover";
  visible: boolean;
  locked: boolean;
}

export type FitMode = "fixed" | "shrink" | "grow" | "wrap";

export interface TextFit {
  mode: FitMode;
  minSize: number;
  maxSize: number;
  maxLines: number;
}

export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize";
export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";

interface BaseElement {
  id: ID;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Graus, sentido horário, em torno do canto superior esquerdo (convenção Konva). */
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  groupId?: ID;
}

export interface TextElement extends BaseElement {
  type: "text";
  /** Conteúdo com variáveis, ex.: "Certificamos que {{nome}} participou…" */
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  color: string;
  letterSpacing: number;
  lineHeight: number;
  textTransform: TextTransform;
  align: HAlign;
  verticalAlign: VAlign;
  padding: number;
  fit: TextFit;
}

export interface ImageElement extends BaseElement {
  type: "image";
  assetId: ID;
  keepRatio: boolean;
}

export interface ShapeElement extends BaseElement {
  type: "rect" | "ellipse" | "line";
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  cornerRadius: number;
}

export type Element = TextElement | ImageElement | ShapeElement;
export type ElementType = Element["type"];

export interface Template {
  id: ID;
  name: string;
  page: PageSize;
  background: Background | null;
  elements: Element[];
  marginPt: number;
  /** Guias do editor (não são exportadas). */
  guides: Guide[];
}

export interface Guide {
  id: ID;
  orientation: "v" | "h";
  /** Posição em pt a partir da borda esquerda (v) ou superior (h). */
  pos: number;
}

/** Regra de associação: participantes com `value` na coluna `columnId` usam o modelo `templateId`. */
export interface TemplateRule {
  columnId: ID;
  value: string;
  templateId: ID;
}

/** Fonte enviada pelo usuário (TTF/OTF), guardada como asset do projeto. */
export interface CustomFont {
  id: ID;
  family: string;
  weight: number;
  italic: boolean;
  assetId: ID;
  fileName: string;
}

export interface Column {
  id: ID;
  /** Nome da variável usada em {{ }} (slug). */
  key: string;
  /** Rótulo exibido (normalmente o cabeçalho da planilha). */
  label: string;
}

export type ElementOverride = Partial<
  Pick<
    TextElement,
    "x" | "y" | "width" | "height" | "rotation" | "fontSize" | "content" | "align" | "lineHeight" | "letterSpacing"
  > & { fit: TextFit; hidden: boolean }
>;

export interface Participant {
  id: ID;
  /** Valores por column.id */
  values: Record<ID, string>;
  templateId: ID;
  overrides: Record<ID, ElementOverride>;
}

export interface GlobalVariable {
  id: ID;
  key: string;
  label: string;
  value: string;
}

export type ExportFormat = "pdf-zip" | "pdf-single" | "pdf-merged" | "png-zip" | "jpg-zip";
export type ZipLayout = "flat" | "by-template" | "by-column";

export interface ExportSettings {
  format: ExportFormat;
  fileNamePattern: string;
  zipLayout: ZipLayout;
  zipGroupColumnId: ID | null;
  dpi: number;
  jpgQuality: number;
}

export type ProjectStatus = "draft" | "ready" | "exported";

export interface Project {
  schemaVersion: 1;
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  status: ProjectStatus;
  templates: Template[];
  columns: Column[];
  participants: Participant[];
  globals: GlobalVariable[];
  exportSettings: ExportSettings;
  thumbnailAssetId: ID | null;
  lastExportAt: number | null;
  templateRules: TemplateRule[];
  customFonts: CustomFont[];
}

export interface ProjectSummary {
  id: ID;
  name: string;
  updatedAt: number;
  createdAt: number;
  status: ProjectStatus;
  participantCount: number;
  thumbnailAssetId: ID | null;
}

/** Cópia do layout do projeto (modelos e configurações), sem os participantes. */
export interface VersionData {
  templates: Template[];
  globals: GlobalVariable[];
  customFonts: CustomFont[];
  templateRules: TemplateRule[];
}

export interface ProjectVersion {
  id: ID;
  projectId: ID;
  createdAt: number;
  label: string;
  auto: boolean;
  data: VersionData;
}

export interface AssetRecord {
  id: ID;
  projectId: ID;
  mime: string;
  name: string;
  blob: Blob;
  createdAt: number;
}
