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
import { PageCanvasStyle } from "../model/CanonicalPage";
import { AssetId, ObjectId, PageId } from "../model/Ids";

export type SceneLayerType =
  | "background"
  | "images"
  | "bottomInk"
  | "tables"
  | "shapes"
  | "text"
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

export type PageSceneNode =
  | SceneOutlineNode
  | SceneImageNode
  | SceneInkNode
  | SceneTableNode
  | SceneShapeNode
  | SceneAttachmentNode;

/**
 * 2.5D PageScene Spatial Display Graph.
 * Technology-neutral Intermediate Representation (IR) consumed by renderers.
 */
export interface PageScene {
  readonly pageId: PageId;
  readonly title: string;
  readonly canvasBounds: Rectangle;
  readonly canvasStyle: PageCanvasStyle;
  nodes: PageSceneNode[];
  readonly version?: number;
}
