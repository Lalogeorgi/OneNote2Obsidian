import { Graphics } from "pixi.js";
import { SpatialBounds } from "../../geometry/Bounds";
import { Point, Point2D } from "../../geometry/Point";
import { ObjectId } from "../../model/Ids";
import { ResolvedSceneLinks, SpatialLink } from "../../knowledge/SpatialLinkGraph";
import { SceneGraphHierarchy } from "./SceneGraphHierarchy";
import { CANVAS_SPATIAL_LINK_METRICS } from "../../constants/CanvasConstants";

export type SpatialLinkCurveMode = "hover" | "selected" | "always" | "hidden";

interface ConnectionAnchors {
  readonly start: Point2D;
  readonly end: Point2D;
  readonly cp1: Point2D;
  readonly cp2: Point2D;
}

export class SpatialLinkRenderer {
  private graphics: Graphics;
  private currentLinks: ResolvedSceneLinks | null = null;
  private nodeBoundsMap = new Map<ObjectId, SpatialBounds>();
  private anchoredNodesMap = new Map<
    ObjectId,
    import("../../knowledge/SpatialAnchorManager").ResolvedSpatialAnchor
  >();

  private mode: SpatialLinkCurveMode = "hover";
  private hoveredNodeId: ObjectId | null = null;
  private selectedNodeIds = new Set<ObjectId>();

  constructor(private hierarchy: SceneGraphHierarchy) {
    this.graphics = new Graphics();
    this.graphics.label = "SpatialLinkCurves";
    this.hierarchy.spatialLinksLayer.addChild(this.graphics);
  }

  public setLinks(resolved: ResolvedSceneLinks, boundsMap?: Map<ObjectId, SpatialBounds>): void {
    this.currentLinks = resolved;
    if (boundsMap) {
      this.nodeBoundsMap = new Map(boundsMap);
    }
    this.render();
  }

  public setAnchoredNodes(
    anchorsMap: Map<ObjectId, import("../../knowledge/SpatialAnchorManager").ResolvedSpatialAnchor>
  ): void {
    this.anchoredNodesMap = new Map(anchorsMap);
    this.render();
  }

  public setMode(mode: SpatialLinkCurveMode): void {
    if (this.mode !== mode) {
      this.mode = mode;
      this.render();
    }
  }

  public getMode(): SpatialLinkCurveMode {
    return this.mode;
  }

  public setHoveredNode(nodeId: ObjectId | null): void {
    if (this.hoveredNodeId !== nodeId) {
      this.hoveredNodeId = nodeId;
      if (this.mode === "hover") {
        this.render();
      }
    }
  }

  public setSelectedNodes(nodeIds: readonly ObjectId[]): void {
    this.selectedNodeIds.clear();
    for (const id of nodeIds) {
      this.selectedNodeIds.add(id);
    }
    if (this.mode === "selected" || this.mode === "hover") {
      this.render();
    }
  }

  /**
   * Incrementally updates cached bounds for a moving/resizing node and redraws affected curves in O(1).
   */
  public updateNodeBounds(nodeId: ObjectId, newBounds: SpatialBounds): void {
    this.nodeBoundsMap.set(nodeId, newBounds);
    this.render();
  }

  /**
   * Renders the visible connection curves and anchor tethers.
   */
  public render(): void {
    this.graphics.clear();
    if (this.mode === "hidden") {
      return;
    }

    // 1. Draw Intra-Page Backlink & Wikilink Curves
    if (this.currentLinks) {
      const intraLinks = this.currentLinks.intraPageLinks;
      for (const link of intraLinks) {
        if (!link.targetNodeId) continue;

        const isSourceHovered = this.hoveredNodeId === link.sourceNodeId;
        const isTargetHovered = this.hoveredNodeId === link.targetNodeId;
        const isSourceSelected = this.selectedNodeIds.has(link.sourceNodeId);
        const isTargetSelected = this.selectedNodeIds.has(link.targetNodeId);

        let shouldDraw = false;
        let isHighlighted = false;

        if (this.mode === "always") {
          shouldDraw = true;
          isHighlighted =
            isSourceHovered || isTargetHovered || isSourceSelected || isTargetSelected;
        } else if (this.mode === "hover") {
          shouldDraw = isSourceHovered || isTargetHovered || isSourceSelected || isTargetSelected;
          isHighlighted = shouldDraw;
        } else if (this.mode === "selected") {
          shouldDraw = isSourceSelected || isTargetSelected;
          isHighlighted =
            isSourceHovered || isTargetHovered || isSourceSelected || isTargetSelected;
        }

        if (!shouldDraw) continue;

        const sourceBounds = this.nodeBoundsMap.get(link.sourceNodeId) || link.sourceBounds;
        const targetBounds = this.nodeBoundsMap.get(link.targetNodeId) || link.targetBounds;

        if (!sourceBounds || !targetBounds) continue;

        this.drawBezierLink(sourceBounds, targetBounds, link, isHighlighted);
      }
    }

    // 2. Draw Spatial Anchor Tethers
    for (const [nodeId, resolvedAnchor] of this.anchoredNodesMap) {
      const isNodeHovered = this.hoveredNodeId === nodeId;
      const isTargetHovered = Boolean(
        resolvedAnchor.targetNode && this.hoveredNodeId === resolvedAnchor.targetNode.id
      );
      const isNodeSelected = this.selectedNodeIds.has(nodeId);
      const isTargetSelected = Boolean(
        resolvedAnchor.targetNode && this.selectedNodeIds.has(resolvedAnchor.targetNode.id)
      );

      let shouldDrawAnchor = false;
      let isHighlighted = false;

      if (this.mode === "always") {
        shouldDrawAnchor = true;
        isHighlighted = isNodeHovered || isTargetHovered || isNodeSelected || isTargetSelected;
      } else if (this.mode === "hover") {
        shouldDrawAnchor = isNodeHovered || isTargetHovered || isNodeSelected || isTargetSelected;
        isHighlighted = shouldDrawAnchor;
      } else if (this.mode === "selected") {
        shouldDrawAnchor = isNodeSelected || isTargetSelected;
        isHighlighted = isNodeHovered || isTargetHovered || isNodeSelected || isTargetSelected;
      }

      if (!shouldDrawAnchor) continue;

      const noteBounds = this.nodeBoundsMap.get(nodeId);
      if (!noteBounds) continue;

      this.drawAnchorTether(noteBounds, resolvedAnchor, isHighlighted);
    }
  }

