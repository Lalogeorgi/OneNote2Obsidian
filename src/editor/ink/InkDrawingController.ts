import { Point2D } from "../../geometry/Point";
import { Rectangle } from "../../geometry/Rectangle";
import {
  CanonicalInkStrokeGroup,
  CanonicalStroke,
  CanonicalShape,
  ShapeKind,
  NoveltyInkEffect,
  PenType,
} from "../../model/CanonicalElements";
import { SpatialBounds } from "../../geometry/Bounds";
import { IdGenerator, ObjectId } from "../../model/Ids";
import { PageSceneNode, SceneShapeNode } from "../../pagescene/PageScene";
import { ERASER_METRICS, INK_TO_SHAPE_THRESHOLDS } from "../../constants/RibbonConstants";

export type InkToolMode = "pen" | "highlighter" | "pencil" | "eraser" | "shape";

export type EraserMode = "stroke" | "point_small" | "point_medium" | "point_large";

export interface InkToolOptions {
  mode: InkToolMode;
  penType: PenType;
  color: string;
  strokeWidth: number;
  noveltyEffect?: NoveltyInkEffect;
  eraserMode: EraserMode;
  shapeKind: ShapeKind;
  fillColor?: string;
  inkToShape: boolean;
}

export class InkDrawingController {
  private currentPoints: Point2D[] = [];
  private options: InkToolOptions = {
    mode: "pen",
    penType: "gel",
    color: "#000000",
    strokeWidth: 2.5,
    eraserMode: "stroke",
    shapeKind: "rectangle",
    inkToShape: false,
  };

  constructor(options?: Partial<InkToolOptions>) {
    if (options) {
      this.setOptions(options);
    }
  }

  public setOptions(options: Partial<InkToolOptions>): void {
    this.options = { ...this.options, ...options };
  }

  public getOptions(): InkToolOptions {
    return { ...this.options };
  }

  public startStroke(pt: Point2D): void {
    this.currentPoints = [pt];
  }

  public continueStroke(pt: Point2D): void {
    if (this.currentPoints.length > 0) {
      const last = this.currentPoints[this.currentPoints.length - 1]!;
      // Distance filter to prevent excessive points while maintaining smoothness
      if (Math.hypot(pt.x - last.x, pt.y - last.y) >= 2) {
        this.currentPoints.push(pt);
      }
    } else {
      this.currentPoints.push(pt);
    }
  }

  public getCurrentPoints(): readonly Point2D[] {
    return this.currentPoints;
  }

  public cancelStroke(): void {
    this.currentPoints = [];
  }

  /**
   * Completes the current ink stroke.
   * If ink-to-shape is enabled and a valid geometric shape is recognized,
   * returns a SceneShapeNode; otherwise returns a vector SceneInkNode.
   */
  public finishStroke(): PageSceneNode | null {
    if (this.currentPoints.length < 2) {
      this.currentPoints = [];
      return null;
    }

    // 1. Automatic Ink-to-Shape Recognition (if enabled)
    if (this.options.inkToShape && this.options.mode !== "highlighter") {
      const recognized = this.recognizeShape(this.currentPoints);
      if (recognized) {
        const shapeNode = this.createShapeFromRecognition(recognized.shapeKind, recognized.bounds);
        this.currentPoints = [];
        return shapeNode;
      }
    }

    const strokeId = IdGenerator.objectId("stroke");
    const groupId = IdGenerator.objectId("ink_group");
    const isHighlighter = this.options.mode === "highlighter";
    const isPencil = this.options.mode === "pencil" || this.options.penType === "pencil";

    // 2. Calculate Bounding Box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of this.currentPoints) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    const pad = this.options.strokeWidth / 2 + 2;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX += pad;
    maxY += pad;

    const bounds: SpatialBounds = {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      zIndex: isHighlighter ? 5 : 20,
    };

    const stroke: CanonicalStroke = {
      id: strokeId,
      points: [...this.currentPoints],
      color: this.options.color,
      width: this.options.strokeWidth,
      penType: isHighlighter ? "highlighter" : isPencil ? "pencil" : this.options.penType,
      noveltyEffect: this.options.noveltyEffect,
    };

    const element: CanonicalInkStrokeGroup = {
      type: "ink",
      id: groupId,
      bounds,
      isHighlighter,
      strokes: [stroke],
      penType: stroke.penType,
      noveltyEffect: stroke.noveltyEffect,
    };

    const node: PageSceneNode = {
      id: groupId,
      layer: isHighlighter ? "bottomInk" : "topInk",
      bounds,
      aabb: Rectangle.create(bounds.x, bounds.y, bounds.width, bounds.height),
      zIndex: bounds.zIndex,
      visible: true,
      element,
      isHighlighter,
      color: this.options.color,
      strokeWidth: this.options.strokeWidth,
    };

    this.currentPoints = [];
    return node;
  }

