import { describe, expect, it } from "vitest";
import { Point } from "../src/geometry/Point";
import { Rectangle } from "../src/geometry/Rectangle";
import { CoordinateMath } from "../src/geometry/Bounds";
import { AffineMatrix2D, ViewportTransform } from "../src/geometry/Transform";

describe("Geometry Primitives & Mathematics", () => {
  describe("Point", () => {
    it("performs vector addition and subtraction", () => {
      const p1 = new Point(10, 20);
      const p2 = new Point(5, 15);

      const added = p1.add(p2);
      expect(added.x).toBe(15);
      expect(added.y).toBe(35);

      const subtracted = p1.subtract(p2);
      expect(subtracted.x).toBe(5);
      expect(subtracted.y).toBe(5);
    });

    it("calculates Euclidean distance correctly", () => {
      const p1 = new Point(0, 0);
      const p2 = new Point(3, 4);
      expect(p1.distanceTo(p2)).toBe(5);
    });

    it("linearly interpolates between points", () => {
      const p1 = new Point(0, 0);
      const p2 = new Point(100, 200);
      const mid = p1.lerp(p2, 0.5);
      expect(mid.x).toBe(50);
      expect(mid.y).toBe(100);
    });
  });

  describe("Rectangle", () => {
    it("tests point containment", () => {
      const rect = new Rectangle(10, 20, 100, 50);
      expect(rect.containsPoint(new Point(50, 40))).toBe(true);
      expect(rect.containsPoint(new Point(5, 40))).toBe(false);
      expect(rect.containsPoint(new Point(120, 40))).toBe(false);
    });

    it("computes rectangle intersections correctly", () => {
      const r1 = new Rectangle(0, 0, 100, 100);
      const r2 = new Rectangle(50, 50, 100, 100);
      const r3 = new Rectangle(200, 200, 50, 50);

      expect(r1.intersects(r2)).toBe(true);
      expect(r1.intersects(r3)).toBe(false);
    });

    it("computes union bounding box", () => {
      const r1 = new Rectangle(0, 0, 50, 50);
      const r2 = new Rectangle(50, 50, 50, 50);
      const union = r1.union(r2);

      expect(union.minX).toBe(0);
      expect(union.minY).toBe(0);
      expect(union.maxX).toBe(100);
      expect(union.maxY).toBe(100);
    });
  });

  describe("CoordinateMath (96 DPI CSS Pixel Normalization)", () => {
    it("converts points (72 DPI) to 96 DPI CSS pixels", () => {
      expect(CoordinateMath.pointsToPixels(72)).toBe(96);
      expect(CoordinateMath.pointsToPixels(36)).toBe(48);
    });

    it("converts half-points (144 DPI) to 96 DPI CSS pixels", () => {
      expect(CoordinateMath.halfPointsToPixels(144)).toBe(96);
    });

    it("converts twips (1440 DPI) to 96 DPI CSS pixels", () => {
      expect(CoordinateMath.twipsToPixels(1440)).toBe(96);
    });
  });

  describe("AffineMatrix2D & Viewport Transforms", () => {
    it("transforms scene points to screen points and inverts accurately", () => {
      const viewport: ViewportTransform = { x: 100, y: 50, scale: 2.0 };
      const matrix = AffineMatrix2D.fromViewport(viewport);

      const scenePt = new Point(10, 20);
      const screenPt = matrix.sceneToScreen(scenePt);

      // (10 * 2) + 100 = 120; (20 * 2) + 50 = 90
      expect(screenPt.x).toBe(120);
      expect(screenPt.y).toBe(90);

      const inverted = matrix.screenToScene(screenPt);
      expect(inverted.x).toBeCloseTo(10);
      expect(inverted.y).toBeCloseTo(20);
    });
  });
});
