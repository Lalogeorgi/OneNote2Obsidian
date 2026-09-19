import { SpatialBounds } from "../geometry/Bounds";
import { AssetId, ObjectId } from "./Ids";
import type { CanonicalStickyNote } from "./CanonicalStickyNote";

/**
 * Text Run formatting styling flags and attributes.
 */
export interface CanonicalTextStyle {
  readonly fontFamily?: string;
  readonly fontSize?: number; // Points (pt)
  readonly fontColor?: string; // Hex (#000000)
  readonly highlightColor?: string; // Hex (#FFFF00)
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strikethrough?: boolean;
  readonly superscript?: boolean;
  readonly subscript?: boolean;
}

export interface CanonicalHyperlink {
  readonly type: "external" | "internal-page" | "internal-paragraph";
  readonly target: string; // URL or target PageId/ObjectId
  readonly title?: string;
}

export interface CanonicalTextRun {
  readonly text: string;
  readonly style?: CanonicalTextStyle;
  readonly hyperlink?: CanonicalHyperlink;
}

export type BulletType =
  | "none"
  | "disc"
  | "circle"
  | "square"
  | "diamond"
  | "arrow"
  | "dash"
  | "star"
  | "number"
  | "letter"
  | "roman"
  | "checkbox";

export interface CanonicalParagraph {
  readonly id: ObjectId;
  readonly indentLevel: number;
  readonly bulletType?: BulletType;
  readonly bulletChar?: string;
  readonly isTaskChecked?: boolean;
  readonly runs: readonly CanonicalTextRun[];
}

/**
 * Freeform Outline / Text block container.
 */
export interface CanonicalOutline {
  readonly type: "outline";
  readonly id: ObjectId;
  readonly bounds: SpatialBounds;
  readonly paragraphs: readonly CanonicalParagraph[];
}

/**
 * Embedded Raster Bitmap Image or Vector Printout.
 */
export interface CanonicalImage {
  readonly type: "image";
  readonly id: ObjectId;
  readonly bounds: SpatialBounds;
  readonly assetId: AssetId;
  readonly mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/svg+xml";
  readonly originalFileName?: string;
  readonly altText?: string;
  readonly isBackgroundPrintout?: boolean;
}

/**
 * Single Ink Stroke consisting of ordered coordinate packets with pressure.
 */
export interface CanonicalInkPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number; // 0.0 to 1.0 (defaults to 0.5)
}

export type NoveltyInkEffect =
  "rainbow" | "galaxy" | "gold" | "silver" | "lava" | "ocean" | "rose_gold";

export type PenType = "ballpoint" | "gel" | "highlighter" | "pencil";

export interface CanonicalStroke {
  readonly id: ObjectId;
  readonly color: string; // Hex (#000000)
  readonly width: number; // Stroke width in logical points
  readonly points: readonly CanonicalInkPoint[];
  readonly penType?: PenType;
  readonly noveltyEffect?: NoveltyInkEffect;
}

/**
 * Vector Ink & Handwriting Stroke Group (ISF).
 */
export interface CanonicalInkStrokeGroup {
  readonly type: "ink";
  readonly id: ObjectId;
  readonly bounds: SpatialBounds;
  readonly isHighlighter: boolean;
  readonly strokes: readonly CanonicalStroke[];
  readonly penType?: PenType;
  readonly noveltyEffect?: NoveltyInkEffect;
}

/**
 * Multi-column OneNote Table Structure.
 */
export interface CanonicalTableCell {
  readonly id: ObjectId;
  readonly backgroundColor?: string;
  readonly colSpan?: number;
  readonly rowSpan?: number;
  readonly elements: readonly CanonicalElement[];
}

export interface CanonicalTableRow {
  readonly id: ObjectId;
  readonly cells: readonly CanonicalTableCell[];
}

export interface CanonicalTable {
  readonly type: "table";
  readonly id: ObjectId;
  readonly bounds: SpatialBounds;
  readonly columns: readonly { readonly width: number }[];
  readonly rows: readonly CanonicalTableRow[];
}

/**
 * Binary File Attachment.
 */
export interface CanonicalAttachment {
  readonly type: "attachment";
  readonly id: ObjectId;
  readonly bounds: SpatialBounds;
  readonly assetId: AssetId;
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly iconAssetId?: AssetId;
}

/**
 * Geometric Shape / Connector line.
 */
export type ShapeKind =
  | "rectangle"
  | "rounded_rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "double_arrow"
  | "triangle"
  | "right_triangle"
  | "diamond"
  | "star"
  | "callout"
  | "coordinate_system";

export interface CanonicalShape {
  readonly type: "shape";
  readonly id: ObjectId;
  readonly bounds: SpatialBounds;
  readonly shapeKind: ShapeKind;
  readonly fillColor?: string;
  readonly strokeColor?: string;
  readonly strokeWidth: number;
}

/**
 * Media container (Audio Recording, Embedded Video).
 */
export interface CanonicalMedia {
  readonly type: "media";
  readonly id: ObjectId;
  readonly bounds: SpatialBounds;
  readonly assetId: AssetId;
  readonly mediaType: "audio" | "video";
  readonly durationSeconds?: number;
}

/**
 * Union of all canonical OneNote spatial elements.
 */
export type CanonicalElement =
  | CanonicalOutline
  | CanonicalImage
  | CanonicalInkStrokeGroup
  | CanonicalTable
  | CanonicalAttachment
  | CanonicalShape
  | CanonicalMedia
  | CanonicalStickyNote;
