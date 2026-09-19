import { SpatialBounds } from "../geometry/Bounds";
import { Rectangle } from "../geometry/Rectangle";
import {
  CanonicalAttachment,
  CanonicalImage,
  CanonicalInkStrokeGroup,
  CanonicalOutline,
  CanonicalShape,
  CanonicalTable,
} from "../model/CanonicalElements";
import { CanonicalStickyNote } from "../model/CanonicalStickyNote";
import { CanonicalSpatialGroup, SpatialGroupStyle } from "../model/CanonicalSpatialGroup";
import {
  AnnotationSemanticKind,
  CanonicalSpatialAnnotation,
  SpatialAnnotationStyle,
} from "../model/CanonicalAnnotation";
import { PageCanvasStyle } from "../model/CanonicalPage";
import { AssetId, ObjectId, PageId } from "../model/Ids";

export type SceneLayerType =
  | "background"
  | "spatialGroups"
  | "images"
  | "bottomInk"
  | "tables"
  | "shapes"
  | "text"
  | "stickyNotes"
  | "annotations"
  | "topInk"
  | "attachments"
  | "selection"
  | "interaction";

export interface BaseSceneNode {
  readonly id: ObjectId;
  readonly layer: SceneLayerType;
  bounds: SpatialBounds;
  aabb: Rectangle;
  zIndex: number;
  visible: boolean;
  opacity?: number;
  rotation?: number;
}

export interface SceneGroupNode extends BaseSceneNode {
  readonly layer: "spatialGroups";
  readonly element: CanonicalSpatialGroup;
  readonly title: string;
  readonly memberIds: readonly ObjectId[];
  readonly style?: SpatialGroupStyle;
  readonly isCollapsed?: boolean;
}

export interface SceneAnnotationNode extends BaseSceneNode {
  readonly layer: "annotations";
  readonly element: CanonicalSpatialAnnotation;
  readonly semanticKind: AnnotationSemanticKind;
  readonly content: string;
  readonly style?: SpatialAnnotationStyle;
}

export interface SceneOutlineNode extends BaseSceneNode {
  readonly layer: "text";
  readonly element: CanonicalOutline;
  readonly renderedHtml: string;
}

export interface SceneImageNode extends BaseSceneNode {
  readonly layer: "images";
  readonly element: CanonicalImage;
  readonly assetId: AssetId;
  readonly mimeType?: string;
}

export interface SceneInkNode extends BaseSceneNode {
  readonly layer: "topInk" | "bottomInk";
  readonly element: CanonicalInkStrokeGroup;
  readonly isHighlighter: boolean;
  readonly color: string;
  readonly strokeWidth: number;
}

export interface SceneTableNode extends BaseSceneNode {
  readonly layer: "tables";
  readonly element: CanonicalTable;
}

export interface SceneShapeNode extends BaseSceneNode {
  readonly layer: "shapes";
  readonly element: CanonicalShape;
}

export interface SceneAttachmentNode extends BaseSceneNode {
  readonly layer: "attachments";
  readonly element: CanonicalAttachment;
  readonly fileName: string;
  readonly fileSizeBytes: number;
}

export interface SceneStickyNoteNode extends BaseSceneNode {
  readonly layer: "stickyNotes";
  readonly element: CanonicalStickyNote;
  readonly title?: string;
  readonly text: string;
  readonly renderedHtml: string;
  readonly color: string;
  readonly headerColor?: string;
  readonly textColor?: string;
  readonly borderColor?: string;
  readonly opacity: number;
  readonly isPinned?: boolean;
  readonly isFolded?: boolean;
  readonly anchor?: import("../model/CanonicalStickyNote").StickyNoteAnchor;
}

export type PageSceneNode =
  | SceneGroupNode
  | SceneAnnotationNode
  | SceneOutlineNode
  | SceneImageNode
  | SceneInkNode
  | SceneTableNode
  | SceneShapeNode
  | SceneAttachmentNode
  | SceneStickyNoteNode;

/**
 * 2.5D PageScene Spatial Display Graph.
 * Technology-neutral Intermediate Representation (IR) consumed by renderers.
 */
export interface SceneOptions {
  readonly showPageTitle?: boolean;
}

export interface PageScene {
  readonly pageId: PageId;
  readonly title: string;
  readonly createdTime?: number;
  /** Bounding box of all elements on the canvas (content-driven extent). */
  readonly canvasBounds: Rectangle;
  /** Alias for canvasBounds */
  readonly contentBounds?: Rectangle;
  readonly canvasStyle: PageCanvasStyle;
  nodes: PageSceneNode[];
  groups?: CanonicalSpatialGroup[];
  annotations?: CanonicalSpatialAnnotation[];
  readonly version?: number;
  readonly sceneOptions?: SceneOptions;
}
