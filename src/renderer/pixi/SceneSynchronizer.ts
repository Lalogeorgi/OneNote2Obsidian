import { Container, Graphics } from "pixi.js";
import { Point2D } from "../../geometry/Point";
import { ObjectId } from "../../model/Ids";
import {
  PageScene,
  PageSceneNode,
  SceneAttachmentNode,
  SceneImageNode,
  SceneInkNode,
  SceneLayerType,
  SceneOutlineNode,
  SceneShapeNode,
  SceneTableNode,
} from "../../pagescene/PageScene";
import { ResourceTracker } from "./ResourceTracker";
import { SceneGraphHierarchy } from "./SceneGraphHierarchy";

export interface SyncStats {
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly removedCount: number;
  readonly unchangedCount: number;
}

export class SceneSynchronizer {
  private displayObjectMap = new Map<ObjectId, Container>();
  private domNodeMap = new Map<ObjectId, HTMLElement>();
  private previousScene: PageScene | null = null;

  private selectionGraphics = new Graphics();
  private hoverGraphics = new Graphics();
  private activeStrokeGraphics = new Graphics();
  private lassoGraphics = new Graphics();
  private selectedNodes: PageSceneNode[] = [];
  private hoveredNode: PageSceneNode | null = null;

  constructor(
    private hierarchy: SceneGraphHierarchy,
    private domOverlay: HTMLElement | null = null,
    _resourceTracker: ResourceTracker | null = null
  ) {
    this.hierarchy.selectionLayer.addChild(this.selectionGraphics);
    this.hierarchy.interactionLayer.addChild(this.hoverGraphics);
    this.hierarchy.interactionLayer.addChild(this.activeStrokeGraphics);
    this.hierarchy.interactionLayer.addChild(this.lassoGraphics);
  }

