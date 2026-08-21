/**
 * 2D Point geometric primitive and vector mathematics.
 */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export class Point implements Point2D {
  public static readonly ZERO = new Point(0, 0);

  constructor(
    public readonly x: number,
    public readonly y: number
  ) {}

  public static create(x: number, y: number): Point {
    return new Point(x, y);
  }

  public add(other: Point2D): Point {
    return new Point(this.x + other.x, this.y + other.y);
  }

  public subtract(other: Point2D): Point {
    return new Point(this.x - other.x, this.y - other.y);
  }

  public multiply(scalar: number): Point {
    return new Point(this.x * scalar, this.y * scalar);
  }

  public distanceTo(other: Point2D): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.hypot(dx, dy);
  }

  public lerp(target: Point2D, t: number): Point {
    return new Point(
      this.x + (target.x - this.x) * t,
      this.y + (target.y - this.y) * t
    );
  }

  public equals(other: Point2D, epsilon = 1e-6): boolean {
    return (
      Math.abs(this.x - other.x) <= epsilon &&
      Math.abs(this.y - other.y) <= epsilon
    );
  }

  public toJSON(): Point2D {
    return { x: this.x, y: this.y };
  }
}