  public destroy(): void {
    this.graphics.destroy();
    this.currentLinks = null;
    this.nodeBoundsMap.clear();
    this.anchoredNodesMap.clear();
  }

  private drawBezierLink(
    src: SpatialBounds,
    dst: SpatialBounds,
    link: SpatialLink,
    isHighlighted: boolean
  ): void {
    const anchors = this.computeConnectionAnchors(src, dst);

    // Styling
    const isOutbound = link.direction === "outbound";
    const baseColor = isOutbound
      ? CANVAS_SPATIAL_LINK_METRICS.OUTBOUND_BASE_COLOR
      : CANVAS_SPATIAL_LINK_METRICS.INBOUND_BASE_COLOR;
    const highlightColor = isOutbound
      ? CANVAS_SPATIAL_LINK_METRICS.OUTBOUND_HIGHLIGHT_COLOR
      : CANVAS_SPATIAL_LINK_METRICS.INBOUND_HIGHLIGHT_COLOR;
    const color = isHighlighted ? highlightColor : baseColor;
    const strokeWidth = isHighlighted
      ? CANVAS_SPATIAL_LINK_METRICS.HIGHLIGHT_STROKE_WIDTH
      : CANVAS_SPATIAL_LINK_METRICS.BASE_STROKE_WIDTH;
    const alpha = isHighlighted
      ? CANVAS_SPATIAL_LINK_METRICS.HIGHLIGHT_ALPHA
      : CANVAS_SPATIAL_LINK_METRICS.BASE_ALPHA;

    // Optional subtle outer glow for highlighted curves
    if (isHighlighted) {
      this.graphics.setStrokeStyle({
        width: strokeWidth + CANVAS_SPATIAL_LINK_METRICS.GLOW_EXTRA_WIDTH,
        color,
        alpha: CANVAS_SPATIAL_LINK_METRICS.GLOW_ALPHA,
        cap: "round",
        join: "round",
      });
      this.graphics.moveTo(anchors.start.x, anchors.start.y);
      this.graphics.bezierCurveTo(
        anchors.cp1.x,
        anchors.cp1.y,
        anchors.cp2.x,
        anchors.cp2.y,
        anchors.end.x,
        anchors.end.y
      );
      this.graphics.stroke();
    }

    // Main Curve
    this.graphics.setStrokeStyle({
      width: strokeWidth,
      color,
      alpha,
      cap: "round",
      join: "round",
    });
    this.graphics.moveTo(anchors.start.x, anchors.start.y);
    this.graphics.bezierCurveTo(
      anchors.cp1.x,
      anchors.cp1.y,
      anchors.cp2.x,
      anchors.cp2.y,
      anchors.end.x,
      anchors.end.y
    );
    this.graphics.stroke();

    // Arrowhead at Target
    this.drawArrowhead(anchors.cp2, anchors.end, color, alpha, strokeWidth);

    // Source anchor dot
    this.graphics.beginPath();
    this.graphics.circle(anchors.start.x, anchors.start.y, isHighlighted ? 4 : 3);
    this.graphics.fill({ color, alpha });
  }

