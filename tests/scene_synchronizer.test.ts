import { describe, expect, it } from "vitest";
import { Rectangle } from "../src/geometry/Rectangle";
import { IdGenerator } from "../src/model/Ids";
import { PageScene, PageSceneNode } from "../src/pagescene/PageScene";
import { SceneGraphHierarchy } from "../src/renderer/pixi/SceneGraphHierarchy";
import { SceneSynchronizer } from "../src/renderer/pixi/SceneSynchronizer";

describe("Scene Synchronizer & Incremental Stage Updates", () => {
  const createMockScene = (nodes: PageSceneNode[]): PageScene => {
    return {
      pageId: IdGenerator.pageId(),
      title: "Test Sync Scene",
      canvasBounds: new Rectangle(0, 0, 1000, 1000),
      canvasStyle: { backgroundColor: "#FFFFFF" },
      nodes,
      version: 1,
    };
  };

  const createShapeNode = (id: string, x: number, y: number, zIndex: number): PageSceneNode => {
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

  const createTextNode = (id: string, text: string): PageSceneNode => {
    return {
      id: IdGenerator.objectId(id),
      layer: "text",
      bounds: { x: 50, y: 50, width: 200, height: 50, zIndex: 1 },
      aabb: Rectangle.create(50, 50, 200, 50),
      zIndex: 1,
      visible: true,
      element: {
        type: "outline",
        id: IdGenerator.objectId(id),
        bounds: { x: 50, y: 50, width: 200, height: 50, zIndex: 1 },
        paragraphs: [{ id: IdGenerator.objectId("p"), indentLevel: 0, runs: [{ text }] }],
      },
      renderedHtml: `<div>${text}</div>`,
    };
  };

  it("performs initial sync creating display objects across designated layer containers", () => {
    const hierarchy = new SceneGraphHierarchy();
    const domOverlay = document.createElement("div");
    const sync = new SceneSynchronizer(hierarchy, domOverlay);

    const node1 = createShapeNode("shape1", 100, 100, 1);
    const node2 = createTextNode("text1", "Sample Text");
    const scene = createMockScene([node1, node2]);

    const stats = sync.sync(scene);

    expect(stats.createdCount).toBe(2);
    expect(stats.updatedCount).toBe(0);
    expect(stats.removedCount).toBe(0);

    // Verify display object mounted in shapesLayer
    const shapeObj = sync.getDisplayObject(node1.id);
    expect(shapeObj).toBeDefined();
    expect(hierarchy.shapesLayer.children).toContain(shapeObj);

    // Verify DOM overlay mounted for text
    const textDom = domOverlay.querySelector(`#dom-outline-${node2.id}`);
    expect(textDom).toBeDefined();
    expect(textDom?.innerHTML).toContain("Sample Text");
  });

  it("incrementally updates modified nodes without recreating untouched nodes", () => {
    const hierarchy = new SceneGraphHierarchy();
    const domOverlay = document.createElement("div");
    const sync = new SceneSynchronizer(hierarchy, domOverlay);

    const node1 = createShapeNode("shape1", 100, 100, 1);
    const node2 = createShapeNode("shape2", 300, 300, 2);
    const scene1 = createMockScene([node1, node2]);

    sync.sync(scene1);
    const originalShape1 = sync.getDisplayObject(node1.id);

    // Update node1 position, keep node2 unchanged
    const updatedNode1: PageSceneNode = {
      ...node1,
      bounds: { ...node1.bounds, x: 150, y: 150 },
      aabb: Rectangle.create(150, 150, 100, 100),
    };
    const scene2 = createMockScene([updatedNode1, node2]);

    const stats = sync.sync(scene2);

    expect(stats.createdCount).toBe(0);
    expect(stats.updatedCount).toBe(1);
    expect(stats.unchangedCount).toBe(1);

    // Ensure the exact same display object instance was updated in place
    expect(sync.getDisplayObject(node1.id)).toBe(originalShape1);
  });

  it("destroys removed nodes when excluded from subsequent scene", () => {
    const hierarchy = new SceneGraphHierarchy();
    const domOverlay = document.createElement("div");
    const sync = new SceneSynchronizer(hierarchy, domOverlay);

    const node1 = createShapeNode("shape1", 100, 100, 1);
    const node2 = createTextNode("text1", "To Be Deleted");
    const scene1 = createMockScene([node1, node2]);

    sync.sync(scene1);
    expect(domOverlay.querySelectorAll(".onenote-note-container").length).toBe(1);

    // Remove text1 in next scene
    const scene2 = createMockScene([node1]);
    const stats = sync.sync(scene2);

    expect(stats.removedCount).toBe(1);
    expect(sync.getDisplayObject(node2.id)).toBeNull();
    expect(domOverlay.querySelectorAll(".onenote-note-container").length).toBe(0);
  });
});
