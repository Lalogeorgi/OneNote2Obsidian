import { describe, expect, it } from "vitest";
import { Point } from "../src/geometry/Point";
import { Rectangle } from "../src/geometry/Rectangle";
import { PageSceneNode } from "../src/pagescene/PageScene";
import { SpatialIndex } from "../src/pagescene/SpatialIndex";
import { IdGenerator } from "../src/model/Ids";

describe("2D Spatial Index & Hit-Testing", () => {
  const createMockNode = (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    zIndex: number
  ): PageSceneNode => {
    const aabb = Rectangle.create(x, y, width, height);
    return {
      id: IdGenerator.objectId(id),
      layer: "shapes",
      bounds: { x, y, width, height, zIndex },
      aabb,
      zIndex,
      visible: true,
      element: {
        type: "shape",
        id: IdGenerator.objectId(id),
        bounds: { x, y, width, height, zIndex },
        shapeKind: "rectangle",
        strokeWidth: 1,
      },
    };
  };

  it("indexes nodes and performs range search for frustum culling", () => {
    const index = new SpatialIndex();
    const node1 = createMockNode("n1", 100, 100, 200, 200, 1);
    const node2 = createMockNode("n2", 500, 500, 100, 100, 2);
    const node3 = createMockNode("n3", 1000, 1000, 100, 100, 3);

    index.load([node1, node2, node3]);
    expect(index.size).toBe(3);

    // Query viewport containing only node1 and node2
    const viewport = Rectangle.create(0, 0, 700, 700);
    const visible = index.search(viewport);

    expect(visible.length).toBe(2);
    expect(visible).toContain(node1);
    expect(visible).toContain(node2);
    expect(visible).not.toContain(node3);
  });

  it("resolves hit-testing with top-most z-order resolution", () => {
    const index = new SpatialIndex();
    // Overlapping nodes at (150, 150)
    const bottomNode = createMockNode("bottom", 100, 100, 200, 200, 1);
    const topNode = createMockNode("top", 120, 120, 100, 100, 5);

    index.load([bottomNode, topNode]);

    // Hit test overlapping region: topNode must win
    const hit = index.hitTest(new Point(150, 150));
    expect(hit).toBeDefined();
    expect(hit?.id).toBe(topNode.id);

    // Hit test non-overlapping region of bottomNode
    const hitBottom = index.hitTest(new Point(105, 105));
    expect(hitBottom).toBeDefined();
    expect(hitBottom?.id).toBe(bottomNode.id);

    // Hit test empty region
    const hitEmpty = index.hitTest(new Point(900, 900));
    expect(hitEmpty).toBeNull();
  });

  it("calculates total union bounds of indexed scene nodes", () => {
    const index = new SpatialIndex();
    const node1 = createMockNode("n1", 50, 100, 100, 100, 1);
    const node2 = createMockNode("n2", 200, 300, 150, 100, 2);

    index.load([node1, node2]);
    const total = index.getTotalBounds();

    expect(total).toBeDefined();
    expect(total?.x).toBe(50);
    expect(total?.y).toBe(100);
    expect(total?.width).toBe(300); // 350 - 50 = 300
    expect(total?.height).toBe(300); // 400 - 100 = 300
  });
});
