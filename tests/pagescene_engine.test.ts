import { describe, expect, it } from "vitest";
import { CoordinateMath } from "../src/geometry/Bounds";
import {
  CanonicalAttachment,
  CanonicalImage,
  CanonicalInkStrokeGroup,
  CanonicalOutline,
  CanonicalParagraph,
  CanonicalShape,
  CanonicalTable,
} from "../src/model/CanonicalElements";
import { CanonicalPage } from "../src/model/CanonicalPage";
import { IdGenerator } from "../src/model/Ids";
import { SceneBuilder } from "../src/pagescene/SceneBuilder";
import { PageSceneSerializer } from "../src/pagescene/PageSceneSerializer";

describe("PageScene Engine & Deterministic Serialization", () => {
  const createSamplePage = (): CanonicalPage => {
    const p1: CanonicalParagraph = {
      id: IdGenerator.objectId("p1"),
      indentLevel: 0,
      runs: [{ text: "Hello OneNote Spatial Canvas", style: { fontSize: 16, bold: true } }],
    };

    const outline: CanonicalOutline = {
      type: "outline",
      id: IdGenerator.objectId("outline1"),
      bounds: CoordinateMath.normalizeBounds(100, 150, 400, 100, 1),
      paragraphs: [p1],
    };

    const image: CanonicalImage = {
      type: "image",
      id: IdGenerator.objectId("img1"),
      bounds: CoordinateMath.normalizeBounds(300, 200, 300, 200, 2),
      assetId: IdGenerator.assetId(),
      mimeType: "image/png",
    };

    const ink: CanonicalInkStrokeGroup = {
      type: "ink",
      id: IdGenerator.objectId("ink1"),
      bounds: CoordinateMath.normalizeBounds(150, 120, 200, 80, 3),
      isHighlighter: false,
      strokes: [
        {
          id: IdGenerator.objectId("s1"),
          points: [
            { x: 10, y: 10, pressure: 0.5 },
            { x: 20, y: 25, pressure: 0.8 },
            { x: 30, y: 40, pressure: 0.6 },
          ],
          color: "#FF0000",
          width: 3,
        },
      ],
    };

    const table: CanonicalTable = {
      type: "table",
      id: IdGenerator.objectId("tbl1"),
      bounds: CoordinateMath.normalizeBounds(100, 400, 500, 200, 4),
      columns: [{ width: 250 }, { width: 250 }],
      rows: [
        {
          id: IdGenerator.objectId("r1"),
          cells: [
            { id: IdGenerator.objectId("c1"), elements: [] },
            { id: IdGenerator.objectId("c2"), elements: [] },
          ],
        },
      ],
    };

    const shape: CanonicalShape = {
      type: "shape",
      id: IdGenerator.objectId("shp1"),
      bounds: CoordinateMath.normalizeBounds(500, 100, 150, 100, 5),
      shapeKind: "rectangle",
      strokeColor: "#3B82F6",
      strokeWidth: 2,
    };

    const attachment: CanonicalAttachment = {
      type: "attachment",
      id: IdGenerator.objectId("att1"),
      bounds: CoordinateMath.normalizeBounds(100, 650, 200, 48, 6),
      assetId: IdGenerator.assetId(),
      fileName: "Architecture.pdf",
      fileSizeBytes: 1048576,
    };

    return {
      id: IdGenerator.pageId(),
      title: "Architecture Roadmap",
      pageLevel: 0,
      createdTime: 1724218800000,
      modifiedTime: 1724222400000,
      canvasStyle: {
        backgroundColor: "#FAFAFA",
        ruleLines: { kind: "college", color: "#E0E0E0", spacing: 28, marginX: 96 },
      },
      elements: [outline, image, ink, table, shape, attachment],
    };
  };

  it("converts all canonical elements into a deterministically ordered PageScene", () => {
    const page = createSamplePage();
    const scene = SceneBuilder.build(page);

    expect(scene.pageId).toBe(page.id);
    expect(scene.title).toBe("Architecture Roadmap");
    expect(scene.nodes.length).toBe(6);

    // Verify deterministic z-order sorting
    for (let i = 0; i < scene.nodes.length - 1; i++) {
      expect(scene.nodes[i]!.zIndex).toBeLessThanOrEqual(scene.nodes[i + 1]!.zIndex);
    }

    // Verify layer assignments
    const layers = scene.nodes.map((n) => n.layer);
    expect(layers).toContain("text");
    expect(layers).toContain("images");
    expect(layers).toContain("topInk");
    expect(layers).toContain("tables");
    expect(layers).toContain("shapes");
    expect(layers).toContain("attachments");
  });

  it("preserves exact geometry and calculates dynamic canvas bounding box", () => {
    const page = createSamplePage();
    const scene = SceneBuilder.build(page);

    expect(scene.canvasBounds.width).toBeGreaterThan(500);
    expect(scene.canvasBounds.height).toBeGreaterThan(650);

    const outlineNode = scene.nodes.find((n) => n.layer === "text")!;
    expect(outlineNode.bounds.x).toBe(CoordinateMath.pointsToPixels(100));
    expect(outlineNode.bounds.y).toBe(CoordinateMath.pointsToPixels(150));
  });

  it("serializes and deserializes deterministically to .onecanvas.json format", () => {
    const page = createSamplePage();
    const scene1 = SceneBuilder.build(page);

    const json1 = PageSceneSerializer.serialize(scene1);
    const json2 = PageSceneSerializer.serialize(scene1);

    // Bit-for-bit identical serialization
    expect(json1).toBe(json2);

    const roundTripScene = PageSceneSerializer.deserialize(json1);
    expect(roundTripScene.pageId).toBe(scene1.pageId);
    expect(roundTripScene.title).toBe(scene1.title);
    expect(roundTripScene.nodes.length).toBe(scene1.nodes.length);
    expect(roundTripScene.canvasBounds.width).toBe(scene1.canvasBounds.width);
  });
});
