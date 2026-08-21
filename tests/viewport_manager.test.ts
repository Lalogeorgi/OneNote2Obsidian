import { describe, expect, it } from "vitest";
import { Point } from "../src/geometry/Point";
import { Rectangle } from "../src/geometry/Rectangle";
import { ViewportTransform } from "../src/geometry/Transform";
import { ViewportManager } from "../src/geometry/ViewportManager";

describe("Viewport Manager & Fit Calculations", () => {
  it("calculates fit-to-bounds centering the target with padding", () => {
    const pageBounds = Rectangle.create(0, 0, 1000, 800);
    const viewportWidth = 800;
    const viewportHeight = 600;

    const transform = ViewportManager.calculateFitToBounds(
      pageBounds,
      viewportWidth,
      viewportHeight,
      { padding: 40 }
    );

    expect(transform.scale).toBeLessThan(1.0); // Must scale down to fit
    expect(transform.x).toBeGreaterThan(0);
    expect(transform.y).toBeGreaterThan(0);
  });

  it("preserves screen anchor point during zoom-at-point operation", () => {
    const initialTransform: ViewportTransform = { x: 100, y: 50, scale: 1.0 };
    const screenAnchor = new Point(400, 300);

    const zoomedTransform = ViewportManager.zoomAtScreenPoint(
      initialTransform,
      screenAnchor,
      1.5 // Zoom in 1.5x
    );

    expect(zoomedTransform.scale).toBe(1.5);

    // Calculate scene coordinates under anchor before and after zoom
    const sceneBeforeX = (screenAnchor.x - initialTransform.x) / initialTransform.scale;
    const sceneBeforeY = (screenAnchor.y - initialTransform.y) / initialTransform.scale;

    const sceneAfterX = (screenAnchor.x - zoomedTransform.x) / zoomedTransform.scale;
    const sceneAfterY = (screenAnchor.y - zoomedTransform.y) / zoomedTransform.scale;

    expect(sceneAfterX).toBeCloseTo(sceneBeforeX, 4);
    expect(sceneAfterY).toBeCloseTo(sceneBeforeY, 4);
  });

  it("pans viewport by given delta", () => {
    const initial: ViewportTransform = { x: 50, y: 100, scale: 1.2 };
    const panned = ViewportManager.panBy(initial, 30, -20);

    expect(panned.x).toBe(80);
    expect(panned.y).toBe(80);
    expect(panned.scale).toBe(1.2);
  });
});
