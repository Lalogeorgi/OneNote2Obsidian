import { Container, Graphics } from "pixi.js";
import { Point2D } from "../../geometry/Point";
import { ObjectId } from "../../model/Ids";
import {
  PageScene,
  PageSceneNode,
  SceneAnnotationNode,
  SceneAttachmentNode,
  SceneGroupNode,
  SceneImageNode,
  SceneInkNode,
  SceneLayerType,
  SceneOutlineNode,
  SceneShapeNode,
  SceneStickyNoteNode,
  SceneTableNode,
} from "../../pagescene/PageScene";
import { ResolvedSceneLinks } from "../../knowledge/SpatialLinkGraph";
import { ResourceTracker } from "./ResourceTracker";
import { SceneGraphHierarchy } from "./SceneGraphHierarchy";
import { formatOneNoteDate } from "../../pagescene/SceneBuilder";
import { FloatingTextFormatBar } from "../../editor/text/FloatingTextFormatBar";
import { StickyNoteAnchor } from "../../model/CanonicalStickyNote";
import { StickyNoteUtils } from "../../model/StickyNoteUtils";
import { SpatialAnchorManager } from "../../knowledge/SpatialAnchorManager";
import { SpatialGroupManager } from "../../knowledge/SpatialGroupManager";
import {
  STICKY_NOTE_COLOR_PRESETS,
  OPACITY_PRESETS,
  POPOVER_OFFSETS,
  STICKY_NOTE_STRINGS,
  STICKY_NOTE_METRICS,
  STICKY_NOTE_SVG_ICONS,
  STICKY_NOTE_ACCESSIBILITY_STRINGS,
  STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT,
} from "../../constants/StickyNoteConstants";
import { StickyNoteFormatToolbar } from "../../editor/text/StickyNoteFormatToolbar";
import { FloatingStickyNoteManager } from "../../obsidian/FloatingStickyNoteManager";
import {
  CanonicalElement,
  CanonicalOutline,
  CanonicalTable,
  CanonicalTableRow,
  CanonicalTableCell,
} from "../../model/CanonicalElements";
import { IdGenerator } from "../../model/Ids";
import { CoordinateMath } from "../../geometry/Bounds";
import { NOVELTY_INK_DEFINITIONS, DIGITAL_RULER_METRICS } from "../../constants/RibbonConstants";
import { CANVAS_INK_METRICS } from "../../constants/CanvasConstants";
import { setSvgContent, setSanitizedHtml, emptyElement } from "../../dom/DomUtils";

export interface SyncStats {
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly removedCount: number;
  readonly unchangedCount: number;
}

export interface NodeSnapshot {
  readonly zIndex: number;
  readonly visible: boolean;
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly rotation?: number;
  readonly opacity?: number;
  readonly pointsHash?: string;
  readonly title?: string;
  readonly text?: string;
  readonly color?: string;
}

export class SceneSynchronizer {
  private displayObjectMap = new Map<ObjectId, Container>();
  private domNodeMap = new Map<ObjectId, HTMLElement>();
  private previousScene: PageScene | null = null;
  private nodeSnapshotMap = new Map<ObjectId, NodeSnapshot>();
  private resolvedLinks: ResolvedSceneLinks | null = null;

  private selectionGraphics = new Graphics();
  private hoverGraphics = new Graphics();
  private activeStrokeGraphics = new Graphics();
  private lassoGraphics = new Graphics();

  private selectedNodes: PageSceneNode[] = [];
  private hoveredNode: PageSceneNode | null = null;
  private titleBlockEl: HTMLElement | null = null;
  private formatBar: FloatingTextFormatBar | null = null;

  public onTitleChange?: (newTitle: string) => void;
  public onTextNodeChange?: (node: SceneOutlineNode, newText: string) => void;
  public onStickyNoteTitleChange?: (node: SceneStickyNoteNode, newTitle: string) => void;
  public onStickyNoteContentChange?: (node: SceneStickyNoteNode, newContent: string) => void;
  public onStickyNoteStyleChange?: (
    node: SceneStickyNoteNode,
    style: { color?: string; opacity?: number }
  ) => void;
  public onStickyNotePinToggle?: (node: SceneStickyNoteNode) => void;
  public onStickyNoteDelete?: (node: SceneStickyNoteNode) => void;
  public onStickyNoteDuplicate?: (node: SceneStickyNoteNode) => void;
  public onStickyNotePopout?: (node: SceneStickyNoteNode) => void;
  public onStickyNoteCreateSibling?: (node: SceneStickyNoteNode) => void;
  public onStickyNoteOpenHub?: () => void;
  public onStickyNoteAnchorChange?: (
    node: SceneStickyNoteNode,
    anchor: StickyNoteAnchor | undefined
  ) => void;
  public onGroupTitleChange?: (node: SceneGroupNode, newTitle: string) => void;
  public onGroupUngroup?: (node: SceneGroupNode) => void;
  public onWikilinkClick?: (linkText: string) => void;
  public onFocusNode?: (nodeId: ObjectId) => void;
  public onNodeHoverStateChange?: (nodeId: ObjectId | null) => void;
  public onNodeBoundsLiveUpdate?: (
    nodeId: ObjectId,
    bounds: import("../../geometry/Bounds").SpatialBounds
  ) => void;
  public onTableChange?: (node: SceneTableNode, updatedTable: CanonicalTable) => void;
  public onOutlineChange?: (node: SceneOutlineNode, updatedOutline: CanonicalOutline) => void;
  public onAttachmentClick?: (node: SceneAttachmentNode) => void;

  public setResolvedLinks(links: ResolvedSceneLinks | null): void {
    this.resolvedLinks = links;
  }

  public assetUrlResolver: ((assetId: string) => string | undefined) | null = null;

  constructor(
    private hierarchy: SceneGraphHierarchy,
    private domOverlay: HTMLElement | null = null,
    private resourceTracker: ResourceTracker | null = null
  ) {
    this.hierarchy.selectionLayer.addChild(this.selectionGraphics);
    this.hierarchy.interactionLayer.addChild(this.hoverGraphics);
    this.hierarchy.interactionLayer.addChild(this.activeStrokeGraphics);
    this.hierarchy.interactionLayer.addChild(this.lassoGraphics);

    if (this.domOverlay) {
      this.formatBar = new FloatingTextFormatBar(this.domOverlay, {
        onMutate: () => {
          // If active node has content, trigger change notification
          const activeFocused = this.domOverlay?.querySelector(
            ".onenote-note-container.is-focused"
          );
          if (activeFocused && this.onTextNodeChange) {
            const nodeId = (activeFocused as any).datasetNodeId;
            const node = this.previousScene?.nodes.find((n) => n.id === nodeId) as
              SceneOutlineNode | undefined;
            const body = activeFocused.querySelector(
              ".onenote-container-body"
            ) as HTMLElement | null;
            if (node && body) {
              this.onTextNodeChange(node, body.innerText || "");
            }
          }
        },
      });
    }
  }

  /**
   * Incrementally synchronizes a PageScene into PixiJS display objects and DOM overlay nodes.
   */
  public sync(
    nextScene: PageScene,
    visibleRect?: import("../../geometry/Rectangle").Rectangle
  ): SyncStats {
    let createdCount = 0;
    let updatedCount = 0;
    let removedCount = 0;
    let unchangedCount = 0;

    const nextNodeMap = new Map<ObjectId, PageSceneNode>();
    for (const node of nextScene.nodes) {
      nextNodeMap.set(node.id, node);
    }

    // 1. Remove obsolete nodes not present in nextScene
    for (const [id, displayObj] of Array.from(this.displayObjectMap.entries())) {
      if (!nextNodeMap.has(id)) {
        displayObj.destroy({ children: true });
        this.displayObjectMap.delete(id);

        const domNode = this.domNodeMap.get(id);
        if (domNode && domNode.parentElement) {
          domNode.parentElement.removeChild(domNode);
          this.domNodeMap.delete(id);
        }
        this.nodeSnapshotMap.delete(id);
        removedCount++;
      }
    }

    // 2. Add or Update nodes
    for (const node of nextScene.nodes) {
      const existingDisplayObj = this.displayObjectMap.get(node.id);

      if (!existingDisplayObj) {
        // Create new display object
        const newObj = this.createDisplayObject(node);
        if (newObj) {
          this.displayObjectMap.set(node.id, newObj);
          this.mountToLayer(node.layer, newObj);
        }

        // Mount DOM overlay if outline, table, image, attachment, sticky note, spatial group, or annotation
        if (node.layer === "text" && this.domOverlay) {
          const domEl = this.createDomTextNode(node as SceneOutlineNode);
          this.domNodeMap.set(node.id, domEl);
          this.domOverlay.appendChild(domEl);
        } else if (node.layer === "tables" && this.domOverlay) {
          const domEl = this.createDomTableNode(node as SceneTableNode);
          this.domNodeMap.set(node.id, domEl);
          this.domOverlay.appendChild(domEl);
        } else if (node.layer === "images" && this.domOverlay) {
          const domEl = this.createDomImageNode(node as SceneImageNode);
          this.domNodeMap.set(node.id, domEl);
          this.domOverlay.appendChild(domEl);
        } else if (node.layer === "attachments" && this.domOverlay) {
          const domEl = this.createDomAttachmentNode(node as SceneAttachmentNode);
          this.domNodeMap.set(node.id, domEl);
          this.domOverlay.appendChild(domEl);
        } else if (node.layer === "stickyNotes" && this.domOverlay) {
          const domEl = this.createDomStickyNoteNode(node as SceneStickyNoteNode);
          this.domNodeMap.set(node.id, domEl);
          this.domOverlay.appendChild(domEl);
        } else if (node.layer === "spatialGroups" && this.domOverlay) {
          const domEl = this.createDomGroupNode(node as SceneGroupNode);
          this.domNodeMap.set(node.id, domEl);
          this.domOverlay.appendChild(domEl);
        } else if (node.layer === "annotations" && this.domOverlay) {
          const domEl = this.createDomAnnotationNode(node as SceneAnnotationNode);
          this.domNodeMap.set(node.id, domEl);
          this.domOverlay.appendChild(domEl);
        } else if ((node.layer === "topInk" || node.layer === "bottomInk") && this.domOverlay) {
          const domEl = this.createDomInkNode(node as SceneInkNode);
          this.domNodeMap.set(node.id, domEl);
          this.domOverlay.appendChild(domEl);
        }
        createdCount++;
      } else {
        // Update existing display object
        const prevSnapshot = this.nodeSnapshotMap.get(node.id);
        const hasChanged = this.hasNodeChanged(prevSnapshot, node);

        if (hasChanged) {
          this.updateDisplayObject(existingDisplayObj, node);

          if (node.layer === "text") {
            const existingDom = this.domNodeMap.get(node.id);
            if (existingDom) {
              this.updateDomTextNode(existingDom, node as SceneOutlineNode);
            }
          } else if (node.layer === "tables") {
            const existingDom = this.domNodeMap.get(node.id);
            if (existingDom) {
              this.updateDomTableNode(existingDom, node as SceneTableNode);
            }
          } else if (node.layer === "images") {
            const existingDom = this.domNodeMap.get(node.id);
            if (existingDom) {
              this.updateDomImageNode(existingDom, node as SceneImageNode);
            }
          } else if (node.layer === "attachments") {
            const existingDom = this.domNodeMap.get(node.id);
            if (existingDom) {
              this.updateDomAttachmentNode(existingDom, node as SceneAttachmentNode);
            }
          } else if (node.layer === "stickyNotes") {
            const existingDom = this.domNodeMap.get(node.id);
            if (existingDom) {
              this.updateDomStickyNoteNode(existingDom, node as SceneStickyNoteNode);
            }
          } else if (node.layer === "spatialGroups") {
            const existingDom = this.domNodeMap.get(node.id);
            if (existingDom) {
              this.updateDomGroupNode(existingDom, node as SceneGroupNode);
            }
          } else if (node.layer === "annotations") {
            const existingDom = this.domNodeMap.get(node.id);
            if (existingDom) {
              this.updateDomAnnotationNode(existingDom, node as SceneAnnotationNode);
            }
          } else if (node.layer === "topInk" || node.layer === "bottomInk") {
            const existingDom = this.domNodeMap.get(node.id);
            if (existingDom) {
              this.updateDomInkNode(existingDom, node as SceneInkNode);
            }
          }
          updatedCount++;
        } else {
          unchangedCount++;
        }
      }
    }

    // 3. Update Background & Dedicated Title Header
    this.renderBackground(nextScene, visibleRect);
    this.syncTitleHeader(nextScene);

    this.previousScene = nextScene;
    for (const node of nextScene.nodes) {
      this.nodeSnapshotMap.set(node.id, {
        zIndex: node.zIndex,
        visible: node.visible,
        bounds: {
          x: node.bounds.x,
          y: node.bounds.y,
          width: node.bounds.width,
          height: node.bounds.height,
        },
        rotation: node.rotation,
        opacity: node.opacity,
        pointsHash:
          node.layer === "topInk" || node.layer === "bottomInk"
            ? this.computeInkHash(node as SceneInkNode)
            : undefined,
        title: (node as any).title,
        text: (node as any).text,
        color: (node as any).color,
      });
    }

    // Refresh selection visual
    this.renderSelectionVisuals();

    return {
      createdCount,
      updatedCount,
      removedCount,
      unchangedCount,
    };
  }

