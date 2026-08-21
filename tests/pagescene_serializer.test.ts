import { describe, expect, it } from "vitest";
import { Rectangle } from "../src/geometry/Rectangle";
import { IdGenerator } from "../src/model/Ids";
import { PageScene } from "../src/pagescene/PageScene";
import { PageSceneSerializer } from "../src/pagescene/PageSceneSerializer";

describe("PageSceneSerializer Schema Versioning & Migrations", () => {
  it("serializes and deserializes PageScene with schema version 1", () => {
    const scene: PageScene = {
      pageId: IdGenerator.pageId("p1"),
      title: "Test Serialization Page",
      canvasBounds: new Rectangle(0, 0, 1000, 800),
      canvasStyle: {
        backgroundColor: "#F8FAFC",
        ruleLines: { kind: "narrow", color: "#E2E8F0", spacing: 20 },
      },
      version: 1,
      nodes: [
        {
          id: IdGenerator.objectId("n1"),
          layer: "text",
          bounds: { x: 40, y: 50, width: 300, height: 100, zIndex: 1 },
          aabb: Rectangle.create(40, 50, 300, 100),
          zIndex: 1,
          visible: true,
          renderedHtml: "<p>Test</p>",
          element: { type: "outline" } as any,
        },
      ],
    };

    const json = PageSceneSerializer.serialize(scene);
    expect(json).toContain(`"version": 1`);
    expect(json).toContain("https://raw.githubusercontent.com/Lalogeorgi/OneNote2Obsidian/main/spec/v1/schema.json");

    const restored = PageSceneSerializer.deserialize(json);
    expect(restored.pageId).toBe(scene.pageId);
    expect(restored.title).toBe("Test Serialization Page");
    expect(restored.canvasStyle.backgroundColor).toBe("#F8FAFC");
    expect(restored.nodes.length).toBe(1);
    expect(restored.nodes[0]!.bounds.x).toBe(40);
  });

  it("migrates legacy v0 schema without version field to schema v1", () => {
    const legacyDoc = {
      pageId: "page_legacy_101",
      title: "Legacy Alpha Note",
      backgroundColor: "#FFFFFF",
      nodes: [
        {
          id: "node_legacy_1",
          layer: "images",
          x: 100,
          y: 120,
          width: 400,
          height: 300,
          zIndex: 2,
          element: { type: "image" },
        },
      ],
    };

    const migrated = PageSceneSerializer.migrate(legacyDoc);
    expect(migrated.version).toBe(1);
    expect(migrated.metadata.pageId).toBe("page_legacy_101");
    expect(migrated.metadata.migratedFromVersion).toBe(0);
    expect(migrated.nodes.length).toBe(1);
    expect(migrated.nodes[0]!.x).toBe(100);

    const json = JSON.stringify(legacyDoc);
    const restoredScene = PageSceneSerializer.deserialize(json);
    expect(restoredScene.pageId).toBe("page_legacy_101");
    expect(restoredScene.nodes[0]!.bounds.width).toBe(400);
  });

  it("rejects completely malformed JSON with structured error message", () => {
    const invalidJson = "{ this is broken json :: ]";
    expect(() => PageSceneSerializer.deserialize(invalidJson)).toThrow(
      "Invalid .onecanvas.json format"
    );
  });
});