  /**
   * Creates a dedicated geometric shape node (e.g. drawn from shapes tool or ink-to-shape).
   */
  public createShapeNode(
    shapeKind: ShapeKind,
    startPt: Point2D,
    endPt: Point2D,
    strokeColor = this.options.color,
    strokeWidth = this.options.strokeWidth,
    fillColor = this.options.fillColor
  ): SceneShapeNode {
    const minX = Math.min(startPt.x, endPt.x);
    const minY = Math.min(startPt.y, endPt.y);
    const width = Math.max(4, Math.abs(endPt.x - startPt.x));
    const height = Math.max(4, Math.abs(endPt.y - startPt.y));

    const bounds: SpatialBounds = {
      x: minX,
      y: minY,
      width,
      height,
      zIndex: 15,
    };

    const shapeId = IdGenerator.objectId("shape");
    const element: CanonicalShape = {
      type: "shape",
      id: shapeId,
      bounds,
      shapeKind,
      strokeColor,
      strokeWidth,
      fillColor,
    };

    return {
      id: shapeId,
      layer: "shapes",
      bounds,
      aabb: Rectangle.create(bounds.x, bounds.y, bounds.width, bounds.height),
      zIndex: bounds.zIndex,
      visible: true,
      element,
    };
  }

  private createShapeFromRecognition(shapeKind: ShapeKind, bounds: SpatialBounds): SceneShapeNode {
    const shapeId = IdGenerator.objectId("shape");
    const element: CanonicalShape = {
      type: "shape",
      id: shapeId,
      bounds,
      shapeKind,
      strokeColor: this.options.color,
      strokeWidth: this.options.strokeWidth,
      fillColor: this.options.fillColor,
    };

    return {
      id: shapeId,
      layer: "shapes",
      bounds,
      aabb: Rectangle.create(bounds.x, bounds.y, bounds.width, bounds.height),
      zIndex: bounds.zIndex,
      visible: true,
      element,
    };
  }

  /**
   * Geometric ink-to-shape recognizer.
   * Classifies freehand stroke into circle/ellipse, rectangle, triangle, or straight line/arrow.
   */
  public recognizeShape(
    points: readonly Point2D[]
  ): { shapeKind: ShapeKind; bounds: SpatialBounds } | null {
    if (points.length < INK_TO_SHAPE_THRESHOLDS.MIN_POINTS) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let pathLength = 0;

    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      if (i > 0) {
        pathLength += Math.hypot(p.x - points[i - 1]!.x, p.y - points[i - 1]!.y);
      }
    }

    const width = maxX - minX;
    const height = maxY - minY;
    if (
      width < INK_TO_SHAPE_THRESHOLDS.MIN_DIMENSION &&
      height < INK_TO_SHAPE_THRESHOLDS.MIN_DIMENSION
    )
      return null;

