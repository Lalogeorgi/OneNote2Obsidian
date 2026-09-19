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

  it("handles touch screen single-finger panning on empty canvas", () => {
    const hostEl = document.createElement("div");
    document.body.appendChild(hostEl);
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

    // 1. Touch down on empty canvas (no hit node)
    const downEvent = Object.assign(new Event("pointerdown"), {
      clientX: 50,
      clientY: 50,
      pointerId: 1,
      pointerType: "touch",
      button: 0,
    });
    hostEl.dispatchEvent(downEvent);

    // 2. Touch drag by (30, 40)
    const moveEvent = Object.assign(new Event("pointermove"), {
      clientX: 80,
      clientY: 90,
      pointerId: 1,
      pointerType: "touch",
    });
    hostEl.dispatchEvent(moveEvent);

    // Viewport must have panned by (30, 40)
    expect(currentTransform.x).toBe(30);
    expect(currentTransform.y).toBe(40);

    // 3. Touch up
    const upEvent = Object.assign(new Event("pointerup"), {
      clientX: 80,
      clientY: 90,
      pointerId: 1,
      pointerType: "touch",
    });
    hostEl.dispatchEvent(upEvent);

    controller.unbind();
    hierarchy.destroy();
    document.body.removeChild(hostEl);
  });

  it("cancels active ink stroke upon multi-touch and performs two-finger pinch-to-zoom and pan", () => {
    const hostEl = document.createElement("div");
    document.body.appendChild(hostEl);
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

    controller.setTool("pen");
    expect(controller.getTool()).toBe("pen");

    // 1. Finger 1 touches down and begins drawing ink
    const down1 = Object.assign(new Event("pointerdown"), {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      pointerType: "touch",
      button: 0,
    });
    hostEl.dispatchEvent(down1);
    expect(controller.ink.getCurrentPoints().length).toBe(1);

    // 2. Finger 2 touches down (initiating two-finger gesture)
    const down2 = Object.assign(new Event("pointerdown"), {
      clientX: 200,
      clientY: 100,
      pointerId: 2,
      pointerType: "touch",
      button: 0,
    });
    hostEl.dispatchEvent(down2);

    // Active single-finger ink stroke must be canceled upon second touch!
    expect(controller.ink.getCurrentPoints().length).toBe(0);

    // 3. Fingers move apart and translate (simultaneous pinch-zoom and pan)
    // Distance expands from 100 to 200 (scale doubles to ~2.0) and midpoint moves from (150, 100) to (180, 120)
    const move1 = Object.assign(new Event("pointermove"), {
      clientX: 80,
      clientY: 120,
      pointerId: 1,
      pointerType: "touch",
    });
    hostEl.dispatchEvent(move1);

    const move2 = Object.assign(new Event("pointermove"), {
      clientX: 280,
      clientY: 120,
      pointerId: 2,
      pointerType: "touch",
    });
    hostEl.dispatchEvent(move2);

    // Scale must have increased due to pinch-zoom
    expect(currentTransform.scale).toBeGreaterThan(1.5);

    // 4. Release fingers
    const up1 = Object.assign(new Event("pointerup"), {
      clientX: 80,
      clientY: 120,
      pointerId: 1,
      pointerType: "touch",
    });
    hostEl.dispatchEvent(up1);

    const up2 = Object.assign(new Event("pointerup"), {
      clientX: 280,
      clientY: 120,
      pointerId: 2,
      pointerType: "touch",
    });
    hostEl.dispatchEvent(up2);

    controller.unbind();
    hierarchy.destroy();
    document.body.removeChild(hostEl);
  });
});