  public setSelectedNodes(nodes: PageSceneNode[]): void {
    this.selectedNodes = nodes;
    this.renderSelectionVisuals();
  }

  public setHoveredNode(node: PageSceneNode | null): void {
    this.hoveredNode = node;
    this.renderHoverVisual();
  }

  private computeInkHash(node: SceneInkNode): string {
    const strokes = node.element?.strokes;
    if (!strokes || strokes.length === 0) return "empty";
    let hash = `${strokes.length}:`;
    for (let i = 0; i < strokes.length; i++) {
      const s = strokes[i]!;
      const pts = s.points;
      hash += `${s.id}_${pts.length}_`;
      if (pts.length > 0) {
        const p0 = pts[0]!;
        const pEnd = pts[pts.length - 1]!;
        hash += `${Math.round(p0.x)},${Math.round(p0.y)}_${Math.round(pEnd.x)},${Math.round(pEnd.y)};`;
      }
    }
    return hash;
  }

  private hasNodeChanged(prev: NodeSnapshot | undefined, next: PageSceneNode): boolean {
    if (!prev) return true;
    if (prev.zIndex !== next.zIndex) return true;
    if (prev.visible !== next.visible) return true;
    if (
      prev.bounds.x !== next.bounds.x ||
      prev.bounds.y !== next.bounds.y ||
      prev.bounds.width !== next.bounds.width ||
      prev.bounds.height !== next.bounds.height
    ) {
      return true;
    }
    if (prev.rotation !== next.rotation || prev.opacity !== next.opacity) return true;

    if (next.layer === "topInk" || next.layer === "bottomInk") {
      const inkNode = next as SceneInkNode;
      const currentHash = this.computeInkHash(inkNode);
      if (prev.pointsHash !== currentHash) return true;
    }

    if (next.layer === "stickyNotes") {
      const sticky = next as SceneStickyNoteNode;
      if (prev.title !== sticky.title || prev.text !== sticky.text || prev.color !== sticky.color) {
        return true;
      }
    }

    return false;
  }

  private createDisplayObject(node: PageSceneNode): Container | null {
    switch (node.layer) {
      case "topInk":
      case "bottomInk":
        return this.createInkGraphics(node as SceneInkNode);
      case "shapes":
        return this.createShapeGraphics(node as SceneShapeNode);
      case "tables":
        return this.createTableGraphics(node as SceneTableNode);
      case "images":
        return this.createImageGraphics(node as SceneImageNode);
      case "attachments":
        return this.createAttachmentGraphics(node as SceneAttachmentNode);
      case "text":
        return this.createTextPlaceholder(node as SceneOutlineNode);
      case "stickyNotes":
        return this.createStickyNoteGraphics(node as SceneStickyNoteNode);
      default:
        return null;
    }
  }

  private updateDisplayObject(container: Container, node: PageSceneNode): void {
    container.visible = node.visible;
    container.zIndex = node.zIndex;
    container.alpha = node.opacity ?? 1.0;

    if (container instanceof Graphics) {
      container.clear();
      switch (node.layer) {
        case "topInk":
        case "bottomInk":
          this.drawInk(container, node as SceneInkNode);
          break;
        case "shapes":
          this.drawShape(container, node as SceneShapeNode);
          break;
        case "tables":
          this.drawTable(container, node as SceneTableNode);
          break;
        case "images":
          this.drawImagePlaceholder(container, node as SceneImageNode);
          break;
        case "attachments":
          this.drawAttachment(container, node as SceneAttachmentNode);
          break;
        case "text":
          this.drawTextPlaceholder(container, node as SceneOutlineNode);
          break;
        case "stickyNotes":
          this.drawStickyNote(container, node as SceneStickyNoteNode);
          break;
      }
    }
  }

  private mountToLayer(layer: SceneLayerType, obj: Container): void {
    switch (layer) {
      case "spatialGroups":
        this.hierarchy.spatialGroupsLayer.addChild(obj);
        break;
      case "images":
        this.hierarchy.imagesLayer.addChild(obj);
        break;
      case "bottomInk":
        this.hierarchy.bottomInkLayer.addChild(obj);
        break;
      case "tables":
        this.hierarchy.tablesLayer.addChild(obj);
        break;
      case "shapes":
        this.hierarchy.shapesLayer.addChild(obj);
        break;
      case "text":
        this.hierarchy.textLayer.addChild(obj);
        break;
      case "stickyNotes":
        this.hierarchy.stickyNotesLayer.addChild(obj);
        break;
      case "annotations":
        this.hierarchy.annotationsLayer.addChild(obj);
        break;
      case "topInk":
        this.hierarchy.topInkLayer.addChild(obj);
        break;
      case "attachments":
        this.hierarchy.attachmentsLayer.addChild(obj);
        break;
      case "selection":
        this.hierarchy.selectionLayer.addChild(obj);
        break;
      case "interaction":
        this.hierarchy.interactionLayer.addChild(obj);
        break;
    }
  }

  private createInkGraphics(node: SceneInkNode): Graphics {
    const g = new Graphics();
    g.label = `Ink_${node.id}`;
    this.drawInk(g, node);
    return g;
  }

  private drawInk(g: Graphics, node: SceneInkNode): void {
    if (!node.element.strokes || node.element.strokes.length === 0) return;

    if (this.domOverlay) {
      const b = node.bounds;
      g.rect(
        b.x,
        b.y,
        Math.max(CANVAS_INK_METRICS.MIN_BOUNDS_DIMENSION, b.width),
        Math.max(CANVAS_INK_METRICS.MIN_BOUNDS_DIMENSION, b.height)
      );
      g.fill({ color: 0xffffff, alpha: CANVAS_INK_METRICS.TRANSPARENT_HIT_ALPHA });
      return;
    }

    // Group consecutive strokes with identical style into single batched stroke passes
    const alpha = node.isHighlighter
      ? CANVAS_INK_METRICS.HIGHLIGHTER_ALPHA
      : CANVAS_INK_METRICS.PEN_ALPHA;
    let currentBatchColor = -1;
    let currentBatchWidth = -1;
    let hasActivePathInBatch = false;

    const flushBatch = () => {
      if (hasActivePathInBatch) {
        g.stroke({
          color: currentBatchColor,
          width: Math.max(CANVAS_INK_METRICS.BATCH_MIN_WIDTH, currentBatchWidth),
          alpha,
          cap: "round",
          join: "round",
        });
        hasActivePathInBatch = false;
      }
    };

    for (const stroke of node.element.strokes) {
      if (stroke.points.length < 2) continue;
      const strokeColor = parseInt(stroke.color.replace("#", ""), 16) || 0x000000;
      const strokeWidth =
        stroke.width ||
        node.strokeWidth ||
        (node.isHighlighter
          ? CANVAS_INK_METRICS.DEFAULT_HIGHLIGHTER_WIDTH
          : CANVAS_INK_METRICS.DEFAULT_STROKE_WIDTH);

      if (strokeColor !== currentBatchColor || strokeWidth !== currentBatchWidth) {
        flushBatch();
        currentBatchColor = strokeColor;
        currentBatchWidth = strokeWidth;
      }

      const pts = stroke.points;
      if (pts.length === 2) {
        g.moveTo(pts[0]!.x, pts[0]!.y);
        g.lineTo(pts[1]!.x, pts[1]!.y);
      } else {
        g.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length - 1; i++) {
          const xc = (pts[i]!.x + pts[i + 1]!.x) / 2;
          const yc = (pts[i]!.y + pts[i + 1]!.y) / 2;
          g.quadraticCurveTo(pts[i]!.x, pts[i]!.y, xc, yc);
        }
        g.lineTo(pts[pts.length - 1]!.x, pts[pts.length - 1]!.y);
      }
      hasActivePathInBatch = true;
    }

