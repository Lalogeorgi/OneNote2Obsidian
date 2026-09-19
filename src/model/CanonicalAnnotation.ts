import { SpatialBounds } from "../geometry/Bounds";
import { ObjectId } from "./Ids";

/**
 * Extensible semantic classifications for spatial annotations.
 */
export type AnnotationSemanticKind =
  | "explanation"
  | "emphasis"
  | "categorization"
  | "commentary"
  | "visual-relationship"
  | "task-marker"
  | "context-marker"
  | "custom";

/**
 * Target reference for a spatial annotation.
 */
export interface SpatialAnnotationTarget {
  readonly targetType:
    "stickyNote" | "outline" | "image" | "table" | "shape" | "group" | "region" | "file";
  readonly targetId?: ObjectId | string;
  readonly targetPath?: string;
  readonly regionBounds?: SpatialBounds;
}

/**
 * Visual styling properties for spatial annotations.
 */
export interface SpatialAnnotationStyle {
  readonly color?: string;
  readonly backgroundColor?: string;
  readonly borderColor?: string;
  readonly badgeIcon?: string;
  readonly badgeText?: string;
  readonly opacity?: number;
}

/**
 * First-class Canonical Spatial Annotation.
 *
 * Provides contextual commentary, emphasis, or task metadata
 * across Sticky Notes, Obsidian files, groups, or free spatial regions.
 */
export interface CanonicalSpatialAnnotation {
  readonly type: "annotation";
  readonly id: ObjectId;
  readonly semanticKind: AnnotationSemanticKind;
  readonly target: SpatialAnnotationTarget;
  readonly content: string;
  readonly bounds?: SpatialBounds;
  readonly style?: SpatialAnnotationStyle;
  readonly author?: string;
  readonly createdTime: number;
  readonly modifiedTime: number;
  readonly metadata?: Record<string, unknown>;
}
