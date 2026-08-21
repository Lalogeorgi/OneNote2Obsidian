import { describe, expect, it } from "vitest";
import { TransformGizmo } from "../src/editor/gizmo/TransformGizmo";
import { SpatialBounds } from "../src/geometry/Bounds";
import { Point } from "../src/geometry/Point";
import { Rectangle } from "../src/geometry/Rectangle";
import { IdGenerator } from "../src/model/Ids";
import { PageSceneNode } from "../src/pagescene/PageScene";

describe("TransformGizmo & 8-Point Resize Handles", () => {
  const mockNode1: PageSceneNode = {
    id: IdGenerator.objectId("n1"),
    layer: "shapes",
    bounds: { x: 100, y: 100, width: 200, height: 100, zIndex: 1 },
    aabb: Rectangle.create(100, 100, 200, 100),
    zIndex: 1,
    visible: true,
    element: {} as any,
  };

  const mockNode2: PageSceneNode = {
    id: IdGenerator.objectId("n2"),
    layer: "shapes",
    bounds: { x: 250, y: 150, width: 100, height: 150, zIndex: 2 },
    aabb: Rectangle.create(250, 150, 100, 150),
    zIndex: 2,
    visible: true,
    element: {} as any,
  };

  it("calculates collective selection bounds for multi-selected nodes", () => {
    const bounds = TransformGizmo.getSelectionBounds([mockNode1, mockNode2]);
    expect(bounds).toEqual({
      x: 100,
      y: 100,
      width: 250, // 350 - 100
      height: 200, // 300 - 100
      zIndex: 2,
    });
  });

  it("generates 8 canonical resize handles", () => {
    const bounds: SpatialBounds = { x: 100, y: 100, width: 200, height: 100, zIndex: 1 };
    const handles = TransformGizmo.getHandles(bounds);

    expect(handles.length).toBe(8);
    expect(handles.find((h) => h.handle === "nw")?.position).toEqual(new Point(100, 100));
    expect(handles.find((h) => h.handle === "se")?.position).toEqual(new Point(300, 200));
    expect(handles.find((h) => h.handle === "n")?.position).toEqual(new Point(200, 100));
  });

  it("hit-tests resize handles within radius", () => {
    const bounds: SpatialBounds = { x: 100, y: 100, width: 200, height: 100, zIndex: 1 };

    const hitNw = TransformGizmo.hitTestHandles(new Point(102, 102), bounds);
    expect(hitNw?.handle).toBe("nw");

    const hitMiss = TransformGizmo.hitTestHandles(new Point(150, 150), bounds);
    expect(hitMiss).toBeNull();
  });

  it("computes resized bounds accurately with and without aspect ratio lock", () => {
    const original: SpatialBounds = { x: 100, y: 100, width: 200, height: 100, zIndex: 1 };

    // SE Drag free
    const seFree = TransformGizmo.computeResizedBounds(original, "se", 50, 40, false);
    expect(seFree.width).toBe(250);
    expect(seFree.height).toBe(140);

    // SE Drag aspect ratio locked (initial ratio = 2.0)
    const seLocked = TransformGizmo.computeResizedBounds(original, "se", 50, 40, true);
    expect(seLocked.width).toBe(250);
    expect(seLocked.height).toBe(125);

    // NW Drag
    const nwFree = TransformGizmo.computeResizedBounds(original, "nw", 20, 20, false);
    expect(nwFree.x).toBe(120);
    expect(nwFree.y).toBe(120);
    expect(nwFree.width).toBe(180);
    expect(nwFree.height).toBe(80);
  });
});