    flushBatch();
  }

  private createShapeGraphics(node: SceneShapeNode): Graphics {
    const g = new Graphics();
    g.label = `Shape_${node.id}`;
    this.drawShape(g, node);
    return g;
  }

  private drawShape(g: Graphics, node: SceneShapeNode): void {
    const b = node.bounds;
    const strokeColor = parseInt((node.element.strokeColor || "#000000").replace("#", ""), 16);
    const fillColor = node.element.fillColor
      ? parseInt(node.element.fillColor.replace("#", ""), 16)
      : undefined;

    switch (node.element.shapeKind) {
      case "rectangle":
        g.rect(b.x, b.y, b.width, b.height);
        break;
      case "rounded_rectangle":
        g.roundRect(b.x, b.y, b.width, b.height, Math.min(16, Math.min(b.width, b.height) / 4));
        break;
      case "ellipse":
        g.ellipse(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, b.height / 2);
        break;
      case "triangle":
        g.moveTo(b.x + b.width / 2, b.y);
        g.lineTo(b.x + b.width, b.y + b.height);
        g.lineTo(b.x, b.y + b.height);
        g.closePath();
        break;
      case "right_triangle":
        g.moveTo(b.x, b.y);
        g.lineTo(b.x, b.y + b.height);
        g.lineTo(b.x + b.width, b.y + b.height);
        g.closePath();
        break;
      case "diamond":
        g.moveTo(b.x + b.width / 2, b.y);
        g.lineTo(b.x + b.width, b.y + b.height / 2);
        g.lineTo(b.x + b.width / 2, b.y + b.height);
        g.lineTo(b.x, b.y + b.height / 2);
        g.closePath();
        break;
      case "star": {
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        const rOuter = Math.min(b.width, b.height) / 2;
        const rInner = rOuter * 0.4;
        for (let i = 0; i < 10; i++) {
          const angle = (i * Math.PI) / 5 - Math.PI / 2;
          const r = i % 2 === 0 ? rOuter : rInner;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        break;
      }
      case "coordinate_system": {
        // Horizontal X-axis
        const midY = b.y + b.height / 2;
        const midX = b.x + b.width / 2;
        g.moveTo(b.x, midY);
        g.lineTo(b.x + b.width, midY);
        // X arrow
        g.moveTo(b.x + b.width - 8, midY - 5);
        g.lineTo(b.x + b.width, midY);
        g.lineTo(b.x + b.width - 8, midY + 5);
        // Vertical Y-axis
        g.moveTo(midX, b.y + b.height);
        g.lineTo(midX, b.y);
        // Y arrow
        g.moveTo(midX - 5, b.y + 8);
        g.lineTo(midX, b.y);
        g.lineTo(midX + 5, b.y + 8);
        break;
      }
      case "double_arrow":
      case "arrow":
      case "line": {
        g.moveTo(b.x, b.y);
        g.lineTo(b.x + b.width, b.y + b.height);

        const angle = Math.atan2(b.height, b.width);
        const arrowHeadLen = 14;
        const endX = b.x + b.width;
        const endY = b.y + b.height;

        if (node.element.shapeKind === "arrow" || node.element.shapeKind === "double_arrow") {
          g.moveTo(endX, endY);
          g.lineTo(
            endX - arrowHeadLen * Math.cos(angle - Math.PI / 6),
            endY - arrowHeadLen * Math.sin(angle - Math.PI / 6)
          );
          g.moveTo(endX, endY);
          g.lineTo(
            endX - arrowHeadLen * Math.cos(angle + Math.PI / 6),
            endY - arrowHeadLen * Math.sin(angle + Math.PI / 6)
          );
        }

        if (node.element.shapeKind === "double_arrow") {
          const startX = b.x;
          const startY = b.y;
          g.moveTo(startX, startY);
          g.lineTo(
            startX + arrowHeadLen * Math.cos(angle - Math.PI / 6),
            startY + arrowHeadLen * Math.sin(angle - Math.PI / 6)
          );
          g.moveTo(startX, startY);
          g.lineTo(
            startX + arrowHeadLen * Math.cos(angle + Math.PI / 6),
            startY + arrowHeadLen * Math.sin(angle + Math.PI / 6)
          );
        }
        break;
      }
      default:
        g.rect(b.x, b.y, b.width, b.height);
        break;
    }

    if (fillColor !== undefined) {
      g.fill(fillColor);
    }
    g.stroke({ color: strokeColor, width: node.element.strokeWidth || 1.5 });
  }

  private createTableGraphics(node: SceneTableNode): Graphics {
    const g = new Graphics();
    g.label = `Table_${node.id}`;
    this.drawTable(g, node);
    return g;
  }

  private drawTable(g: Graphics, node: SceneTableNode): void {
    const b = node.bounds;
    if (this.domOverlay) {
      g.rect(b.x, b.y, Math.max(160, b.width), Math.max(40, b.height));
      g.fill({ color: 0xffffff, alpha: 0.001 });
      return;
    }

    // Outer Table Border
    g.rect(b.x, b.y, b.width, b.height);
    g.fill({ color: 0xffffff, alpha: 0.9 });
    g.stroke({ color: 0x9ca3af, width: 1.5 });

    // Inner Grid Lines if multi-column
    const colCount = Math.max(1, node.element.columns.length);
    const colWidth = b.width / colCount;
    for (let c = 1; c < colCount; c++) {
      g.moveTo(b.x + c * colWidth, b.y);
      g.lineTo(b.x + c * colWidth, b.y + b.height);
    }

    const rowCount = Math.max(1, node.element.rows.length);
    const rowHeight = b.height / rowCount;
    for (let r = 1; r < rowCount; r++) {
      g.moveTo(b.x, b.y + r * rowHeight);
      g.lineTo(b.x + b.width, b.y + r * rowHeight);
    }

    g.stroke({ color: 0xe5e7eb, width: 1 });
  }

  private createImageGraphics(node: SceneImageNode): Graphics {
    const g = new Graphics();
    g.label = `Image_${node.id}`;
    this.drawImagePlaceholder(g, node);
    return g;
  }

  private drawImagePlaceholder(g: Graphics, node: SceneImageNode): void {
    const b = node.bounds;
    if (this.domOverlay) {
      g.rect(b.x, b.y, Math.max(50, b.width), Math.max(50, b.height));
      g.fill({ color: 0xffffff, alpha: 0.001 });
      return;
    }

    g.rect(b.x, b.y, b.width, b.height);
    g.fill({ color: 0xf3f4f6, alpha: 0.85 });
    g.stroke({ color: 0xd1d5db, width: 1, alpha: 0.6 });

    // Inner Camera/Image Glyphs
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const iconSize = Math.min(32, Math.min(b.width, b.height) / 3);

    if (iconSize > 8) {
      g.roundRect(cx - iconSize, cy - iconSize * 0.7, iconSize * 2, iconSize * 1.4, 3);
      g.stroke({ color: 0x9ca3af, width: 1.5 });
      g.circle(cx, cy, iconSize * 0.4);
      g.stroke({ color: 0x9ca3af, width: 1.5 });
    }
  }

  private createAttachmentGraphics(node: SceneAttachmentNode): Graphics {
    const g = new Graphics();
    g.label = `Attachment_${node.id}`;
    this.drawAttachment(g, node);
    return g;
  }

  private drawAttachment(g: Graphics, node: SceneAttachmentNode): void {
    const b = node.bounds;
    const width = Math.max(180, b.width);
    const height = Math.max(48, b.height);
    if (this.domOverlay) {
      g.rect(b.x, b.y, width, height);
      g.fill({ color: 0xffffff, alpha: 0.001 });
      return;
    }

    g.roundRect(b.x, b.y, width, height, 6);
    g.fill({ color: 0xeff6ff, alpha: 0.95 });
    g.stroke({ color: 0x3b82f6, width: 1.5 });

    // File paper icon badge
    g.rect(b.x + 12, b.y + 10, 20, 26);
    g.fill(0x3b82f6);
  }

  private createTextPlaceholder(node: SceneOutlineNode): Graphics {
    const g = new Graphics();
    g.label = `Text_${node.id}`;
    this.drawTextPlaceholder(g, node);
    return g;
  }

  private drawTextPlaceholder(g: Graphics, node: SceneOutlineNode): void {
    const b = node.bounds;
    g.rect(b.x, b.y, Math.max(120, b.width), Math.max(40, b.height));
    g.fill({ color: 0xffffff, alpha: 0.001 }); // Transparent hit target
  }

  private createDomTextNode(node: SceneOutlineNode): HTMLElement {
    const el = document.createElement("div");
    el.id = `dom-outline-${node.id}`;
    el.className = "onenote-note-container onenote-outline-container";
    (el as any).datasetNodeId = node.id;

    // 1. Top grab handle (appears on hover/focus/select)
    const header = document.createElement("div");
    header.className = "onenote-container-header";
    const grab = document.createElement("div");
    grab.className = "onenote-container-grab-handle";
    grab.title = "Drag to move container";
    const grabDots = document.createElement("span");
    grabDots.className = "onenote-grab-dots";
    grabDots.textContent = "⋮⋮";
    grab.appendChild(grabDots);
    (grab as any).datasetNodeId = node.id;
    header.appendChild(grab);
    el.appendChild(header);

    // 2. Note container body (direct rich contenteditable)
    const body = document.createElement("div");
    body.className = "onenote-container-body";
    body.contentEditable = "true";
    setSanitizedHtml(body, node.renderedHtml);

    body.addEventListener("focus", () => {
      el.classList.add("is-focused");
      this.formatBar?.attachTo(el);
    });
    body.addEventListener("blur", () => {
      el.classList.remove("is-focused");
      setTimeout(() => {
        if (!document.activeElement?.closest(".onenote-floating-text-format-bar")) {
          this.formatBar?.detach();
        }
      }, 150);
      if (this.onTextNodeChange) {
        this.onTextNodeChange(node, body.innerText || "");
      }
    });

    const handleCheckboxToggle = (target: EventTarget | null) => {
      const checkbox = target as HTMLInputElement;
      if (checkbox && checkbox.tagName === "INPUT" && checkbox.type === "checkbox") {
        const pEl = checkbox.closest(".onenote-paragraph") as HTMLElement;
        if (pEl && node.element?.paragraphs) {
          const allP = Array.from(body.querySelectorAll(".onenote-paragraph"));
          const pIdx = allP.indexOf(pEl);
          if (pIdx >= 0 && node.element.paragraphs[pIdx]) {
            const updatedParagraphs = [...node.element.paragraphs];
            updatedParagraphs[pIdx] = {
              ...updatedParagraphs[pIdx]!,
              isTaskChecked: checkbox.checked,
            };
            const updatedOutline: CanonicalOutline = {
              ...node.element,
              paragraphs: updatedParagraphs,
            };
            (node as any).element = updatedOutline;
            if (this.onOutlineChange) {
              this.onOutlineChange(node, updatedOutline);
            }
          }
        }
      }
    };

    body.addEventListener("change", (e: Event) => {
      handleCheckboxToggle(e.target);
    });

    body.addEventListener("click", (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        target.tagName === "INPUT" &&
        (target as HTMLInputElement).type === "checkbox"
      ) {
        e.stopPropagation();
        handleCheckboxToggle(target);
      }
    });

    el.appendChild(body);

    // 3. Right edge resizer handle
    const resizer = document.createElement("div");
    resizer.className = "onenote-container-resizer";
    resizer.title = "Drag to adjust container width";
    (resizer as any).datasetNodeId = node.id;
    el.appendChild(resizer);

    this.updateDomTextNode(el, node);
    return el;
  }

  private updateDomTextNode(el: HTMLElement, node: SceneOutlineNode): void {
    el.style.left = `${node.bounds.x}px`;
    el.style.top = `${node.bounds.y}px`;
    el.style.width = `${Math.max(120, node.bounds.width)}px`;
    el.classList.toggle("is-hidden", !node.visible);
    el.style.zIndex = `${20 + Math.min(10, node.zIndex)}`;
    const effectiveOpacity = this.previousScene
      ? SpatialGroupManager.computeEffectiveOpacity(node, this.previousScene)
      : (node.opacity ?? 1.0);
    el.style.opacity = `${effectiveOpacity}`;

    const body = el.querySelector(".onenote-container-body") as HTMLElement;
    if (body && document.activeElement !== body && !body.contains(document.activeElement)) {
      setSanitizedHtml(body, node.renderedHtml);
    }
  }

  private createDomTableNode(node: SceneTableNode): HTMLElement {
    const el = document.createElement("div");
    el.id = `dom-table-${node.id}`;
    el.className = "onenote-note-container onenote-table-container";
    (el as any).datasetNodeId = node.id;

    // 1. Top grab handle
    const header = document.createElement("div");
    header.className = "onenote-container-header";
    const grab = document.createElement("div");
    grab.className = "onenote-container-grab-handle";
    grab.title = "Drag to move table";
    const grabDots = document.createElement("span");
    grabDots.className = "onenote-grab-dots";
    grabDots.textContent = "⋮⋮";
    grab.appendChild(grabDots);
    (grab as any).datasetNodeId = node.id;
    header.appendChild(grab);
    el.appendChild(header);

    // 2. HTML Table
    const tableEl = document.createElement("table");
    tableEl.className = "onenote-table";
    this.renderTableContent(tableEl, node);
    el.appendChild(tableEl);

    // 3. Right edge resizer handle
    const resizer = document.createElement("div");
    resizer.className = "onenote-container-resizer";
    resizer.title = "Drag to adjust table width";
    (resizer as any).datasetNodeId = node.id;
    el.appendChild(resizer);

    this.updateDomTableNode(el, node);
    return el;
  }

  private renderTableContent(tableEl: HTMLTableElement, node: SceneTableNode): void {
    emptyElement(tableEl);

    const cols = node.element.columns || [];
    const colgroup = document.createElement("colgroup");
    for (const c of cols) {
      const col = document.createElement("col");
      col.style.width = `${c.width}px`;
      colgroup.appendChild(col);
    }
    tableEl.appendChild(colgroup);

    const tbody = document.createElement("tbody");
    const rows = node.element.rows || [];

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx]!;
      const tr = document.createElement("tr");
      tr.className = "onenote-table-row";

      for (let cIdx = 0; cIdx < row.cells.length; cIdx++) {
        const cell = row.cells[cIdx]!;
        const td = document.createElement("td");
        td.className = "onenote-table-cell";
        td.contentEditable = "true";
        td.dataset.row = `${rIdx}`;
        td.dataset.col = `${cIdx}`;

        let cellText = "";
        for (const cellEl of cell.elements) {
          if (cellEl.type === "outline") {
            cellText += (cellEl as CanonicalOutline).paragraphs
              .map((p) => p.runs.map((r) => r.text).join(""))
              .join("\n");
          }
        }
        td.textContent = cellText;

        // Keyboard navigation (Tab, Shift+Tab)
        td.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const allCells = Array.from(
              tableEl.querySelectorAll<HTMLTableCellElement>(".onenote-table-cell")
            );
            const currentIdx = allCells.indexOf(td);
            if (e.shiftKey) {
              if (currentIdx > 0) allCells[currentIdx - 1]!.focus();
            } else {
              if (currentIdx < allCells.length - 1) {
                allCells[currentIdx + 1]!.focus();
              } else {
                // Tab on last cell creates a new row
                this.addTableRow(tableEl, node);
                setTimeout(() => {
                  const updatedCells = Array.from(
                    tableEl.querySelectorAll<HTMLTableCellElement>(".onenote-table-cell")
                  );
                  updatedCells[allCells.length]?.focus();
                }, 10);
              }
            }
          }
        });

        td.addEventListener("blur", () => {
          this.syncTableFromDom(tableEl, node);
        });

        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tableEl.appendChild(tbody);
  }

  private addTableRow(tableEl: HTMLTableElement, node: SceneTableNode): void {
    const numCols = Math.max(1, node.element.columns.length);
    const newCells: CanonicalTableCell[] = [];
    for (let c = 0; c < numCols; c++) {
      newCells.push({
        id: IdGenerator.objectId(`cell_${node.element.rows.length}_${c}`),
        elements: [],
      });
    }
    const newRow: CanonicalTableRow = {
      id: IdGenerator.objectId(`row_${node.element.rows.length}`),
      cells: newCells,
    };
    const updatedTable: CanonicalTable = {
      ...node.element,
      rows: [...node.element.rows, newRow],
    };
    (node as any).element = updatedTable;
    this.renderTableContent(tableEl, node);
    if (this.onTableChange) {
      this.onTableChange(node, updatedTable);
    }
  }

  private syncTableFromDom(tableEl: HTMLTableElement, node: SceneTableNode): void {
    const rows = node.element.rows || [];
    let hasChanges = false;
    const updatedRows: CanonicalTableRow[] = [];

    const trElements = Array.from(
      tableEl.querySelectorAll<HTMLTableRowElement>(".onenote-table-row")
    );
    for (let rIdx = 0; rIdx < trElements.length; rIdx++) {
      const tr = trElements[rIdx]!;
      const existingRow = rows[rIdx];
      const tdElements = Array.from(
        tr.querySelectorAll<HTMLTableCellElement>(".onenote-table-cell")
      );
      const updatedCells: CanonicalTableCell[] = [];

      for (let cIdx = 0; cIdx < tdElements.length; cIdx++) {
        const td = tdElements[cIdx]!;
        const existingCell = existingRow?.cells[cIdx];
        const newText = td.innerText || td.textContent || "";

        let currentText = "";
        if (existingCell) {
          for (const cellEl of existingCell.elements) {
            if (cellEl.type === "outline") {
              currentText += (cellEl as CanonicalOutline).paragraphs
                .map((p) => p.runs.map((r) => r.text).join(""))
                .join("\n");
            }
          }
        }

        if (newText !== currentText) {
          hasChanges = true;
        }

        const elements: CanonicalElement[] = newText.trim()
          ? [
              {
                type: "outline",
                id: existingCell?.id
                  ? IdGenerator.objectId(`${existingCell.id}_out`)
                  : IdGenerator.objectId("cell_out"),
                bounds: CoordinateMath.normalizeBounds(0, 0, 100, 30, 1),
                paragraphs: [
                  {
                    id: IdGenerator.objectId("cell_p"),
                    indentLevel: 0,
                    runs: [{ text: newText }],
                  },
                ],
              },
            ]
          : [];

        updatedCells.push({
          id: existingCell?.id || IdGenerator.objectId(`cell_${rIdx}_${cIdx}`),
          elements,
        });
      }

      updatedRows.push({
        id: existingRow?.id || IdGenerator.objectId(`row_${rIdx}`),
        cells: updatedCells,
      });
    }

    if (hasChanges) {
      const updatedTable: CanonicalTable = {
        ...node.element,
        rows: updatedRows,
      };
      (node as any).element = updatedTable;
      if (this.onTableChange) {
        this.onTableChange(node, updatedTable);
      }
    }
  }

  private updateDomTableNode(el: HTMLElement, node: SceneTableNode): void {
    el.style.left = `${node.bounds.x}px`;
    el.style.top = `${node.bounds.y}px`;
    el.style.width = `${Math.max(160, node.bounds.width)}px`;
    el.classList.toggle("is-hidden", !node.visible);
    el.style.zIndex = `${15 + Math.min(10, node.zIndex)}`;
    const effectiveOpacity = this.previousScene
      ? SpatialGroupManager.computeEffectiveOpacity(node, this.previousScene)
      : (node.opacity ?? 1.0);
    el.style.opacity = `${effectiveOpacity}`;

    const tableEl = el.querySelector(".onenote-table") as HTMLTableElement;
    if (tableEl && !tableEl.contains(document.activeElement)) {
      this.renderTableContent(tableEl, node);
    }
  }

  private createDomImageNode(node: SceneImageNode): HTMLElement {
    const el = document.createElement("div");
    el.id = `dom-image-${node.id}`;
    el.className = "onenote-image-container";
    (el as any).datasetNodeId = node.id;

    // Top grab handle
    const header = document.createElement("div");
    header.className = "onenote-container-header";
    const grab = document.createElement("div");
    grab.className = "onenote-container-grab-handle";
    grab.title = "Drag to move image";
    const grabDots = document.createElement("span");
    grabDots.className = "onenote-grab-dots";
    grabDots.textContent = "⋮⋮";
    grab.appendChild(grabDots);
    (grab as any).datasetNodeId = node.id;
    header.appendChild(grab);
    el.appendChild(header);

    // Image tag
    const img = document.createElement("img");
    img.className = "onenote-image-element";
    img.draggable = false;
    img.setAttribute("draggable", "false");
    img.alt = node.element?.altText || "Image";

    let src = "";
    const assetId = node.assetId || node.element?.assetId;
    if (this.assetUrlResolver && assetId) {
      src = this.assetUrlResolver(assetId) || "";
    }
    if (!src && this.resourceTracker && assetId) {
      const cachedUrl = this.resourceTracker.getAssetUrl(assetId);
      if (cachedUrl) {
        src = cachedUrl;
      } else {
        const rawData = this.resourceTracker.getAssetData(assetId);
        if (rawData && rawData.length > 0) {
          const mime = node.mimeType || node.element?.mimeType || "image/png";
          if (typeof Buffer !== "undefined") {
            src = `data:${mime};base64,${Buffer.from(rawData).toString("base64")}`;
          } else {
            let binary = "";
            for (let i = 0; i < rawData.byteLength; i++) {
              binary += String.fromCharCode(rawData[i]!);
            }
            src = `data:${mime};base64,${btoa(binary)}`;
          }
          this.resourceTracker.setAssetUrl(assetId, src);
        }
      }
    }
    if (!src && (node.element as any)?.data) {
      const rawData = (node.element as any).data;
      if (rawData instanceof Uint8Array && rawData.length > 0) {
        const mime = node.mimeType || node.element?.mimeType || "image/png";
        if (typeof Buffer !== "undefined") {
          src = `data:${mime};base64,${Buffer.from(rawData).toString("base64")}`;
        }
      }
    }

    if (src) {
      img.src = src;
    } else {
      img.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150"><rect width="200" height="150" fill="%23f3f4f6" rx="4"/><text x="100" y="78" font-family="sans-serif" font-size="13" fill="%239ca3af" text-anchor="middle">Embedded Image</text></svg>`;
    }

    el.appendChild(img);

    this.updateDomImageNode(el, node);
    return el;
  }

  private updateDomImageNode(el: HTMLElement, node: SceneImageNode): void {
    el.style.left = `${node.bounds.x}px`;
    el.style.top = `${node.bounds.y}px`;
    el.style.width = `${Math.max(50, node.bounds.width)}px`;
    el.style.height = `${Math.max(50, node.bounds.height)}px`;
    el.classList.toggle("is-hidden", !node.visible);
    el.style.zIndex = `${10 + Math.min(10, node.zIndex)}`;
    const effectiveOpacity = this.previousScene
      ? SpatialGroupManager.computeEffectiveOpacity(node, this.previousScene)
      : (node.opacity ?? 1.0);
    el.style.opacity = `${effectiveOpacity}`;
  }

  private createDomInkNode(node: SceneInkNode): HTMLElement {
    const el = document.createElement("div");
    el.id = `dom-ink-${node.id}`;
    el.className = "onenote-ink-container";
    (el as any).datasetNodeId = node.id;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "onenote-ink-svg");

    el.appendChild(svg);
    this.updateDomInkNode(el, node);
    return el;
  }

  private updateDomInkNode(el: HTMLElement, node: SceneInkNode): void {
    const b = node.bounds;
    el.style.left = `${b.x}px`;
    el.style.top = `${b.y}px`;
    el.style.width = `${Math.max(CANVAS_INK_METRICS.MIN_BOUNDS_DIMENSION, b.width)}px`;
    el.style.height = `${Math.max(CANVAS_INK_METRICS.MIN_BOUNDS_DIMENSION, b.height)}px`;
    el.classList.toggle("is-hidden", !node.visible);
    el.style.zIndex = `${(node.isHighlighter ? 5 : 40) + Math.min(10, node.zIndex)}`;

    el.classList.toggle("is-highlighter", !!node.isHighlighter);
    if (node.isHighlighter) {
      el.style.opacity = `${(node.opacity ?? 1.0) * CANVAS_INK_METRICS.HIGHLIGHTER_ALPHA}`;
    } else {
      // Vector pens maintain 100% opacity and normal blend mode for authentic color fidelity
      el.style.opacity = `${node.opacity ?? 1.0}`;
    }

    const svg = el.querySelector(".onenote-ink-svg");
    if (!svg) return;
    emptyElement(svg);

    if (!node.element.strokes || node.element.strokes.length === 0) return;

    for (const stroke of node.element.strokes) {
      if (stroke.points.length < 2) continue;
      const strokeColor =
        stroke.color ||
        (node.isHighlighter
          ? CANVAS_INK_METRICS.DEFAULT_HIGHLIGHTER_COLOR
          : CANVAS_INK_METRICS.DEFAULT_PEN_COLOR);
      const strokeWidth =
        stroke.width ||
        node.strokeWidth ||
        (node.isHighlighter
          ? CANVAS_INK_METRICS.DEFAULT_HIGHLIGHTER_WIDTH
          : CANVAS_INK_METRICS.DEFAULT_STROKE_WIDTH);
      const pts = stroke.points;

      let d = "";
      if (pts.length === 2) {
        d = `M ${pts[0]!.x - b.x} ${pts[0]!.y - b.y} L ${pts[1]!.x - b.x} ${pts[1]!.y - b.y}`;
      } else {
        d = `M ${pts[0]!.x - b.x} ${pts[0]!.y - b.y}`;
        for (let i = 1; i < pts.length - 1; i++) {
          const xc = (pts[i]!.x + pts[i + 1]!.x) / 2 - b.x;
          const yc = (pts[i]!.y + pts[i + 1]!.y) / 2 - b.y;
          d += ` Q ${pts[i]!.x - b.x} ${pts[i]!.y - b.y} ${xc} ${yc}`;
        }
        d += ` L ${pts[pts.length - 1]!.x - b.x} ${pts[pts.length - 1]!.y - b.y}`;
      }

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);

      if (stroke.noveltyEffect) {
        const gradId = `novelty-grad-${node.id}-${stroke.id}`;
        let defs = svg.querySelector("defs");
        if (!defs) {
          defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
          svg.prepend(defs);
        }
        const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        grad.setAttribute("id", gradId);
        grad.setAttribute("x1", "0%");
        grad.setAttribute("y1", "0%");
        grad.setAttribute("x2", "100%");
        grad.setAttribute("y2", "100%");

        const stops = this.getNoveltyGradientStops(stroke.noveltyEffect);
        for (const s of stops) {
          const stopEl = document.createElementNS("http://www.w3.org/2000/svg", "stop");
          stopEl.setAttribute("offset", s.offset);
          stopEl.setAttribute("stop-color", s.color);
          grad.appendChild(stopEl);
        }
        defs.appendChild(grad);
        path.setAttribute("stroke", `url(#${gradId})`);
      } else {
        path.setAttribute("stroke", strokeColor);
      }

      if (stroke.penType === "pencil") {
        path.setAttribute("stroke-opacity", CANVAS_INK_METRICS.PENCIL_STROKE_OPACITY);
        path.setAttribute("stroke-dasharray", CANVAS_INK_METRICS.PENCIL_DASHARRAY);
      }

      path.setAttribute("stroke-width", `${strokeWidth}`);
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("fill", "none");
      svg.appendChild(path);
    }
  }

  private getNoveltyGradientStops(effect: string): Array<{ offset: string; color: string }> {
    const match = NOVELTY_INK_DEFINITIONS.find((def) => def.effect === effect);
    if (match) {
      return [...match.stops];
    }
    return [
      { offset: "0%", color: "#000000" },
      { offset: "100%", color: "#555555" },
    ];
  }

  private createDomAttachmentNode(node: SceneAttachmentNode): HTMLElement {
    const el = document.createElement("div");
    el.id = `dom-attachment-${node.id}`;
    el.className = "onenote-attachment-card";
    (el as any).datasetNodeId = node.id;

    const icon = document.createElement("span");
    icon.className = "onenote-attachment-icon";
    icon.textContent = "📎";
    el.appendChild(icon);

    const info = document.createElement("div");
    info.className = "onenote-attachment-info";

    const name = document.createElement("div");
    name.className = "onenote-attachment-name";
    name.textContent = node.fileName;
    info.appendChild(name);

    const size = document.createElement("div");
    size.className = "onenote-attachment-size";
    const sizeKb = node.fileSizeBytes ? `${(node.fileSizeBytes / 1024).toFixed(1)} KB` : "";
    size.textContent = sizeKb;
    info.appendChild(size);

    el.appendChild(info);

    el.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (this.onAttachmentClick) {
        this.onAttachmentClick(node);
      }
    });

    this.updateDomAttachmentNode(el, node);
    return el;
  }

  private updateDomAttachmentNode(el: HTMLElement, node: SceneAttachmentNode): void {
    el.style.left = `${node.bounds.x}px`;
    el.style.top = `${node.bounds.y}px`;
    el.classList.toggle("is-hidden", !node.visible);
    const effectiveOpacity = this.previousScene
      ? SpatialGroupManager.computeEffectiveOpacity(node, this.previousScene)
      : (node.opacity ?? 1.0);
    el.style.opacity = `${effectiveOpacity}`;
  }

  private createDomGroupNode(node: SceneGroupNode): HTMLElement {
    const el = document.createElement("div");
    el.id = `dom-group-${node.id}`;
    el.className = "onenote-spatial-group";
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", `Spatial Group: ${node.title || "Group"}`);
    (el as any).datasetNodeId = node.id;

    // Header
    const header = document.createElement("div");
    header.className = "onenote-spatial-group-header";
    (header as any).datasetNodeId = node.id;

    const icon = document.createElement("span");
    icon.className = "onenote-group-icon";
    icon.textContent = "📁";
    header.appendChild(icon);

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "onenote-group-title-input";
    titleInput.value = node.title || "Group";
    titleInput.placeholder = "Group Title";
    titleInput.setAttribute("aria-label", "Spatial group title");
    titleInput.addEventListener("pointerdown", (e) => e.stopPropagation());
    titleInput.addEventListener("change", () => {
      if (this.onGroupTitleChange) {
        this.onGroupTitleChange(node, titleInput.value.trim() || "Group");
      }
    });
    header.appendChild(titleInput);

    const badge = document.createElement("span");
    badge.className = "onenote-group-badge";
    badge.textContent = `${node.memberIds.length} items`;
    header.appendChild(badge);

    const ungroupBtn = document.createElement("button");
    ungroupBtn.className = "onenote-group-action-btn is-danger";
    ungroupBtn.title = "Ungroup";
    ungroupBtn.setAttribute("aria-label", "Ungroup objects");
    ungroupBtn.textContent = "✕";
    ungroupBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    ungroupBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.onGroupUngroup) {
        this.onGroupUngroup(node);
      }
    });
    header.appendChild(ungroupBtn);

    el.appendChild(header);

    this.updateDomGroupNode(el, node);
    return el;
  }

  private updateDomGroupNode(el: HTMLElement, node: SceneGroupNode): void {
    el.style.left = `${node.bounds.x}px`;
    el.style.top = `${node.bounds.y}px`;
    el.style.width = `${Math.max(160, node.bounds.width)}px`;
    el.style.height = `${Math.max(80, node.bounds.height)}px`;
    el.style.display = node.visible ? "block" : "none";
    el.setAttribute("aria-label", `Spatial Group: ${node.title || "Group"}`);
    if (node.style?.backgroundColor) {
      el.style.backgroundColor = node.style.backgroundColor;
    }
    if (node.style?.borderColor) {
      el.style.borderColor = node.style.borderColor;
    }

    const titleInput = el.querySelector(".onenote-group-title-input") as HTMLInputElement | null;
    if (titleInput && document.activeElement !== titleInput) {
      titleInput.value = node.title || "Group";
    }

    const badge = el.querySelector(".onenote-group-badge") as HTMLElement | null;
    if (badge) {
      badge.textContent = `${node.memberIds.length} items`;
    }
  }

  private createDomAnnotationNode(node: SceneAnnotationNode): HTMLElement {
    const el = document.createElement("div");
    el.id = `dom-annot-${node.id}`;
    el.className = "onenote-spatial-annotation";
    el.setAttribute("role", "note");
    el.setAttribute("aria-label", `Annotation: ${node.semanticKind}`);
    (el as any).datasetNodeId = node.id;

    const badge = document.createElement("span");
    badge.className = "onenote-annotation-badge";
    badge.textContent = `${node.style?.badgeIcon || "💬"} ${node.style?.badgeText || node.semanticKind}`;
    el.appendChild(badge);

    const content = document.createElement("span");
    content.className = "onenote-annotation-content";
    content.textContent = node.content;
    el.appendChild(content);

    this.updateDomAnnotationNode(el, node);
    return el;
  }

  private updateDomAnnotationNode(el: HTMLElement, node: SceneAnnotationNode): void {
    el.style.left = `${node.bounds.x}px`;
    el.style.top = `${node.bounds.y}px`;
    el.classList.toggle("is-hidden", !node.visible);
    el.style.opacity = `${node.opacity ?? 1.0}`;

    const badge = el.querySelector(".onenote-annotation-badge") as HTMLElement | null;
    if (badge) {
      badge.textContent = `${node.style?.badgeIcon || "💬"} ${node.style?.badgeText || node.semanticKind}`;
    }

    const content = el.querySelector(".onenote-annotation-content") as HTMLElement | null;
    if (content) {
      content.textContent = node.content;
    }
  }

  private createStickyNoteGraphics(node: SceneStickyNoteNode): Graphics {
    const g = new Graphics();
    g.label = `StickyNote_${node.id}`;
    g.alpha = node.opacity ?? 1.0;
    this.drawStickyNote(g, node);
    return g;
  }

  private drawStickyNote(g: Graphics, node: SceneStickyNoteNode): void {
    const b = node.bounds;
    const bgColor = parseInt((node.color || "#FFF9C4").replace("#", ""), 16) || 0xfff9c4;
    const borderColor =
      parseInt((node.borderColor || node.color || "#FDE047").replace("#", ""), 16) || 0xfde047;
    const headerColor = node.headerColor
      ? parseInt(node.headerColor.replace("#", ""), 16)
      : undefined;

    const radius = 6;
    const headerHeight = node.title ? 28 : 12;

    // Card Body Fill & Border
    g.roundRect(b.x, b.y, b.width, b.height, radius);
    g.fill({ color: bgColor, alpha: 1.0 });
    g.stroke({ color: borderColor, width: 1, alpha: 0.8 });

    // Card Top Header Band
    if (headerColor !== undefined && headerColor !== bgColor) {
      g.roundRect(b.x, b.y, b.width, headerHeight, radius);
      g.fill({ color: headerColor, alpha: 1.0 });
    }

    // Pin indicator dot/circle if pinned
    if (node.isPinned) {
      g.circle(b.x + b.width / 2, b.y + 6, 3);
      g.fill({ color: 0xef4444, alpha: 0.9 });
    }
  }

  private createDomStickyNoteNode(node: SceneStickyNoteNode): HTMLElement {
    const el = document.createElement("div");
    el.id = `dom-sticky-${node.id}`;
    el.className = "onenote-note-container onenote-sticky-note";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", `Sticky Note: ${node.title || "Untitled"}`);
    el.setAttribute("tabindex", "0");
    (el as any).datasetNodeId = node.id;
    (el as any).datasetStickyId = node.id;

    // Tap to open as independent quick note
    el.addEventListener("click", (e) => {
      const openWin = FloatingStickyNoteManager.getInstance().getOpenNote(node.id);
      if (openWin) {
        e.stopPropagation();
        openWin.focus();
      } else if (this.onStickyNotePopout) {
        e.stopPropagation();
        this.onStickyNotePopout(node);
      }
    });

    // 1. Sticky Note Header Bar (Drag Surface & Actions)
    const header = document.createElement("div");
    header.className = "onenote-sticky-header";
    (header as any).datasetNodeId = node.id;

    const left = document.createElement("div");
    left.className = "onenote-sticky-header-left";
    (left as any).datasetNodeId = node.id;

    // OneNote Top-Left "+" New Note Button
    const newNoteBtn = document.createElement("button");
    newNoteBtn.className = "onenote-sticky-action-btn onenote-sticky-new-btn";
    newNoteBtn.title = STICKY_NOTE_STRINGS.NEW_NOTE_TOOLTIP;
    newNoteBtn.setAttribute("aria-label", STICKY_NOTE_STRINGS.NEW_NOTE_TOOLTIP);
    setSvgContent(newNoteBtn, STICKY_NOTE_SVG_ICONS.PLUS);
    newNoteBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    newNoteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.onStickyNoteCreateSibling) {
        this.onStickyNoteCreateSibling(node);
      } else if (this.onStickyNoteDuplicate) {
        this.onStickyNoteDuplicate(node);
      }
    });
    left.appendChild(newNoteBtn);

    const grabDots = document.createElement("span");
    grabDots.className = "onenote-sticky-grab-dots";
    setSvgContent(grabDots, STICKY_NOTE_SVG_ICONS.GRAB_DOTS);
    grabDots.title = STICKY_NOTE_ACCESSIBILITY_STRINGS.DRAG_TOOLTIP;
    grabDots.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.DRAG_HANDLE);
    (grabDots as any).datasetNodeId = node.id;
    left.appendChild(grabDots);

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "onenote-sticky-title-input";
    titleInput.placeholder = STICKY_NOTE_STRINGS.TITLE_PLACEHOLDER;
    titleInput.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.STICKY_NOTE_TITLE);
    titleInput.value = node.title || "";
    titleInput.addEventListener("pointerdown", (e) => e.stopPropagation());
    titleInput.addEventListener("click", (e) => e.stopPropagation());
    titleInput.addEventListener("change", () => {
      if (this.onStickyNoteTitleChange) {
        this.onStickyNoteTitleChange(node, titleInput.value.trim());
      }
    });
    titleInput.addEventListener("blur", () => {
      if (this.onStickyNoteTitleChange && titleInput.value.trim() !== (node.title || "")) {
        this.onStickyNoteTitleChange(node, titleInput.value.trim());
      }
    });
    left.appendChild(titleInput);
    header.appendChild(left);

    // 2. Actions Toolbar
    const actions = document.createElement("div");
    actions.className = "onenote-sticky-header-actions";

    // Relationship Badge & Popover
    const relPopover = document.createElement("div");
    relPopover.className = "onenote-relationship-popover is-hidden";
    el.appendChild(relPopover);

    const relBadge = document.createElement("button");
    relBadge.className = "onenote-sticky-link-badge is-hidden";
    relBadge.title = STICKY_NOTE_STRINGS.BACKLINKS_TOOLTIP;
    relBadge.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.SPATIAL_BACKLINKS);
    const relIconSpan = document.createElement("span");
    relIconSpan.className = "onenote-menu-icon onenote-link-badge-icon";
    setSvgContent(relIconSpan, STICKY_NOTE_SVG_ICONS.LINK);
    relBadge.appendChild(relIconSpan);
    relBadge.appendChild(document.createTextNode("0"));
    relBadge.addEventListener("pointerdown", (e) => e.stopPropagation());
    relBadge.addEventListener("click", (e) => {
      e.stopPropagation();
      colorPopover.classList.add("is-hidden");
      opacityPopover.classList.add("is-hidden");
      this.populateRelationshipPopover(relPopover, node);
      relPopover.classList.toggle("is-hidden");
      if (!relPopover.classList.contains("is-hidden")) {
        relPopover.style.top = `${POPOVER_OFFSETS.TOP_PX}px`;
        relPopover.style.right = `${POPOVER_OFFSETS.RIGHT_PX}px`;
      }
    });

    relBadge.addEventListener("mouseenter", () => {
      if (this.onNodeHoverStateChange) {
        this.onNodeHoverStateChange(node.id);
      }
    });
    relBadge.addEventListener("mouseleave", () => {
      if (this.onNodeHoverStateChange) {
        this.onNodeHoverStateChange(null);
      }
    });
    actions.appendChild(relBadge);

    // Spatial Anchor Badge & Popover
    const anchorPopover = document.createElement("div");
    anchorPopover.className = "onenote-anchor-popover is-hidden";
    el.appendChild(anchorPopover);

    const anchorBadge = document.createElement("button");
    anchorBadge.className = "onenote-sticky-anchor-badge is-hidden";
    anchorBadge.title = STICKY_NOTE_STRINGS.ANCHOR_TOOLTIP;
    anchorBadge.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.SPATIAL_ANCHOR);
    setSvgContent(anchorBadge, STICKY_NOTE_SVG_ICONS.ANCHOR);
    anchorBadge.addEventListener("pointerdown", (e) => e.stopPropagation());
    anchorBadge.addEventListener("click", (e) => {
      e.stopPropagation();
      colorPopover.classList.add("is-hidden");
      opacityPopover.classList.add("is-hidden");
      relPopover.classList.add("is-hidden");
      this.populateAnchorPopover(anchorPopover, node);
      anchorPopover.classList.toggle("is-hidden");
      if (!anchorPopover.classList.contains("is-hidden")) {
        anchorPopover.style.top = `${POPOVER_OFFSETS.TOP_PX}px`;
        anchorPopover.style.right = `${POPOVER_OFFSETS.RIGHT_PX}px`;
      }
    });

    anchorBadge.addEventListener("mouseenter", () => {
      if (this.onNodeHoverStateChange) {
        this.onNodeHoverStateChange(node.id);
      }
    });
    anchorBadge.addEventListener("mouseleave", () => {
      if (this.onNodeHoverStateChange) {
        this.onNodeHoverStateChange(null);
      }
    });
    actions.appendChild(anchorBadge);

    // Pin Button
    const pinBtn = document.createElement("button");
    pinBtn.className = `onenote-sticky-action-btn ${node.isPinned ? "is-active" : ""}`;
    pinBtn.title = node.isPinned
      ? STICKY_NOTE_STRINGS.UNPIN_TOOLTIP
      : STICKY_NOTE_STRINGS.PIN_TOOLTIP;
    pinBtn.setAttribute(
      "aria-label",
      node.isPinned
        ? STICKY_NOTE_ACCESSIBILITY_STRINGS.UNPIN_NOTE
        : STICKY_NOTE_ACCESSIBILITY_STRINGS.PIN_NOTE
    );
    setSvgContent(pinBtn, STICKY_NOTE_SVG_ICONS.PIN);
    pinBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.onStickyNotePinToggle) {
        this.onStickyNotePinToggle(node);
      }
    });
    actions.appendChild(pinBtn);

    // Popover elements
    const colorPopover = document.createElement("div");
    colorPopover.className = "onenote-sticky-popover is-hidden";
    const swatchRow = document.createElement("div");
    swatchRow.className = "onenote-swatch-row";
    for (const preset of STICKY_NOTE_COLOR_PRESETS) {
      const sw = document.createElement("div");
      sw.className = "onenote-color-swatch";
      sw.setAttribute("role", "button");
      sw.setAttribute(
        "aria-label",
        `${STICKY_NOTE_ACCESSIBILITY_STRINGS.COLOR_PRESET_PREFIX}${preset}`
      );
      sw.setAttribute("tabindex", "0");
      const pal = StickyNoteUtils.resolveStickyNoteColors(preset);
      sw.style.backgroundColor = pal.background;
      sw.title = preset.charAt(0).toUpperCase() + preset.slice(1);
      sw.addEventListener("click", (e) => {
        e.stopPropagation();
        colorPopover.classList.add("is-hidden");
        if (this.onStickyNoteStyleChange) {
          this.onStickyNoteStyleChange(node, { color: preset });
        }
      });
      sw.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          colorPopover.classList.add("is-hidden");
          if (this.onStickyNoteStyleChange) {
            this.onStickyNoteStyleChange(node, { color: preset });
          }
        }
      });
      swatchRow.appendChild(sw);
    }
    colorPopover.appendChild(swatchRow);
    el.appendChild(colorPopover);

    const opacityPopover = document.createElement("div");
    opacityPopover.className = "onenote-sticky-popover is-hidden";
    const opacityCtrl = document.createElement("div");
    opacityCtrl.className = "onenote-sticky-opacity-control";

    const opHeader = document.createElement("div");
    opHeader.className = "onenote-sticky-opacity-header";
    const currentOp = node.opacity ?? 1.0;
    const opTitleSpan = document.createElement("span");
    opTitleSpan.textContent = STICKY_NOTE_STRINGS.OPACITY_HEADER;
    const opValSpan = document.createElement("span");
    opValSpan.className = "onenote-sticky-op-val";
    opValSpan.textContent = `${Math.round(currentOp * 100)}%`;
    opHeader.appendChild(opTitleSpan);
    opHeader.appendChild(opValSpan);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.OPACITY_SLIDER_MIN;
    slider.max = STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.OPACITY_SLIDER_MAX;
    slider.step = STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.OPACITY_SLIDER_STEP;
    slider.value = `${currentOp}`;
    slider.className = "onenote-sticky-opacity-slider";
    slider.setAttribute("role", "slider");
    slider.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.ADJUST_OPACITY);
    slider.setAttribute("aria-valuemin", STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.OPACITY_SLIDER_MIN);
    slider.setAttribute("aria-valuemax", STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.OPACITY_SLIDER_MAX);
    slider.setAttribute("aria-valuenow", `${currentOp}`);

    slider.addEventListener("input", (e) => {
      e.stopPropagation();
      const val = parseFloat(slider.value);
      slider.setAttribute("aria-valuenow", `${val}`);
      const pctSpan = opHeader.querySelector(".onenote-sticky-op-val");
      if (pctSpan) pctSpan.textContent = `${Math.round(val * 100)}%`;
      el.style.opacity = `${val}`;
      const pixiObj = this.displayObjectMap.get(node.id);
      if (pixiObj) pixiObj.alpha = val;
    });

    slider.addEventListener("change", (e) => {
      e.stopPropagation();
      const val = parseFloat(slider.value);
      slider.setAttribute("aria-valuenow", `${val}`);
      if (this.onStickyNoteStyleChange) {
        this.onStickyNoteStyleChange(node, { opacity: val });
      }
    });

    const chipRow = document.createElement("div");
    chipRow.className = "onenote-sticky-opacity-chips";
    for (const p of OPACITY_PRESETS) {
      const chip = document.createElement("button");
      chip.className = `onenote-sticky-opacity-chip ${Math.abs(currentOp - p.val) < 0.05 ? "is-active" : ""}`;
      chip.textContent = p.label;
      chip.setAttribute("role", "button");
      chip.setAttribute(
        "aria-label",
        `${STICKY_NOTE_ACCESSIBILITY_STRINGS.SET_OPACITY_PREFIX}${p.label}`
      );
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        slider.value = `${p.val}`;
        slider.setAttribute("aria-valuenow", `${p.val}`);
        const pctSpan = opHeader.querySelector(".onenote-sticky-op-val");
        if (pctSpan) pctSpan.textContent = p.label;
        el.style.opacity = `${p.val}`;
        const pixiObj = this.displayObjectMap.get(node.id);
        if (pixiObj) pixiObj.alpha = p.val;
        opacityPopover.classList.add("is-hidden");
        if (this.onStickyNoteStyleChange) {
          this.onStickyNoteStyleChange(node, { opacity: p.val });
        }
      });
      chipRow.appendChild(chip);
    }

    opacityCtrl.appendChild(opHeader);
    opacityCtrl.appendChild(slider);
    opacityCtrl.appendChild(chipRow);
    opacityPopover.appendChild(opacityCtrl);
    el.appendChild(opacityPopover);

    // Color Button
    const colorBtn = document.createElement("button");
    colorBtn.className = "onenote-sticky-action-btn";
    colorBtn.title = STICKY_NOTE_STRINGS.COLOR_TOOLTIP;
    colorBtn.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.CHANGE_COLOR);
    setSvgContent(colorBtn, STICKY_NOTE_SVG_ICONS.COLOR_PALETTE);
    colorBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    colorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      opacityPopover.classList.add("is-hidden");
      colorPopover.classList.toggle("is-hidden");
      if (!colorPopover.classList.contains("is-hidden")) {
        colorPopover.style.top = `${POPOVER_OFFSETS.TOP_PX}px`;
        colorPopover.style.right = `${POPOVER_OFFSETS.RIGHT_PX}px`;
      }
    });
    actions.appendChild(colorBtn);

    // Opacity Button
    const opacityBtn = document.createElement("button");
    opacityBtn.className = "onenote-sticky-action-btn";
    opacityBtn.title = STICKY_NOTE_STRINGS.OPACITY_TOOLTIP;
    opacityBtn.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.ADJUST_OPACITY);
    setSvgContent(opacityBtn, STICKY_NOTE_SVG_ICONS.OPACITY);
    opacityBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    opacityBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      colorPopover.classList.add("is-hidden");
      opacityPopover.classList.toggle("is-hidden");
      if (!opacityPopover.classList.contains("is-hidden")) {
        opacityPopover.style.top = `${POPOVER_OFFSETS.TOP_PX}px`;
        opacityPopover.style.right = `${POPOVER_OFFSETS.RIGHT_PX}px`;
      }
    });
    actions.appendChild(opacityBtn);

    // Notes list button (replaces redundant "three dots" menu)
    const notesListBtn = document.createElement("button");
    notesListBtn.className = "onenote-sticky-action-btn onenote-sticky-hub-btn";
    notesListBtn.title = STICKY_NOTE_STRINGS.NOTES_LIST_TOOLTIP;
    notesListBtn.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.OPEN_NOTES_LIST);
    setSvgContent(notesListBtn, STICKY_NOTE_SVG_ICONS.HUB_LIST);
    notesListBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    notesListBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      colorPopover.classList.add("is-hidden");
      opacityPopover.classList.add("is-hidden");
      relPopover.classList.add("is-hidden");
      anchorPopover.classList.add("is-hidden");
      if (this.onStickyNoteOpenHub) {
        this.onStickyNoteOpenHub();
      }
    });
    actions.appendChild(notesListBtn);

    // Pop Out Button (Direct Canvas Action & Quick Launch)
    const popoutBtn = document.createElement("button");
    popoutBtn.className = "onenote-sticky-action-btn onenote-sticky-popout-btn";
    popoutBtn.title = STICKY_NOTE_STRINGS.POPOUT_TOOLTIP;
    popoutBtn.setAttribute("aria-label", STICKY_NOTE_STRINGS.POPOUT_TOOLTIP);
    setSvgContent(popoutBtn, STICKY_NOTE_SVG_ICONS.POPOUT);
    popoutBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    popoutBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.onStickyNotePopout) {
        this.onStickyNotePopout(node);
      }
    });
    actions.appendChild(popoutBtn);

    // Close / Delete Button
    const delBtn = document.createElement("button");
    delBtn.className = "onenote-sticky-action-btn";
    delBtn.title = STICKY_NOTE_STRINGS.DELETE_TOOLTIP;
    delBtn.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.DELETE_NOTE);
    setSvgContent(delBtn, STICKY_NOTE_SVG_ICONS.CLOSE);
    delBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.onStickyNoteDelete) {
        this.onStickyNoteDelete(node);
      }
    });
    actions.appendChild(delBtn);

    header.appendChild(actions);
    el.appendChild(header);

    // 3. Note Body (Rich text / contentEditable)
    const body = document.createElement("div");
    body.className = "onenote-container-body onenote-sticky-body";
    body.contentEditable = "true";
    body.spellcheck = true;
    body.setAttribute("data-placeholder", STICKY_NOTE_STRINGS.BODY_PLACEHOLDER);
    setSanitizedHtml(body, node.renderedHtml);

    body.addEventListener("focus", () => {
      el.classList.add("is-focused");
    });

    body.addEventListener("blur", () => {
      el.classList.remove("is-focused");
      if (this.onStickyNoteContentChange) {
        const innerHtml = body.innerHTML || "";
        const textVal = body.innerText || body.textContent || "";
        const hasRichTags = /<(?!p|\/p)[a-z][\s\S]*>/i.test(innerHtml);
        this.onStickyNoteContentChange(node, hasRichTags ? innerHtml : textVal);
      }
    });

    // Paste images directly into sticky note
    body.addEventListener("paste", (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file && file.type.startsWith("image/")) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              formatToolbar.insertImageSrc(reader.result);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    });

    body.addEventListener("click", (e) => {
      const linkEl = (e.target as HTMLElement)?.closest(".internal-link") as HTMLElement | null;
      if (linkEl) {
        const href = linkEl.getAttribute("data-href");
        if (href && this.onWikilinkClick) {
          e.preventDefault();
          e.stopPropagation();
          this.onWikilinkClick(href);
        }
      }
    });

    el.appendChild(body);

    // 4. OneNote Bottom Format Toolbar
    const formatToolbar = new StickyNoteFormatToolbar({
      onMutate: () => {
        if (this.onStickyNoteContentChange) {
          this.onStickyNoteContentChange(node, body.innerHTML || "");
        }
      },
    });
    formatToolbar.attachTo(body);
    el.appendChild(formatToolbar.el);

    // 5. Footer Date/Time
    const footerDate = document.createElement("div");
    footerDate.className = "onenote-sticky-footer-date";
    const modTime = node.element?.modifiedTime || Date.now();
    footerDate.textContent = new Date(modTime).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    el.appendChild(footerDate);

    // 4. Corner & Edge Resizers
    const resizerSE = document.createElement("div");
    resizerSE.className =
      "onenote-sticky-resizer onenote-sticky-resizer-handle onenote-sticky-resizer-se";
    (resizerSE as any).datasetNodeId = node.id;
    (resizerSE as any).datasetHandle = "se";
    el.appendChild(resizerSE);

    const resizerE = document.createElement("div");
    resizerE.className =
      "onenote-sticky-resizer onenote-sticky-resizer-handle onenote-sticky-resizer-e";
    (resizerE as any).datasetNodeId = node.id;
    (resizerE as any).datasetHandle = "e";
    el.appendChild(resizerE);

    const resizerS = document.createElement("div");
    resizerS.className =
      "onenote-sticky-resizer onenote-sticky-resizer-handle onenote-sticky-resizer-s";
    (resizerS as any).datasetNodeId = node.id;
    (resizerS as any).datasetHandle = "s";
    el.appendChild(resizerS);

    this.updateDomStickyNoteNode(el, node);
    return el;
  }

  private updateDomStickyNoteNode(el: HTMLElement, node: SceneStickyNoteNode): void {
    el.style.left = `${node.bounds.x}px`;
    el.style.top = `${node.bounds.y}px`;
    el.style.width = `${Math.max(STICKY_NOTE_METRICS.MIN_WIDTH, node.bounds.width)}px`;
    el.style.height = `${Math.max(STICKY_NOTE_METRICS.MIN_HEIGHT, node.bounds.height)}px`;
    el.style.display = node.visible ? "flex" : "none";
    const effectiveOpacity = this.previousScene
      ? SpatialGroupManager.computeEffectiveOpacity(node, this.previousScene)
      : (node.opacity ?? 1.0);
    el.style.opacity = `${effectiveOpacity}`;

    const isDark =
      typeof document !== "undefined" &&
      (document.body?.classList?.contains("theme-dark") ||
        document.documentElement?.classList?.contains("theme-dark"));
    const colorPreset = node.element?.color || (node.color as any) || "yellow";
    const resolvedColors = StickyNoteUtils.resolveStickyNoteColors(
      colorPreset,
      node.element?.theme,
      isDark
    );

    el.style.backgroundColor = resolvedColors.background;
    el.style.color = resolvedColors.text;
    el.style.borderColor = resolvedColors.border;

    if (node.isPinned) {
      el.classList.add("is-pinned");
    } else {
      el.classList.remove("is-pinned");
    }

    const header = el.querySelector(".onenote-sticky-header") as HTMLElement;
    if (header) {
      header.style.backgroundColor = resolvedColors.header;
    }

    const titleInput = el.querySelector(".onenote-sticky-title-input") as HTMLInputElement;
    if (titleInput && document.activeElement !== titleInput) {
      titleInput.value = node.title || "";
    }

    const body = el.querySelector(".onenote-sticky-body") as HTMLElement;
    if (body && document.activeElement !== body) {
      setSanitizedHtml(body, node.renderedHtml);
    }

    const badge = el.querySelector(".onenote-sticky-link-badge") as HTMLElement | null;
    if (badge) {
      const nodeLinks = this.resolvedLinks?.linksByNodeId.get(node.id);
      const count = nodeLinks ? nodeLinks.totalCount : 0;
      badge.textContent = `🔗 ${count}`;
      badge.classList.toggle("is-hidden", count === 0);
    }

    const anchorBadge = el.querySelector(".onenote-sticky-anchor-badge") as HTMLElement | null;
    if (anchorBadge) {
      const anchor = node.anchor || node.element?.anchor;
      if (anchor) {
        anchorBadge.classList.remove("is-hidden");
        if (anchor.status === "broken") {
          anchorBadge.textContent = "⚓⚠️";
          anchorBadge.classList.add("is-broken");
          anchorBadge.title =
            "Broken Anchor: Target object missing or deleted. Click to repair or detach.";
        } else {
          anchorBadge.textContent = "⚓";
          anchorBadge.classList.remove("is-broken");
          anchorBadge.title = `Anchored to: ${anchor.targetType} [${anchor.targetId || anchor.sourceFile || ""}]`;
        }
      } else {
        anchorBadge.classList.add("is-hidden");
      }
    }

    if (node.element?.spatialMeta?.isPoppedOut) {
      el.classList.add("is-popped-out");
    } else {
      el.classList.remove("is-popped-out");
    }
  }

  private populateRelationshipPopover(popoverEl: HTMLElement, node: SceneStickyNoteNode): void {
    emptyElement(popoverEl);
    if (!this.resolvedLinks) {
      const msg = document.createElement("div");
      msg.className = "onenote-muted-msg";
      msg.textContent = "No relationships discovered.";
      popoverEl.appendChild(msg);
      return;
    }

    const nodeLinks = this.resolvedLinks.linksByNodeId.get(node.id);
    if (!nodeLinks || nodeLinks.totalCount === 0) {
      const msg = document.createElement("div");
      msg.className = "onenote-muted-msg";
      msg.textContent = "No relationships discovered.";
      popoverEl.appendChild(msg);
      return;
    }

    // 1. Outbound Links Section
    if (nodeLinks.outbound.length > 0) {
      const secTitle = document.createElement("div");
      secTitle.className = "onenote-relationship-section-title";
      secTitle.textContent = `Outgoing Links (${nodeLinks.outbound.length})`;
      popoverEl.appendChild(secTitle);

      for (const link of nodeLinks.outbound) {
        const item = document.createElement("div");
        item.className = "onenote-relationship-item";

        const icon = document.createElement("span");
        icon.className = "onenote-accent-icon";
        icon.textContent = "→";
        item.appendChild(icon);

        const lbl = document.createElement("span");
        lbl.className = "onenote-relationship-label";
        lbl.textContent = link.label || link.targetRaw;
        lbl.title = link.targetRaw;
        item.appendChild(lbl);

        const jumpBtn = document.createElement("button");
        jumpBtn.className = "onenote-relationship-jump-btn";
        jumpBtn.title = link.isIntraPage ? "Focus on canvas" : "Open in Obsidian";
        jumpBtn.textContent = "↗";
        jumpBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          popoverEl.classList.add("is-hidden");
          if (link.isIntraPage && link.targetNodeId && this.onFocusNode) {
            this.onFocusNode(link.targetNodeId);
          } else if (this.onWikilinkClick) {
            this.onWikilinkClick(link.targetFile || link.label);
          }
        });
        item.appendChild(jumpBtn);

        popoverEl.appendChild(item);
      }
    }

    // 2. Inbound Backlinks Section
    if (nodeLinks.inbound.length > 0) {
      const secTitle = document.createElement("div");
      secTitle.className = `onenote-relationship-section-title ${nodeLinks.outbound.length > 0 ? "has-margin-top" : ""}`;
      secTitle.textContent = `Incoming Backlinks (${nodeLinks.inbound.length})`;
      popoverEl.appendChild(secTitle);

      for (const link of nodeLinks.inbound) {
        const item = document.createElement("div");
        item.className = "onenote-relationship-item";

        const icon = document.createElement("span");
        icon.className = "onenote-success-icon";
        icon.textContent = "←";
        item.appendChild(icon);

        const lbl = document.createElement("span");
        lbl.className = "onenote-relationship-label";
        lbl.textContent = link.label || link.sourceTitle || link.targetRaw;
        item.appendChild(lbl);

        const jumpBtn = document.createElement("button");
        jumpBtn.className = "onenote-relationship-jump-btn";
        jumpBtn.title = link.isIntraPage ? "Focus on canvas" : "Open in Obsidian";
        jumpBtn.textContent = "↗";
        jumpBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          popoverEl.classList.add("is-hidden");
          if (link.isIntraPage && this.onFocusNode) {
            this.onFocusNode(link.sourceNodeId);
          } else if (this.onWikilinkClick) {
            this.onWikilinkClick(link.targetFile || link.label);
          }
        });
        item.appendChild(jumpBtn);

        popoverEl.appendChild(item);
      }
    }
  }

  private populateAnchorPopover(popoverEl: HTMLElement, node: SceneStickyNoteNode): void {
    emptyElement(popoverEl);
    const anchor = node.anchor || node.element?.anchor;
    if (!anchor) {
      // Unanchored Note: Provide quick anchor affordance
      const header = document.createElement("div");
      header.className = "onenote-anchor-header";
      header.textContent = "Free-Floating Note";
      popoverEl.appendChild(header);

      const msg = document.createElement("div");
      msg.className = "onenote-anchor-msg";
      msg.textContent = "This note is free-floating. Pick a nearby target to anchor:";
      popoverEl.appendChild(msg);

      const nearby = this.previousScene
        ? SpatialAnchorManager.findNearbyAnchorTargets(node, this.previousScene, 250)
        : [];

      if (nearby.length > 0) {
        const targetsSec = document.createElement("div");
        targetsSec.className = "onenote-anchor-targets-sec";

        for (const target of nearby.slice(0, 3)) {
          const btn = document.createElement("button");
          btn.className = "onenote-anchor-action-btn";
          btn.textContent = `⚓ Anchor to ${target.layer}`;
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            popoverEl.classList.add("is-hidden");
            const newAnchor = SpatialAnchorManager.createAnchorForNote(node, target);
            if (this.onStickyNoteAnchorChange) {
              this.onStickyNoteAnchorChange(node, newAnchor);
            }
          });
          targetsSec.appendChild(btn);
        }
        popoverEl.appendChild(targetsSec);
      }
      return;
    }


    const resolved = this.previousScene
      ? SpatialAnchorManager.resolveAnchor(node, this.previousScene)
      : null;

    const isBroken = !resolved || resolved.status === "broken";

    // 1. Header
    const header = document.createElement("div");
    header.className = "onenote-anchor-header";

    const titleSpan = document.createElement("span");
    titleSpan.textContent = "Spatial Anchor";
    header.appendChild(titleSpan);

    const statusBadge = document.createElement("span");
    statusBadge.className = `onenote-anchor-status ${isBroken ? "is-broken" : "is-resolved"}`;
    statusBadge.textContent = isBroken ? "⚠️ Target Missing" : "🟢 Attached";
    header.appendChild(statusBadge);
    popoverEl.appendChild(header);

    // 2. Target info
    const targetField = document.createElement("div");
    targetField.className = "onenote-anchor-field";

    const targetLabel = document.createElement("span");
    targetLabel.className = "onenote-anchor-label";
    targetLabel.textContent = "Anchored Target";
    targetField.appendChild(targetLabel);

    const targetVal = document.createElement("span");
    targetVal.className = "onenote-anchor-value";
    targetVal.textContent =
      resolved?.targetTitle || anchor.targetId || anchor.sourceFile || "Unknown";
    targetField.appendChild(targetVal);
    popoverEl.appendChild(targetField);

    // 3. Offset info
    const offsetField = document.createElement("div");
    offsetField.className = "onenote-anchor-field";

    const offsetLabel = document.createElement("span");
    offsetLabel.className = "onenote-anchor-label";
    offsetLabel.textContent = "Relative Offset";
    offsetField.appendChild(offsetLabel);

    const offsetVal = document.createElement("span");
    offsetVal.className = "onenote-anchor-value";
    offsetVal.textContent = `ΔX: ${Math.round(anchor.offsetX)}px, ΔY: ${Math.round(anchor.offsetY)}px`;
    offsetField.appendChild(offsetVal);
    popoverEl.appendChild(offsetField);

    // 4. Action Buttons (Jump, Repair, Unanchor)
    const actionsRow = document.createElement("div");
    actionsRow.className = "onenote-anchor-actions";

    if (!isBroken && resolved?.targetNode) {
      const jumpBtn = document.createElement("button");
      jumpBtn.className = "onenote-anchor-action-btn is-primary";
      jumpBtn.textContent = "↗ Jump";
      jumpBtn.title = "Focus anchored target on canvas";
      jumpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        popoverEl.classList.add("is-hidden");
        if (resolved.targetNode && this.onFocusNode) {
          this.onFocusNode(resolved.targetNode.id);
        }
      });
      actionsRow.appendChild(jumpBtn);
    }

    if (isBroken && this.previousScene) {
      const nearby = SpatialAnchorManager.findNearbyAnchorTargets(node, this.previousScene, 300);
      if (nearby.length > 0) {
        const repairBtn = document.createElement("button");
        repairBtn.className = "onenote-anchor-action-btn is-primary";
        repairBtn.textContent = "🔧 Relink";
        repairBtn.title = "Relink to nearest canvas object";
        repairBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          popoverEl.classList.add("is-hidden");
          const repaired = SpatialAnchorManager.repairAnchor(node, nearby[0]!);
          if (this.onStickyNoteAnchorChange) {
            this.onStickyNoteAnchorChange(node, repaired);
          }
        });
        actionsRow.appendChild(repairBtn);
      }
    }

    const unanchorBtn = document.createElement("button");
    unanchorBtn.className = "onenote-anchor-action-btn is-danger";
    unanchorBtn.textContent = "🔓 Detach";
    unanchorBtn.title = "Convert back to free-floating note";
    unanchorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      popoverEl.classList.add("is-hidden");
      SpatialAnchorManager.removeAnchor(node);
      if (this.onStickyNoteAnchorChange) {
        this.onStickyNoteAnchorChange(node, undefined);
      }
    });
    actionsRow.appendChild(unanchorBtn);

    popoverEl.appendChild(actionsRow);
  }

  private syncTitleHeader(scene: PageScene): void {
    if (!this.domOverlay) return;

    if (scene.sceneOptions?.showPageTitle === false) {
      if (this.titleBlockEl?.parentElement) {
        this.titleBlockEl.parentElement.removeChild(this.titleBlockEl);
        this.titleBlockEl = null;
      }
      return;
    }

    if (!this.titleBlockEl) {
      const block = document.createElement("div");
      block.id = "dom-page-title-block";
      block.className = "onenote-page-title-block";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "onenote-title-input";
      input.placeholder = "Untitled Page";
      input.addEventListener("input", () => {
        if (this.onTitleChange) {
          this.onTitleChange(input.value);
        }
      });
      input.addEventListener("change", () => {
        if (this.onTitleChange) {
          this.onTitleChange(input.value);
        }
      });

      const meta = document.createElement("div");
      meta.className = "onenote-title-meta";

      const divider = document.createElement("div");
      divider.className = "onenote-title-divider";

      block.appendChild(input);
      block.appendChild(meta);
      block.appendChild(divider);

      this.domOverlay.appendChild(block);
      this.titleBlockEl = block;
    }

    const marginX = scene.canvasStyle.ruleLines?.marginX ?? 48;
    this.titleBlockEl.style.left = `${marginX}px`;
    this.titleBlockEl.style.top = `36px`;

    const input = this.titleBlockEl.querySelector(".onenote-title-input") as HTMLInputElement;
    if (input && document.activeElement !== input) {
      input.value = scene.title || "";
    }

    const meta = this.titleBlockEl.querySelector(".onenote-title-meta") as HTMLElement;
    if (meta) {
      meta.textContent = formatOneNoteDate(scene.createdTime);
    }
  }

  private renderSelectionVisuals(): void {
    this.selectionGraphics.clear();

    // Update DOM note container selection state
    const selIdSet = new Set(this.selectedNodes.map((n) => n.id));
    for (const [id, el] of this.domNodeMap.entries()) {
      if (selIdSet.has(id)) {
        el.classList.add("is-selected");
      } else {
        el.classList.remove("is-selected");
      }
    }

    if (this.selectedNodes.length === 0) return;

    for (const node of this.selectedNodes) {
      // Outline text containers use native top handle and right resizer instead of vector gizmo boxes
      if (node.layer === "text") continue;

      const b = node.bounds;
      const pad = 4;

      // Selection bounding box
      this.selectionGraphics.rect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
      this.selectionGraphics.stroke({
        color: 0x3b82f6,
        width: 1.5,
        alpha: 0.9,
      });

      // 8 Interactive resize handles for non-text objects (images, shapes, tables)
      const handleSize = 6;
      const { x, y, width: w, height: h } = b;
      const handles = [
        { x: x - pad, y: y - pad }, // NW
        { x: x + w / 2, y: y - pad }, // N
        { x: x + w + pad, y: y - pad }, // NE
        { x: x + w + pad, y: y + h / 2 }, // E
        { x: x + w + pad, y: y + h + pad }, // SE
        { x: x + w / 2, y: y + h + pad }, // S
        { x: x - pad, y: y + h + pad }, // SW
        { x: x - pad, y: y + h / 2 }, // W
      ];

      for (const pt of handles) {
        this.selectionGraphics.rect(
          pt.x - handleSize / 2,
          pt.y - handleSize / 2,
          handleSize,
          handleSize
        );
        this.selectionGraphics.fill(0xffffff);
        this.selectionGraphics.stroke({ color: 0x3b82f6, width: 1.5 });
      }
    }
  }

  public renderActiveStroke(
    points: readonly Point2D[],
    color: string,
    width: number,
    isHighlighter: boolean
  ): void {
    this.activeStrokeGraphics.clear();
    if (points.length < 2) return;

    const strokeColor = parseInt(color.replace("#", ""), 16) || 0x000000;
    const alpha = isHighlighter ? 0.35 : 1.0;

    this.activeStrokeGraphics.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) {
      this.activeStrokeGraphics.lineTo(points[i]!.x, points[i]!.y);
    }

    this.activeStrokeGraphics.stroke({
      color: strokeColor,
      width: Math.max(1, width),
      alpha,
      cap: "round",
      join: "round",
    });
  }

  public clearActiveStroke(): void {
    this.activeStrokeGraphics.clear();
  }

  public renderLasso(points: readonly Point2D[]): void {
    this.lassoGraphics.clear();
    if (points.length < 2) return;

    if (points.length === 2) {
      // Marquee box
      const p1 = points[0]!;
      const p2 = points[1]!;
      const minX = Math.min(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const w = Math.abs(p2.x - p1.x);
      const h = Math.abs(p2.y - p1.y);

      this.lassoGraphics.rect(minX, minY, w, h);
      this.lassoGraphics.fill({ color: 0x3b82f6, alpha: 0.1 });
      this.lassoGraphics.stroke({ color: 0x3b82f6, width: 1, alpha: 0.8 });
      return;
    }

    // Polygon lasso
    this.lassoGraphics.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) {
      this.lassoGraphics.lineTo(points[i]!.x, points[i]!.y);
    }
    this.lassoGraphics.fill({ color: 0x3b82f6, alpha: 0.1 });
    this.lassoGraphics.stroke({ color: 0x3b82f6, width: 1, alpha: 0.8 });
  }

  public clearLasso(): void {
    this.lassoGraphics.clear();
  }

  public renderShapePreview(
    shapeKind: import("../../model/CanonicalElements").ShapeKind,
    startPt: Point2D,
    currentPt: Point2D,
    strokeColor: string,
    strokeWidth: number,
    fillColor?: string
  ): void {
    this.activeStrokeGraphics.clear();
    const minX = Math.min(startPt.x, currentPt.x);
    const minY = Math.min(startPt.y, currentPt.y);
    const width = Math.max(4, Math.abs(currentPt.x - startPt.x));
    const height = Math.max(4, Math.abs(currentPt.y - startPt.y));
    const b = { x: minX, y: minY, width, height };

    const color = parseInt(strokeColor.replace("#", ""), 16) || 0x000000;
    const fill = fillColor ? parseInt(fillColor.replace("#", ""), 16) : undefined;

    switch (shapeKind) {
      case "rectangle":
        this.activeStrokeGraphics.rect(b.x, b.y, b.width, b.height);
        break;
      case "rounded_rectangle":
        this.activeStrokeGraphics.roundRect(
          b.x,
          b.y,
          b.width,
          b.height,
          Math.min(16, Math.min(b.width, b.height) / 4)
        );
        break;
      case "ellipse":
        this.activeStrokeGraphics.ellipse(
          b.x + b.width / 2,
          b.y + b.height / 2,
          b.width / 2,
          b.height / 2
        );
        break;
      case "triangle":
        this.activeStrokeGraphics.moveTo(b.x + b.width / 2, b.y);
        this.activeStrokeGraphics.lineTo(b.x + b.width, b.y + b.height);
        this.activeStrokeGraphics.lineTo(b.x, b.y + b.height);
        this.activeStrokeGraphics.closePath();
        break;
      case "right_triangle":
        this.activeStrokeGraphics.moveTo(b.x, b.y);
        this.activeStrokeGraphics.lineTo(b.x, b.y + b.height);
        this.activeStrokeGraphics.lineTo(b.x + b.width, b.y + b.height);
        this.activeStrokeGraphics.closePath();
        break;
      case "diamond":
        this.activeStrokeGraphics.moveTo(b.x + b.width / 2, b.y);
        this.activeStrokeGraphics.lineTo(b.x + b.width, b.y + b.height / 2);
        this.activeStrokeGraphics.lineTo(b.x + b.width / 2, b.y + b.height);
        this.activeStrokeGraphics.lineTo(b.x, b.y + b.height / 2);
        this.activeStrokeGraphics.closePath();
        break;
      case "star": {
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        const rOuter = Math.min(b.width, b.height) / 2;
        const rInner = rOuter * 0.4;
        for (let i = 0; i < 10; i++) {
          const angle = (i * Math.PI) / 5 - Math.PI / 2;
          const r = i % 2 === 0 ? rOuter : rInner;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          if (i === 0) this.activeStrokeGraphics.moveTo(px, py);
          else this.activeStrokeGraphics.lineTo(px, py);
        }
        this.activeStrokeGraphics.closePath();
        break;
      }
      case "line":
      case "arrow":
      case "double_arrow": {
        this.activeStrokeGraphics.moveTo(startPt.x, startPt.y);
        this.activeStrokeGraphics.lineTo(currentPt.x, currentPt.y);
        if (shapeKind === "arrow" || shapeKind === "double_arrow") {
          const angle = Math.atan2(currentPt.y - startPt.y, currentPt.x - startPt.x);
          const arrowHeadLen = 14;
          this.activeStrokeGraphics.moveTo(currentPt.x, currentPt.y);
          this.activeStrokeGraphics.lineTo(
            currentPt.x - arrowHeadLen * Math.cos(angle - Math.PI / 6),
            currentPt.y - arrowHeadLen * Math.sin(angle - Math.PI / 6)
          );
          this.activeStrokeGraphics.moveTo(currentPt.x, currentPt.y);
          this.activeStrokeGraphics.lineTo(
            currentPt.x - arrowHeadLen * Math.cos(angle + Math.PI / 6),
            currentPt.y - arrowHeadLen * Math.sin(angle + Math.PI / 6)
          );
        }
        if (shapeKind === "double_arrow") {
          const angle = Math.atan2(currentPt.y - startPt.y, currentPt.x - startPt.x);
          const arrowHeadLen = 14;
          this.activeStrokeGraphics.moveTo(startPt.x, startPt.y);
          this.activeStrokeGraphics.lineTo(
            startPt.x + arrowHeadLen * Math.cos(angle - Math.PI / 6),
            startPt.y + arrowHeadLen * Math.sin(angle - Math.PI / 6)
          );
          this.activeStrokeGraphics.moveTo(startPt.x, startPt.y);
          this.activeStrokeGraphics.lineTo(
            startPt.x + arrowHeadLen * Math.cos(angle + Math.PI / 6),
            startPt.y + arrowHeadLen * Math.sin(angle + Math.PI / 6)
          );
        }
        break;
      }
      default:
        this.activeStrokeGraphics.rect(b.x, b.y, b.width, b.height);
        break;
    }

    if (fill !== undefined) {
      this.activeStrokeGraphics.fill({ color: fill, alpha: 0.2 });
    }
    this.activeStrokeGraphics.stroke({
      color,
      width: Math.max(1, strokeWidth),
      alpha: 0.85,
    });
  }

  public clearShapePreview(): void {
    this.activeStrokeGraphics.clear();
  }

  // --- Digital Ruler Support ---
  private rulerEl: HTMLElement | null = null;
  private isRulerVisible = false;
  private rulerAngle = 0; // degrees
  private rulerPosition: Point2D = { x: 300, y: 300 };

  public toggleRuler(visible?: boolean): boolean {
    this.isRulerVisible = visible !== undefined ? visible : !this.isRulerVisible;
    this.updateRulerOverlay();
    return this.isRulerVisible;
  }

  public isRulerActive(): boolean {
    return this.isRulerVisible;
  }

  public getRulerInfo(): { visible: boolean; x: number; y: number; angle: number } {
    return {
      visible: this.isRulerVisible,
      x: this.rulerPosition.x,
      y: this.rulerPosition.y,
      angle: this.rulerAngle,
    };
  }

  public setRulerPosition(pt: Point2D): void {
    this.rulerPosition = { ...pt };
    this.updateRulerOverlay();
  }

  public rotateRuler(deltaAngleDeg: number): void {
    this.rulerAngle = Math.round((this.rulerAngle + deltaAngleDeg + 360) % 360);
    this.updateRulerOverlay();
  }

  private updateRulerOverlay(): void {
    if (!this.domOverlay) return;

    if (!this.isRulerVisible) {
      if (this.rulerEl) {
        this.rulerEl.remove();
        this.rulerEl = null;
      }
      return;
    }

    if (!this.rulerEl) {
      this.rulerEl = document.createElement("div");
      this.rulerEl.className = "onenote-canvas-ruler";
      this.rulerEl.style.width = `${DIGITAL_RULER_METRICS.WIDTH}px`;
      this.rulerEl.style.height = `${DIGITAL_RULER_METRICS.HEIGHT}px`;

      const dial = document.createElement("div");
      dial.className = "onenote-ruler-dial";
      this.rulerEl.appendChild(dial);

      const degLabel = document.createElement("span");
      degLabel.className = "onenote-ruler-degree-label";
      dial.appendChild(degLabel);

      const ticks = document.createElement("div");
      ticks.className = "onenote-ruler-ticks";
      this.rulerEl.appendChild(ticks);

      let isDraggingRuler = false;
      let dragOffset = { x: 0, y: 0 };

      this.rulerEl.addEventListener("pointerdown", (e) => {
        if (e.button === 0) {
          e.stopPropagation();
          isDraggingRuler = true;
          dragOffset = {
            x: e.clientX - this.rulerPosition.x,
            y: e.clientY - this.rulerPosition.y,
          };
          try {
            this.rulerEl?.setPointerCapture(e.pointerId);
          } catch {}
        }
      });

      this.rulerEl.addEventListener("pointermove", (e) => {
        if (isDraggingRuler) {
          e.stopPropagation();
          this.rulerPosition = {
            x: e.clientX - dragOffset.x,
            y: e.clientY - dragOffset.y,
          };
          this.updateRulerOverlay();
        }
      });

      this.rulerEl.addEventListener("pointerup", (e) => {
        if (isDraggingRuler) {
          e.stopPropagation();
          isDraggingRuler = false;
          try {
            this.rulerEl?.releasePointerCapture(e.pointerId);
          } catch {}
        }
      });

      this.rulerEl.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          const delta = e.deltaY < 0 ? 5 : -5;
          this.rotateRuler(delta);
        },
        { passive: false }
      );

      this.domOverlay.appendChild(this.rulerEl);
    }

    this.rulerEl.style.left = `${this.rulerPosition.x}px`;
    this.rulerEl.style.top = `${this.rulerPosition.y}px`;
    this.rulerEl.style.transform = `translate(-50%, -50%) rotate(${this.rulerAngle}deg)`;
    const degLabel = this.rulerEl.querySelector(".onenote-ruler-degree-label");
    if (degLabel) {
      degLabel.textContent = `${this.rulerAngle}°`;
    }
  }

  private renderHoverVisual(): void {
    this.hoverGraphics.clear();
    if (!this.hoveredNode) return;

    // Subtle blue outline for hovered unselected element
    const b = this.hoveredNode.bounds;
    this.hoverGraphics.rect(b.x - 2, b.y - 2, b.width + 4, b.height + 4);
    this.hoverGraphics.stroke({
      color: 0x60a5fa,
      width: 1,
      alpha: 0.6,
    });
  }

  public updateBackground(visibleRect?: import("../../geometry/Rectangle").Rectangle): void {
    if (this.previousScene) {
      this.renderBackground(this.previousScene, visibleRect);
    }
  }

  public renderBackground(
    scene: PageScene,
    visibleRect?: import("../../geometry/Rectangle").Rectangle
  ): void {
    this.hierarchy.backgroundLayer.removeChildren();

    const bg = new Graphics();
    const bounds = scene.canvasBounds;
    const bgColor = parseInt(scene.canvasStyle.backgroundColor.replace("#", ""), 16) || 0xffffff;

    // Calculate background fill area spanning visible area plus content with overshoot
    const minX = visibleRect ? Math.min(bounds.x - 500, visibleRect.x - 500) : bounds.x - 3000;
    const minY = visibleRect ? Math.min(bounds.y - 500, visibleRect.y - 500) : bounds.y - 3000;
    const maxX = visibleRect
      ? Math.max(bounds.x + bounds.width + 500, visibleRect.x + visibleRect.width + 500)
      : bounds.x + bounds.width + 3000;
    const maxY = visibleRect
      ? Math.max(bounds.y + bounds.height + 500, visibleRect.y + visibleRect.height + 500)
      : bounds.y + bounds.height + 3000;
    const width = Math.max(100, maxX - minX);
    const height = Math.max(100, maxY - minY);

    // Fill Paper
    bg.rect(minX, minY, width, height);
    bg.fill(bgColor);

    // Rule lines
    const rule = scene.canvasStyle.ruleLines;
    if (rule && rule.kind !== "none") {
      const lineColor = parseInt(rule.color.replace("#", ""), 16) || 0xd0d0d0;
      const spacing = rule.spacing || 28;

      const contentOriginY = 115;
      const startY = contentOriginY + Math.floor((minY - contentOriginY) / spacing) * spacing;
      for (let y = startY; y <= maxY; y += spacing) {
        bg.moveTo(minX, y);
        bg.lineTo(maxX, y);
      }

      if (
        rule.kind === "small-grid" ||
        rule.kind === "large-grid" ||
        (rule.kind as string) === "grid"
      ) {
        const startX = Math.floor(minX / spacing) * spacing;
        for (let x = startX; x <= maxX; x += spacing) {
          bg.moveTo(x, minY);
          bg.lineTo(x, maxY);
        }
      }

      bg.stroke({ color: lineColor, width: 1, alpha: 0.45 });

      const marginX =
        rule.marginX ??
        (rule.kind === "narrow" || rule.kind === "college" || rule.kind === "wide"
          ? 48
          : undefined);
      if (marginX !== undefined) {
        bg.moveTo(marginX, minY);
        bg.lineTo(marginX, maxY);
        bg.stroke({ color: 0xef4444, width: 1, alpha: 0.5 });
      }
    }

    this.hierarchy.backgroundLayer.addChild(bg);
  }

  public getDisplayObject(id: ObjectId): Container | null {
    return this.displayObjectMap.get(id) ?? null;
  }

  public clear(): void {
    for (const obj of this.displayObjectMap.values()) {
      obj.destroy({ children: true });
    }
    this.displayObjectMap.clear();

    for (const el of this.domNodeMap.values()) {
      if (el.parentElement) {
        el.parentElement.removeChild(el);
      }
    }
    this.domNodeMap.clear();
    this.selectedNodes = [];
    this.hoveredNode = null;
    this.selectionGraphics.clear();
    this.hoverGraphics.clear();
    this.formatBar?.destroy();
    this.formatBar = null;
    this.previousScene = null;
    this.nodeSnapshotMap.clear();
  }
}
