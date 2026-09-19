import { Point2D } from "../../geometry/Point";
import { Rectangle } from "../../geometry/Rectangle";
import { PageSceneNode } from "../../pagescene/PageScene";

export class LassoSelectionController {
  private points: Point2D[] = [];

  public start(startPt: Point2D): void {
    this.points = [startPt];
  }

  public addPoint(pt: Point2D): void {
    this.points.push(pt);
  }

  public getPoints(): readonly Point2D[] {
    return this.points;
  }

  public clear(): void {
    this.points = [];
  }

  public getBounds(): Rectangle | null {
    if (this.points.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of this.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    return Rectangle.create(minX, minY, maxX - minX, maxY - minY);
  }

  /**
   * Checks which nodes are contained within or intersect the lasso polygon.
   */
  public querySelectedNodes(nodes: readonly PageSceneNode[]): PageSceneNode[] {
    if (this.points.length < 2) return [];

    const bounds = this.getBounds();
    if (!bounds) return [];

    // If only 2 points, treat as rectangular marquee
    if (this.points.length === 2) {
      const p1 = this.points[0]!;
      const p2 = this.points[1]!;
      const marquee = Rectangle.fromPoints(p1, p2);

      return nodes.filter((n) => n.aabb.intersects(marquee));
    }

    // Freeform polygon lasso check
    return nodes.filter((n) => {
      // 1. Fast AABB rejection
      if (!n.aabb.intersects(bounds)) return false;

      // 2. Point in polygon test for center or corners
      const center = {
        x: n.bounds.x + n.bounds.width / 2,
        y: n.bounds.y + n.bounds.height / 2,
      };
      return this.isPointInPolygon(center, this.points);
    });
  }

  private isPointInPolygon(pt: Point2D, poly: readonly Point2D[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i]!.x;
      const yi = poly[i]!.y;
      const xj = poly[j]!.x;
      const yj = poly[j]!.y;

      const intersect =
        yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }
    return inside;
  }
}
