import { Point, Point2D } from "./Point";

/**
 * 2D Rectangle / Bounding Box representation.
 */
export interface Rect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export class Rectangle implements Rect2D {
  public static readonly EMPTY = new Rectangle(0, 0, 0, 0);

  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly width: number,
    public readonly height: number
  ) {}

  public static create(
    x: number,
    y: number,
    width: number,
    height: number
  ): Rectangle {
    return new Rectangle(x, y, Math.max(0, width), Math.max(0, height));
  }

  public static fromPoints(p1: Point2D, p2: Point2D): Rectangle {
    const minX = Math.min(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxX = Math.max(p1.x, p2.x);
    const maxY = Math.max(p1.y, p2.y);
    return new Rectangle(minX, minY, maxX - minX, maxY - minY);
  }

  public get minX(): number {
    return this.x;
  }

  public get minY(): number {
    return this.y;
  }

  public get maxX(): number {
    return this.x + this.width;
  }

  public get maxY(): number {
    return this.y + this.height;
  }

  public get center(): Point {
    return new Point(this.x + this.width / 2, this.y + this.height / 2);
  }

  public containsPoint(p: Point2D): boolean {
    return (
      p.x >= this.minX &&
      p.x <= this.maxX &&
      p.y >= this.minY &&
      p.y <= this.maxY
    );
  }

  public intersects(other: Rect2D): boolean {
    return !(
      other.x + other.width < this.minX ||
      other.x > this.maxX ||
      other.y + other.height < this.minY ||
      other.y > this.maxY
    );
  }

  public union(other: Rect2D): Rectangle {
    const minX = Math.min(this.minX, other.x);
    const minY = Math.min(this.minY, other.y);
    const maxX = Math.max(this.maxX, other.x + other.width);
    const maxY = Math.max(this.maxY, other.y + other.height);
    return new Rectangle(minX, minY, maxX - minX, maxY - minY);
  }

  public pad(padding: number): Rectangle {
    return new Rectangle(
      this.x - padding,
      this.y - padding,
      this.width + padding * 2,
      this.height + padding * 2
    );
  }

  public toJSON(): Rect2D {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    };
  }
}