    const pStart = points[0]!;
    const pEnd = points[points.length - 1]!;
    const closeDist = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y);
    const maxDim = Math.max(width, height);

    const bounds: SpatialBounds = {
      x: minX,
      y: minY,
      width: Math.max(10, width),
      height: Math.max(10, height),
      zIndex: 15,
    };

    // 1. Open Stroke: Check for Straight Line / Arrow
    const straightness = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y) / (pathLength || 1);
    if (straightness > INK_TO_SHAPE_THRESHOLDS.LINE_STRAIGHTNESS) {
      return { shapeKind: "line", bounds };
    }

    // 2. Closed Stroke: Check for Loop / Polygon
    const isClosed =
      closeDist <
        Math.max(
          INK_TO_SHAPE_THRESHOLDS.CLOSED_DIST_THRESHOLD,
          maxDim * INK_TO_SHAPE_THRESHOLDS.CLOSED_MAX_DIM_RATIO
        ) || closeDist / (pathLength || 1) < INK_TO_SHAPE_THRESHOLDS.CLOSED_PATH_RATIO;
    if (isClosed) {
      const centerX = minX + width / 2;
      const centerY = minY + height / 2;

      // Calculate normalized radial distances from center
      const radii: number[] = [];
      let sumR = 0;
      for (const p of points) {
        // Normalize for ellipse aspect ratio
        const normX = (p.x - centerX) / (width / 2 || 1);
        const normY = (p.y - centerY) / (height / 2 || 1);
        const r = Math.hypot(normX, normY);
        radii.push(r);
        sumR += r;
      }
      const meanR = sumR / (radii.length || 1);
      let variance = 0;
      for (const r of radii) {
        variance += (r - meanR) ** 2;
      }
      const stdDev = Math.sqrt(variance / (radii.length || 1));
      const coefVar = stdDev / (meanR || 1);

      // Low radial variance -> Circle / Ellipse
      if (coefVar < INK_TO_SHAPE_THRESHOLDS.ELLIPSE_COEF_VAR_MAX) {
        return { shapeKind: "ellipse", bounds };
      }

      // Detect corner count via angle changes
      const corners = this.detectCornerCount(points);
      if (corners === INK_TO_SHAPE_THRESHOLDS.TRIANGLE_CORNERS) {
        return { shapeKind: "triangle", bounds };
      }
      if (corners === INK_TO_SHAPE_THRESHOLDS.RECTANGLE_CORNERS) {
        return { shapeKind: "rectangle", bounds };
      }
      if (corners >= 5 && coefVar < 0.35) {
        return { shapeKind: "ellipse", bounds };
      }

      // Default closed shape if aspect ratio is rectangular
      if (coefVar < 0.4) {
        return { shapeKind: "rectangle", bounds };
      }
    }

    return null;
  }

  private detectCornerCount(points: readonly Point2D[]): number {
    if (points.length < INK_TO_SHAPE_THRESHOLDS.MIN_POINTS_FOR_CORNER) return 0;
    const step = Math.max(2, Math.floor(points.length / 24));
    let cornerCount = 0;
    let lastCornerIdx = -20;

    for (let i = step; i < points.length - step; i += step) {
      const pPrev = points[i - step]!;
      const pCurr = points[i]!;
      const pNext = points[i + step]!;

      const v1x = pCurr.x - pPrev.x;
      const v1y = pCurr.y - pPrev.y;
      const v2x = pNext.x - pCurr.x;
      const v2y = pNext.y - pCurr.y;

      const mag1 = Math.hypot(v1x, v1y);
      const mag2 = Math.hypot(v2x, v2y);
      if (mag1 === 0 || mag2 === 0) continue;

      const dot = (v1x * v2x + v1y * v2y) / (mag1 * mag2);
      const clampedDot = Math.max(-1, Math.min(1, dot));
      const angleDeg = (Math.acos(clampedDot) * 180) / Math.PI;

      // Sharp turn (> 45 deg deflection) indicates corner
      if (
        angleDeg > INK_TO_SHAPE_THRESHOLDS.CORNER_DEFLECTION_DEG &&
        i - lastCornerIdx > step * 2
      ) {
        cornerCount++;
        lastCornerIdx = i;
      }
    }

    return cornerCount;
  }

  /**
   * Erases strokes intersecting radius around target point.
   * Respects eraserMode: "stroke" deletes whole stroke; "point_*" deletes localized segments.
   */
  public eraseAt(
    pt: Point2D,
    inkNodes: readonly PageSceneNode[],
    eraserModeOrRadius: EraserMode | number = this.options.eraserMode
  ): { modifiedNodes: PageSceneNode[]; deletedNodeIds: ObjectId[] } {
    const deletedNodeIds: ObjectId[] = [];
    const modifiedNodes: PageSceneNode[] = [];

    // Resolve eraser mode and radius
    let eraserMode: EraserMode = "stroke";
    let eraserRadius: number = ERASER_METRICS.STROKE_RADIUS;

    if (typeof eraserModeOrRadius === "number") {
      eraserRadius = eraserModeOrRadius;
      eraserMode = "stroke";
    } else {
      eraserMode = eraserModeOrRadius;
      if (eraserMode === "point_small") eraserRadius = ERASER_METRICS.POINT_SMALL_RADIUS;
      else if (eraserMode === "point_medium") eraserRadius = ERASER_METRICS.POINT_MEDIUM_RADIUS;
      else if (eraserMode === "point_large") eraserRadius = ERASER_METRICS.POINT_LARGE_RADIUS;
      else if (eraserMode === "stroke") eraserRadius = ERASER_METRICS.STROKE_RADIUS;
    }

    for (const node of inkNodes) {
      if (node.element.type !== "ink") continue;

      const inkGroup = node.element as CanonicalInkStrokeGroup;
      const survivingStrokes: CanonicalStroke[] = [];
      let hasErased = false;

      for (const stroke of inkGroup.strokes) {
        const hit = this.isStrokeHit(pt, stroke.points, eraserRadius + stroke.width / 2);
        if (!hit) {
          survivingStrokes.push(stroke);
          continue;
        }

        hasErased = true;

        if (eraserMode === "stroke") {
          // Whole stroke deletion on touch
          continue;
        }

        // Point/Segment Eraser: split points around the eraser circle
        const segments = this.splitStrokeByEraser(stroke.points, pt, eraserRadius);
        for (const seg of segments) {
          if (seg.length >= 2) {
            survivingStrokes.push({
              id: IdGenerator.objectId("stroke"),
              points: seg,
              color: stroke.color,
              width: stroke.width,
              penType: stroke.penType,
              noveltyEffect: stroke.noveltyEffect,
            });
          }
        }
      }

      if (hasErased) {
        if (survivingStrokes.length === 0) {
          deletedNodeIds.push(node.id);
        } else {
          (inkGroup as any).strokes = survivingStrokes;
          // Recalculate AABB for modified node
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          for (const s of survivingStrokes) {
            for (const p of s.points) {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            }
          }
          const pad = (survivingStrokes[0]?.width || 2) / 2 + 2;
          node.bounds = {
            x: Math.max(0, minX - pad),
            y: Math.max(0, minY - pad),
            width: Math.max(1, maxX - minX + pad * 2),
            height: Math.max(1, maxY - minY + pad * 2),
            zIndex: node.bounds.zIndex,
          };
          node.aabb = Rectangle.create(
            node.bounds.x,
            node.bounds.y,
            node.bounds.width,
            node.bounds.height
          );
          modifiedNodes.push(node);
        }
      }
    }

    return { modifiedNodes, deletedNodeIds };
  }

  private splitStrokeByEraser(
    points: readonly Point2D[],
    eraserCenter: Point2D,
    radius: number
  ): Point2D[][] {
    const segments: Point2D[][] = [];
    let currentSegment: Point2D[] = [];

    for (const p of points) {
      const dist = Math.hypot(p.x - eraserCenter.x, p.y - eraserCenter.y);
      if (dist > radius) {
        currentSegment.push(p);
      } else {
        if (currentSegment.length >= 2) {
          segments.push(currentSegment);
        }
        currentSegment = [];
      }
    }
    if (currentSegment.length >= 2) {
      segments.push(currentSegment);
    }

    return segments;
  }

  private isStrokeHit(target: Point2D, points: readonly Point2D[], radius: number): boolean {
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]!;
      const p2 = points[i + 1]!;
      const dist = this.distancePointToSegment(target, p1, p2);
      if (dist <= radius) {
        return true;
      }
    }
    return false;
  }

  private distancePointToSegment(p: Point2D, a: Point2D, b: Point2D): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      return Math.hypot(p.x - a.x, p.y - a.y);
    }

    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;

    return Math.hypot(p.x - projX, p.y - projY);
  }
}
