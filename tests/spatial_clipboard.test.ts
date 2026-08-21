import { beforeEach, describe, expect, it } from "vitest";
import { SpatialClipboard } from "../src/editor/clipboard/SpatialClipboard";
import { HistoryManager } from "../src/editor/HistoryManager";
import { Point } from "../src/geometry/Point";
import { Rectangle } from "../src/geometry/Rectangle";
import { IdGenerator } from "../src/model/Ids";
import { PageScene, PageSceneNode } from "../src/pagescene/PageScene";

describe("SpatialClipboard & Copy/Cut/Paste Operations", () => {
  let scene: PageScene;
  let node: PageSceneNode;
  let history: HistoryManager;

  beforeEach(() => {
    history = new HistoryManager();
    SpatialClipboard.clear();

    node = {
      id: IdGenerator.objectId("n_clip"),
      layer: "shapes",
      bounds: { x: 100, y: 100, width: 80, height: 60, zIndex: 1 },
      aabb: Rectangle.create(100, 100, 80, 60),
      zIndex: 1,
      visible: true,
      element: {
        type: "shape",
        id: IdGenerator.objectId("n_clip"),
        bounds: { x: 100, y: 100, width: 80, height: 60, zIndex: 1 },
        shapeKind: "rectangle",
        strokeWidth: 2,
      },
    };

    scene = {
      pageId: IdGenerator.pageId("p_clip"),
      title: "Clipboard Test",
      canvasBounds: Rectangle.create(0, 0, 1000, 1000),
      canvasStyle: { backgroundColor: "#FFFFFF" },
      nodes: [node],
    };
  });

  it("copies and pastes nodes at target scene coordinate", () => {
    SpatialClipboard.copy([node]);
    expect(SpatialClipboard.hasContent()).toBe(true);

    const pasted = SpatialClipboard.paste(scene, new Point(400, 500), history);
    expect(pasted.length).toBe(1);
    expect(scene.nodes.length).toBe(2);

    const pastedNode = pasted[0]!;
    expect(pastedNode.id).not.toBe(node.id);
    expect(pastedNode.bounds.x).toBe(400);
    expect(pastedNode.bounds.y).toBe(500);

    // Undo paste
    history.undo();
    expect(scene.nodes.length).toBe(1);
  });

  it("cuts node from scene into clipboard", () => {
    SpatialClipboard.cut(scene, [node], history);
    expect(scene.nodes.length).toBe(0);
    expect(SpatialClipboard.hasContent()).toBe(true);

    history.undo();
    expect(scene.nodes.length).toBe(1);
  });
});
