import { describe, expect, it } from "vitest";
import { IdGenerator } from "../src/model/Ids";
import { CanonicalPage } from "../src/model/CanonicalPage";
import { SceneBuilder } from "../src/pagescene/SceneBuilder";
import { SpatialIndex } from "../src/pagescene/SpatialIndex";
import { Point } from "../src/geometry/Point";
import { Rectangle } from "../src/geometry/Rectangle";

describe("PageScene Intermediate Representation & Spatial Indexing", () => {
  const samplePage: CanonicalPage = {
    id: IdGenerator.pageId("p_test"),
    title: "Spatial Scene Test",
    pageLevel: 0,
    createdTime: Date.now(),
    modifiedTime: Date.now(),
    canvasStyle: {
      backgroundColor: "#FFFFFF",
      ruleLines: { kind: "college", color: "#E0E0E0", spacing: 24 },
    },
    elements: [
      {
        type: "outline",
        id: IdGenerator.objectId("out_1"),
        bounds: { x: 100, y: 100, width: 300, height: 150, zIndex: 10 },
        paragraphs: [
          {
            id: IdGenerator.objectId("p_1"),
            indentLevel: 0,
            runs: [{ text: "Spatial Text Block", style: { fontSize: 14 } }],
          },
        ],
      },
      {
        type: "shape",
        id: IdGenerator.objectId("shape_1"),
        bounds: { x: 500, y: 200, width: 200, height: 100, zIndex: 5 },
        shapeKind: "rectangle",
        fillColor: "#E0F2FE",
        strokeColor: "#0284C7",
        strokeWidth: 2,
      },
      {
        type: "ink",
        id: IdGenerator.objectId("ink_1"),
        bounds: { x: 150, y: 120, width: 80, height: 40, zIndex: 20 },
        isHighlighter: false,
        strokes: [
          {
            id: IdGenerator.objectId("str_1"),
            color: "#EF4444",
            width: 2,
            points: [
              { x: 150, y: 120 },
              { x: 230, y: 160 },
            ],
          },
        ],
      },
    ],
  };

  it("builds a PageScene display list with sorted Z-order", () => {
    const scene = SceneBuilder.build(samplePage);

    expect(scene.title).toBe("Spatial Scene Test");
    expect(scene.nodes.length).toBe(3);

    // Assert strictly sorted by zIndex ascending: 5, 10, 20
    expect(scene.nodes[0]?.zIndex).toBe(5);
    expect(scene.nodes[1]?.zIndex).toBe(10);
    expect(scene.nodes[2]?.zIndex).toBe(20);
  });

  it("indexes scene nodes into SpatialIndex for sub-millisecond frustum queries", () => {
    const scene = SceneBuilder.build(samplePage);
    const index = new SpatialIndex();
    index.load(scene.nodes);

    // Query viewport containing only outline and ink
    const visibleNodes = index.search(new Rectangle(50, 50, 400, 300));
    expect(visibleNodes.length).toBe(2);

    // Hit test top-most element at (160, 130) -> should return ink (zIndex 20) over outline (zIndex 10)
    const hit = index.hitTest(new Point(160, 130));
    expect(hit).not.toBeNull();
    expect(hit?.id).toBe(scene.nodes[2]?.id);
  });
});
