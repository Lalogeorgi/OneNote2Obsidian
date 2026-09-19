import { Point, Point2D } from "./Point";
import { Rectangle, Rect2D } from "./Rectangle";

/**
 * 2D Viewport Camera state.
 */
export interface ViewportTransform {
  readonly x: number; // Translation X in screen pixels
  readonly y: number; // Translation Y in screen pixels
  readonly scale: number; // Zoom Scale factor (1.0 = 100%)
  readonly rotation?: number; // In radians (default 0)
}

/**
 * 2D Affine Transformation Matrix.
 * Represents [ a  c  tx ]
 *            [ b  d  ty ]
 *            [ 0  0   1 ]
 */
export class AffineMatrix2D {
  public static readonly IDENTITY = new AffineMatrix2D(1, 0, 0, 1, 0, 0);

  constructor(
    public readonly a: number = 1,
    public readonly b: number = 0,
    public readonly c: number = 0,
    public readonly d: number = 1,
    public readonly tx: number = 0,
    public readonly ty: number = 0
  ) {}

  public static fromViewport(transform: ViewportTransform): AffineMatrix2D {
    const { x, y, scale, rotation = 0 } = transform;
    if (rotation === 0) {
      return new AffineMatrix2D(scale, 0, 0, scale, x, y);
    }
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return new AffineMatrix2D(scale * cos, scale * sin, -scale * sin, scale * cos, x, y);
  }

  public applyToPoint(p: Point2D): Point {
    return new Point(this.a * p.x + this.c * p.y + this.tx, this.b * p.x + this.d * p.y + this.ty);
  }

  public inverse(): AffineMatrix2D | null {
    const det = this.a * this.d - this.b * this.c;
    if (Math.abs(det) < 1e-10) return null;

    const invDet = 1.0 / det;
    return new AffineMatrix2D(
      this.d * invDet,
      -this.b * invDet,
      -this.c * invDet,
      this.a * invDet,
      (this.c * this.ty - this.d * this.tx) * invDet,
      (this.b * this.tx - this.a * this.ty) * invDet
    );
  }

  public screenToScene(screenPoint: Point2D): Point {
    const inv = this.inverse();
    if (!inv) return new Point(screenPoint.x, screenPoint.y);
    return inv.applyToPoint(screenPoint);
  }

  public sceneToScreen(scenePoint: Point2D): Point {
    return this.applyToPoint(scenePoint);
  }

  public sceneRectToScreen(sceneRect: Rect2D): Rectangle {
    const p1 = this.applyToPoint({ x: sceneRect.x, y: sceneRect.y });
    const p2 = this.applyToPoint({
      x: sceneRect.x + sceneRect.width,
      y: sceneRect.y + sceneRect.height,
    });
    return Rectangle.fromPoints(p1, p2);
  }

  public toCSS(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.tx}, ${this.ty})`;
  }
}
