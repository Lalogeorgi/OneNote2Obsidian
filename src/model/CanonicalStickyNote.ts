import { SpatialBounds } from "../geometry/Bounds";
import { CanonicalParagraph } from "./CanonicalElements";
import { ObjectId, StickyNoteId } from "./Ids";

/**
 * Standard OneNote / Obsidian Sticky Note color palette presets.
 */
export type StickyNoteColorPreset =
  "yellow" | "green" | "pink" | "blue" | "purple" | "orange" | "teal" | "charcoal" | "gray";

/**
 * Visual styling theme for Sticky Note cards.
 */
export interface StickyNoteTheme {
  readonly variant?: "light" | "dark" | "auto";
  readonly cornerStyle?: "rounded" | "sharp" | "folded";
  readonly pinStyle?: "none" | "pushpin" | "tape" | "clip";
  readonly borderStyle?: "none" | "solid" | "dashed";
  readonly customHeaderColor?: string;
  readonly customTextColor?: string;
}

/**
 * Origin and provenance metadata for Sticky Notes.
 */
export interface StickyNoteSource {
  readonly origin: "created" | "imported-onenote" | "imported-canvas" | "synced-note";
  readonly sourceGuid?: string;
  readonly sourcePageId?: string;
  readonly originalAuthor?: string;
}

/**
 * Spatial behavior flags and layout constraints.
 */
export interface StickyNoteSpatialMeta {
  readonly isPinned?: boolean;
  readonly isFolded?: boolean;
  readonly autoResize?: boolean;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly isPoppedOut?: boolean;
  readonly floatingBounds?: SpatialBounds;
}

/**
 * Spatial anchoring target types supported in OneNote2Obsidian.
 */
export type AnchorTargetType =
  | "file"
  | "heading"
  | "block"
  | "element"
  | "image"
  | "table"
  | "outline"
  | "shape"
  | "point"
  | "canvas";

/**
 * Visual and behavioral anchoring relationship styles.
 */
export type AnchorKind = "floating" | "attached" | "callout" | "docked" | "pinned-dock";

/**
 * Resolution lifecycle state of the anchor.
 */
export type AnchorStatus = "resolved" | "broken" | "unresolved";

/**
 * Fallback behavior when an anchored target becomes missing or deleted.
 */
export type AnchorFallbackBehavior = "retain-last-position" | "float-to-origin" | "orphan-warning";

/**
 * Spatial anchoring metadata connecting a sticky note to other canvas entities or blocks.
 */
export interface StickyNoteAnchor {
  readonly version: number;
  readonly targetType: AnchorTargetType;
  readonly targetId?: string;
  readonly sourceFile?: string;
  readonly targetPath?: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly anchorKind: AnchorKind;
  readonly fallbackBehavior?: AnchorFallbackBehavior;
  readonly status?: AnchorStatus;
  readonly lastKnownTargetBounds?: SpatialBounds;
}

/**
 * Grouping and clustering metadata for spatial note collections.
 */
export interface StickyNoteGrouping {
  readonly groupId: string;
  readonly groupRole?: "member" | "header" | "card";
  readonly groupOrder?: number;
  readonly zStack?: number;
}

/**
 * Obsidian knowledge graph backlinks, wikilinks, and block references.
 */
export interface StickyNoteBacklinks {
  readonly inboundLinks?: readonly string[];
  readonly outboundLinks?: readonly string[];
  readonly blockReferences?: readonly string[];
  readonly wikilinks?: readonly string[];
}

/**
 * Dedicated Canonical Sticky Note Domain Model.
 *
 * First-class Obsidian knowledge object and spatial canvas citizen.
 * Strictly decoupled from rendering engines and UI frameworks.
 */
export interface CanonicalStickyNote {
  readonly type: "stickyNote";
  readonly id: StickyNoteId | ObjectId;
  readonly bounds: SpatialBounds;
  readonly title?: string;
  readonly content: string;
  readonly paragraphs?: readonly CanonicalParagraph[];
  readonly images?: readonly string[];
  readonly color: StickyNoteColorPreset | string;
  readonly theme?: StickyNoteTheme;
  /**
   * First-class persisted opacity value between 0.0 (fully transparent) and 1.0 (fully opaque).
   * Survives reloads, migrations, and serialization round-trips.
   */
  readonly opacity: number;
  readonly createdTime: number;
  readonly modifiedTime: number;
  readonly author?: string;
  readonly source?: StickyNoteSource;
  readonly spatialMeta?: StickyNoteSpatialMeta;
  readonly anchor?: StickyNoteAnchor;
  readonly grouping?: StickyNoteGrouping;
  readonly backlinks?: StickyNoteBacklinks;
  /** Whether the note is pinned in front (always on top) */
  readonly isPinned?: boolean;
  /** Extensibility for future annotation and plugin features */
  readonly metadata?: Record<string, unknown>;
}
