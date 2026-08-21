import { describe, expect, it } from "vitest";
import { InkDrawingController } from "../src/editor/ink/InkDrawingController";
import { Point } from "../src/geometry/Point";
import { Rectangle } from "../src/geometry/Rectangle";
import { CanonicalInkStrokeGroup } from "../src/model/CanonicalElements";
import { IdGenerator } from "../src/model/Ids";
import { PageSceneNode } from "../src/pagescene/PageScene";

describe("InkDrawingController & Live Stroke Subsystem", () => {
  it("captures, filters, and completes freehand ink strokes", () => {
    const controller = new InkDrawingController({
      mode: "pen",
      color: "#EF4444",
      strokeWidth: 4,
    });

    controller.startStroke(new Point(10, 10));
    controller.continueStroke(new Point(11, 11)); // Filtered (< 2px distance)
    controller.continueStroke(new Point(30, 40));
    controller.continueStroke(new Point(60, 80));

    expect(controller.getCurrentPoints().length).toBe(3);

    const node = controller.finishStroke();
    expect(node).not.toBeNull();
    expect(node?.layer).toBe("topInk");

    const el = node?.element as CanonicalInkStrokeGroup;
    expect(el.strokes.length).toBe(1);
    expect(el.strokes[0]!.color).toBe("#EF4444");
    expect(el.strokes[0]!.width).toBe(4);
    expect(node?.bounds.width).toBeGreaterThan(40);
  });

  it("creates bottomInk highlighter layer when mode is highlighter", () => {
    const controller = new InkDrawingController({
      mode: "highlighter",
      color: "#FFFF00",
      strokeWidth: 16,
    });

    controller.startStroke(new Point(100, 100));
    controller.continueStroke(new Point(300, 100));

    const node = controller.finishStroke();
    expect(node?.layer).toBe("bottomInk");
    expect((node?.element as CanonicalInkStrokeGroup).isHighlighter).toBe(true);
  });

  it("erases ink strokes that intersect eraser radius", () => {
    const controller = new InkDrawingController();

    const inkGroup: CanonicalInkStrokeGroup = {
      type: "ink",
      id: IdGenerator.objectId("ink_g1"),
      bounds: { x: 50, y: 50, width: 100, height: 100, zIndex: 20 },
      isHighlighter: false,
      strokes: [
        {
          id: IdGenerator.objectId("s1"),
          points: [new Point(50, 50), new Point(150, 50)],
          color: "#000000",
          width: 2,
        },
      ],
    };

    const inkNode: PageSceneNode = {
      id: inkGroup.id,
      layer: "topInk",
      bounds: inkGroup.bounds,
      aabb: Rectangle.create(inkGroup.bounds.x, inkGroup.bounds.y, inkGroup.bounds.width, inkGroup.bounds.height),
      zIndex: 20,
      visible: true,
      element: inkGroup,
      isHighlighter: false,
      color: "#000000",
      strokeWidth: 2,
    };

    // Erase near middle of the stroke (100, 50)
    const result = controller.eraseAt(new Point(100, 52), [inkNode], 10);
    expect(result.deletedNodeIds).toContain(inkNode.id);

    // Erase far away from stroke
    const missResult = controller.eraseAt(new Point(100, 200), [inkNode], 10);
    expect(missResult.deletedNodeIds.length).toBe(0);
  });
});
