import { Point2D } from "../../geometry/Point";
import { Rectangle } from "../../geometry/Rectangle";
import { CanonicalInkStrokeGroup, CanonicalStroke } from "../../model/CanonicalElements";
import { IdGenerator, ObjectId } from "../../model/Ids";
import { PageSceneNode } from "../../pagescene/PageScene";

export type InkToolMode = "pen" | "highlighter" | "eraser";

export interface InkToolOptions {
  mode: InkToolMode;
  color: string;
  strokeWidth: number;
}

export class InkDrawingController {
  private currentPoints: Point2D[] = [];
  private options: InkToolOptions = {
    mode: "pen",
    color: "#000000",
    strokeWidth: 2.5,
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
      // Simple distance filter to prevent excessive points
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

  /**
   * Completes the current ink stroke and returns a compiled PageSceneNode.
   */
  public finishStroke(): PageSceneNode | null {
    if (this.currentPoints.length < 2) {
      this.currentPoints = [];
      return null;
    }

    const strokeId = IdGenerator.objectId("stroke");
    const groupId = IdGenerator.objectId("ink_group");
    const isHighlighter = this.options.mode === "highlighter";

    // 1. Calculate AABB
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

    const bounds = {
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
    };

    const element: CanonicalInkStrokeGroup = {
      type: "ink",
      id: groupId,
      bounds,
      isHighlighter,
      strokes: [stroke],
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
   * Erases strokes intersecting radius around target point.
   */
  public eraseAt(
    pt: Point2D,
    inkNodes: readonly PageSceneNode[],
    eraserRadius = 12
  ): { modifiedNodes: PageSceneNode[]; deletedNodeIds: ObjectId[] } {
    const deletedNodeIds: ObjectId[] = [];
    const modifiedNodes: PageSceneNode[] = [];

    for (const node of inkNodes) {
      if (node.element.type !== "ink") continue;

      const inkGroup = node.element as CanonicalInkStrokeGroup;
      const survivingStrokes: CanonicalStroke[] = [];
      let hasErased = false;

      for (const stroke of inkGroup.strokes) {
        if (this.isStrokeHit(pt, stroke.points, eraserRadius + stroke.width / 2)) {
          hasErased = true;
        } else {
          survivingStrokes.push(stroke);
        }
      }

      if (hasErased) {
        if (survivingStrokes.length === 0) {
          deletedNodeIds.push(node.id);
        } else {
          (inkGroup as any).strokes = survivingStrokes;
          modifiedNodes.push(node);
        }
      }
    }

    return { modifiedNodes, deletedNodeIds };
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

    // Projection scalar t clamped to segment [0, 1]
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;

    return Math.hypot(p.x - projX, p.y - projY);
  }
}