  private computeConnectionAnchors(src: SpatialBounds, dst: SpatialBounds): ConnectionAnchors {
    const srcCenter = new Point(src.x + src.width / 2, src.y + src.height / 2);
    const dstCenter = new Point(dst.x + dst.width / 2, dst.y + dst.height / 2);

    const dx = dstCenter.x - srcCenter.x;
    const dy = dstCenter.y - srcCenter.y;

    let start: Point2D;
    let end: Point2D;

    // Determine primary connection orientation (horizontal vs vertical)
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx >= 0) {
        // Source Left -> Target Right
        start = new Point(src.x + src.width, src.y + src.height / 2);
        end = new Point(dst.x, dst.y + dst.height / 2);
      } else {
        // Source Right -> Target Left
        start = new Point(src.x, src.y + src.height / 2);
        end = new Point(dst.x + dst.width, dst.y + dst.height / 2);
      }
    } else {
      if (dy >= 0) {
        // Source Top -> Target Bottom
        start = new Point(src.x + src.width / 2, src.y + src.height);
        end = new Point(dst.x + dst.width / 2, dst.y);
      } else {
        // Source Bottom -> Target Top
        start = new Point(src.x + src.width / 2, src.y);
        end = new Point(dst.x + dst.width / 2, dst.y + dst.height);
      }
    }

    const dist = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
    const offset = Math.min(150, Math.max(30, dist * 0.4));

    let cp1: Point2D;
    let cp2: Point2D;

    if (Math.abs(dx) >= Math.abs(dy)) {
      const signX = dx >= 0 ? 1 : -1;
      cp1 = new Point(start.x + offset * signX, start.y);
      cp2 = new Point(end.x - offset * signX, end.y);
    } else {
      const signY = dy >= 0 ? 1 : -1;
      cp1 = new Point(start.x, start.y + offset * signY);
      cp2 = new Point(end.x, end.y - offset * signY);
    }

    return { start, end, cp1, cp2 };
  }

  private drawArrowhead(
    fromPt: Point2D,
    toPt: Point2D,
    color: number,
    alpha: number,
    strokeWidth: number
  ): void {
    const angle = Math.atan2(toPt.y - fromPt.y, toPt.x - fromPt.x);
    const arrowLength = 9 + strokeWidth;
    const arrowWidth = Math.PI / 6; // 30 degrees

    const leftX = toPt.x - arrowLength * Math.cos(angle - arrowWidth);
    const leftY = toPt.y - arrowLength * Math.sin(angle - arrowWidth);
    const rightX = toPt.x - arrowLength * Math.cos(angle + arrowWidth);
    const rightY = toPt.y - arrowLength * Math.sin(angle + arrowWidth);

    this.graphics.beginPath();
    this.graphics.moveTo(toPt.x, toPt.y);
    this.graphics.lineTo(leftX, leftY);
    this.graphics.lineTo(rightX, rightY);
    this.graphics.closePath();
    this.graphics.fill({ color, alpha });
  }

  private drawAnchorTether(
    noteBounds: SpatialBounds,
    resolved: import("../../knowledge/SpatialAnchorManager").ResolvedSpatialAnchor,
    isHighlighted: boolean
  ): void {
    const isBroken = resolved.status === "broken";
    const color = isBroken ? 0xf59e0b : 0x06b6d4; // Amber for broken, Cyan for resolved
    const alpha = isHighlighted ? 1.0 : isBroken ? 0.8 : 0.6;
    const strokeWidth = isHighlighted ? 2.5 : 1.5;

    const start = new Point(
      noteBounds.x + noteBounds.width / 2,
      noteBounds.y + noteBounds.height / 2
    );

    let targetBounds: SpatialBounds;
    if (resolved.targetNode) {
      targetBounds = this.nodeBoundsMap.get(resolved.targetNode.id) || resolved.targetNode.bounds;
    } else if (resolved.anchor.lastKnownTargetBounds) {
      targetBounds = resolved.anchor.lastKnownTargetBounds;
    } else {
      return;
    }

    const end = new Point(
      targetBounds.x + targetBounds.width / 2,
      targetBounds.y + targetBounds.height / 2
    );

    // Draw tether line
    this.graphics.setStrokeStyle({
      width: strokeWidth,
      color,
      alpha,
      cap: "round",
      join: "round",
    });
    this.graphics.moveTo(start.x, start.y);
    this.graphics.lineTo(end.x, end.y);
    this.graphics.stroke();

    // Source Pin (on note)
    this.graphics.beginPath();
    this.graphics.circle(start.x, start.y, isHighlighted ? 4 : 3);
    this.graphics.fill({ color, alpha });

    // Target Anchor Ring
    this.graphics.setStrokeStyle({
      width: 2,
      color,
      alpha,
    });
    this.graphics.beginPath();
    this.graphics.circle(end.x, end.y, isHighlighted ? 7 : 5);
    this.graphics.stroke();

    if (isBroken) {
      // Draw small warning dot inside broken ring
      this.graphics.beginPath();
      this.graphics.circle(end.x, end.y, 2);
      this.graphics.fill({ color: 0xef4444, alpha: 1.0 });
    }
  }
}
