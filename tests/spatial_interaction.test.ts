import { describe, expect, it, vi } from "vitest";
import { Rectangle } from "../src/geometry/Rectangle";
import { ViewportTransform } from "../src/geometry/Transform";
import { IdGenerator } from "../src/model/Ids";
import { PageSceneNode } from "../src/pagescene/PageScene";
import { SpatialIndex } from "../src/pagescene/SpatialIndex";
import { SpatialInteractionController } from "../src/renderer/interaction/SpatialInteractionController";
import { SceneGraphHierarchy } from "../src/renderer/pixi/SceneGraphHierarchy";

describe("Spatial Interaction Controller & Gestures", () => {
  const createMockNode = (id: string, x: number, y: number, zIndex: number): PageSceneNode => {
    return {
      id: IdGenerator.objectId(id),
      layer: "shapes",
      bounds: { x, y, width: 100, height: 100, zIndex },
      aabb: Rectangle.create(x, y, 100, 100),
      zIndex,
      visible: true,
      element: {
        type: "shape",
        id: IdGenerator.objectId(id),
        bounds: { x, y, width: 100, height: 100, zIndex },
        shapeKind: "rectangle",
        strokeWidth: 1,
      },
    };
  };

  it("switches interaction tools and manages cursor styles", () => {
    const hostEl = document.createElement("div");
    const hierarchy = new SceneGraphHierarchy();
    const spatialIndex = new SpatialIndex();
    let currentTransform: ViewportTransform = { x: 0, y: 0, scale: 1.0 };

    const controller = new SpatialInteractionController(
      hostEl,
      hierarchy,
      spatialIndex,
      () => currentTransform,
      (pt) => pt,
      {
        onViewportChange: (t) => {
          currentTransform = t;
        },
        onSelectionChange: vi.fn(),
      }
    );

    expect(controller.getTool()).toBe("select");
    controller.setTool("pan");
    expect(controller.getTool()).toBe("pan");
    expect(hostEl.style.cursor).toBe("grab");

    controller.unbind();
    hierarchy.destroy();
  });

  it("selects top-most node on click and clears selection on empty click", () => {
    const hostEl = document.createElement("div");
    document.body.appendChild(hostEl);
    const hierarchy = new SceneGraphHierarchy();
    const spatialIndex = new SpatialIndex();

    const node1 = createMockNode("bottom", 100, 100, 1);
    const node2 = createMockNode("top", 120, 120, 5);
    spatialIndex.load([node1, node2]);

    let selected: PageSceneNode[] = [];
    const controller = new SpatialInteractionController(
      hostEl,
      hierarchy,
      spatialIndex,
      () => ({ x: 0, y: 0, scale: 1.0 }),
      (pt) => pt,
      {
        onViewportChange: vi.fn(),
        onSelectionChange: (nodes) => {
          selected = nodes;
        },
      }
    );

    // Click at overlapping region (150, 150)
    controller.selectNodes([node2]);
    expect(selected.length).toBe(1);
    expect(selected[0]?.id).toBe(node2.id);

    // Clear selection
    controller.clearSelection();
    expect(selected.length).toBe(0);

    controller.unbind();
    hierarchy.destroy();
    document.body.removeChild(hostEl);
  });

  it("invokes hover callback when cursor passes over an element", () => {
    const hostEl = document.createElement("div");
    const hierarchy = new SceneGraphHierarchy();
    const spatialIndex = new SpatialIndex();
    const node = createMockNode("node1", 50, 50, 1);
    spatialIndex.load([node]);

    let hovered: PageSceneNode | null = null;
    const controller = new SpatialInteractionController(
      hostEl,
      hierarchy,
      spatialIndex,
      () => ({ x: 0, y: 0, scale: 1.0 }),
      (pt) => pt,
      {
        onViewportChange: vi.fn(),
        onSelectionChange: vi.fn(),
        onHoverChange: (n) => {
          hovered = n;
        },
      }
    );

    // Simulate pointermove over node (60, 60)
    const moveEvent = Object.assign(new Event("pointermove"), {
      clientX: 60,
      clientY: 60,
      pointerId: 1,
    });
    hostEl.dispatchEvent(moveEvent);

    expect(hovered).toBeDefined();
    expect((hovered as PageSceneNode | null)?.id).toBe(node.id);

    controller.unbind();
    hierarchy.destroy();
  });
});