  /**
   * Incrementally synchronizes a PageScene into PixiJS display objects and DOM overlay nodes.
   */
  public sync(nextScene: PageScene): SyncStats {
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

        // Mount DOM text overlay if outline
        if (node.layer === "text" && this.domOverlay) {
          const domEl = this.createDomTextNode(node as SceneOutlineNode);
          this.domNodeMap.set(node.id, domEl);
          this.domOverlay.appendChild(domEl);
        }
        createdCount++;
      } else {
        // Update existing display object
        const prevNode = this.findPrevNode(node.id);
        const hasChanged = this.hasNodeChanged(prevNode, node);

        if (hasChanged) {
          this.updateDisplayObject(existingDisplayObj, node);

          if (node.layer === "text") {
            const existingDom = this.domNodeMap.get(node.id);
            if (existingDom) {
              this.updateDomTextNode(existingDom, node as SceneOutlineNode);
            }
          }
          updatedCount++;
        } else {
          unchangedCount++;
        }
      }
    }

    // 3. Update Background if style changed
    this.renderBackground(nextScene);

    this.previousScene = nextScene;

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

  private findPrevNode(id: ObjectId): PageSceneNode | null {
    if (!this.previousScene) return null;
    return this.previousScene.nodes.find((n) => n.id === id) || null;
  }

  private hasNodeChanged(prev: PageSceneNode | null, next: PageSceneNode): boolean {
    if (!prev) return true;
    if (prev.zIndex !== next.zIndex) return true;
    if (prev.visible !== next.visible) return true;
    if (prev.bounds.x !== next.bounds.x || prev.bounds.y !== next.bounds.y) return true;
    if (prev.bounds.width !== next.bounds.width || prev.bounds.height !== next.bounds.height) return true;
    if (prev.rotation !== next.rotation || prev.opacity !== next.opacity) return true;
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
      }
    }
  }

  private mountToLayer(layer: SceneLayerType, obj: Container): void {
    switch (layer) {
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

    // Group consecutive strokes with identical style into single batched stroke passes
    const alpha = node.isHighlighter ? 0.35 : 1.0;
    let currentBatchColor = -1;
    let currentBatchWidth = -1;
    let hasActivePathInBatch = false;

    const flushBatch = () => {
      if (hasActivePathInBatch) {
        g.stroke({
          color: currentBatchColor,
          width: Math.max(1, currentBatchWidth),
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
      const strokeWidth = stroke.width || node.strokeWidth || 2;

      if (strokeColor !== currentBatchColor || strokeWidth !== currentBatchWidth) {
        flushBatch();
        currentBatchColor = strokeColor;
        currentBatchWidth = strokeWidth;
      }

      const pts = stroke.points;
      g.moveTo(pts[0]!.x, pts[0]!.y);

      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i]!;
        const p2 = pts[i + 1]!;
        const xc = (p1.x + p2.x) / 2;
        const yc = (p1.y + p2.y) / 2;
        g.quadraticCurveTo(p1.x, p1.y, xc, yc);
      }
      g.lineTo(pts[pts.length - 1]!.x, pts[pts.length - 1]!.y);
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
      case "ellipse":
        g.ellipse(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, b.height / 2);
        break;
      case "arrow":
      case "line": {
        // Draw directional arrow
        g.moveTo(b.x, b.y);
        g.lineTo(b.x + b.width, b.y + b.height);

        if (node.element.shapeKind === "arrow") {
          const angle = Math.atan2(b.height, b.width);
          const arrowHeadLen = 14;
          const endX = b.x + b.width;
          const endY = b.y + b.height;
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
    el.className = "onenote-outline-container";
    el.style.position = "absolute";
    this.updateDomTextNode(el, node);
    return el;
  }

  private updateDomTextNode(el: HTMLElement, node: SceneOutlineNode): void {
    el.style.left = `${node.bounds.x}px`;
    el.style.top = `${node.bounds.y}px`;
    el.style.width = `${Math.max(120, node.bounds.width)}px`;
    el.style.display = node.visible ? "block" : "none";
    el.style.opacity = `${node.opacity ?? 1.0}`;
    el.innerHTML = node.renderedHtml;
  }

  private renderSelectionVisuals(): void {
    this.selectionGraphics.clear();
    if (this.selectedNodes.length === 0) return;

    for (const node of this.selectedNodes) {
      const b = node.bounds;
      const pad = 4;

      // Selection bounding box
      this.selectionGraphics.rect(
        b.x - pad,
        b.y - pad,
        b.width + pad * 2,
        b.height + pad * 2
      );
      this.selectionGraphics.stroke({
        color: 0x3b82f6,
        width: 1.5,
        alpha: 0.9,
      });

      // 8 Interactive resize handles (NW, N, NE, E, SE, S, SW, W)
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

  private renderBackground(scene: PageScene): void {
    this.hierarchy.backgroundLayer.removeChildren();

    const bg = new Graphics();
    const bounds = scene.canvasBounds;
    const bgColor = parseInt(scene.canvasStyle.backgroundColor.replace("#", ""), 16) || 0xffffff;

    // Fill Paper
    bg.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    bg.fill(bgColor);

    // Rule lines
    const rule = scene.canvasStyle.ruleLines;
    if (rule && rule.kind !== "none") {
      const lineColor = parseInt(rule.color.replace("#", ""), 16) || 0xd0d0d0;
      const spacing = rule.spacing || 24;

      for (let y = bounds.y + spacing; y < bounds.y + bounds.height; y += spacing) {
        bg.moveTo(bounds.x, y);
        bg.lineTo(bounds.x + bounds.width, y);
      }

      if (rule.kind === "small-grid" || rule.kind === "large-grid") {
        for (let x = bounds.x + spacing; x < bounds.x + bounds.width; x += spacing) {
          bg.moveTo(x, bounds.y);
          bg.lineTo(x, bounds.y + bounds.height);
        }
      }

      if (rule.marginX) {
        bg.moveTo(bounds.x + rule.marginX, bounds.y);
        bg.lineTo(bounds.x + rule.marginX, bounds.y + bounds.height);
        bg.stroke({ color: 0xef4444, width: 1, alpha: 0.6 });
      }

      bg.stroke({ color: lineColor, width: 1, alpha: 0.5 });
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
    this.previousScene = null;
  }
}
