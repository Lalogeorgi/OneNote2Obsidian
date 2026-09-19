import { SpatialBounds } from "../geometry/Bounds";
import { ObjectId } from "./Ids";

/**
 * Structural role and layout archetype of a spatial group.
 */
export type SpatialGroupRole = "frame" | "cluster" | "section" | "container";

/**
 * Visual styling options for a spatial group container.
 */
export interface SpatialGroupStyle {
  readonly backgroundColor?: string;
  readonly borderColor?: string;
  readonly borderWidth?: number;
  readonly borderStyle?: "solid" | "dashed" | "dotted";
  readonly headerColor?: string;
  readonly textColor?: string;
  /**
   * Dedicated group container backdrop opacity (0.0 to 1.0).
   * Strictly independent from member object opacities!
   */
  readonly opacity?: number;
  readonly isCollapsed?: boolean;
}

/**
 * First-class Canonical Spatial Group.
 *
 * Lightweight visual container organizing Sticky Notes, outlines, images,
 * tables, shapes, and annotations into a cohesive spatial cluster.
 */
export interface CanonicalSpatialGroup {
  readonly type: "spatialGroup";
  readonly id: ObjectId;
  readonly title: string;
  readonly bounds: SpatialBounds;
  readonly memberIds: readonly ObjectId[];
  readonly groupRole: SpatialGroupRole;
  readonly style?: SpatialGroupStyle;
  readonly createdTime: number;
  readonly modifiedTime: number;
  readonly metadata?: Record<string, unknown>;
}
