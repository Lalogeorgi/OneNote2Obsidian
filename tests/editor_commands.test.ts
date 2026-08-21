import { beforeEach, describe, expect, it } from "vitest";
import {
  DeleteNodesCommand,
  DuplicateNodesCommand,
  EditTextCommand,
  InsertElementCommand,
  MoveNodesCommand,
  ResizeNodeCommand,
  ZOrderCommand,
} from "../src/editor/commands/EditorCommands";
import { Rectangle } from "../src/geometry/Rectangle";
import { CanonicalOutline } from "../src/model/CanonicalElements";
import { IdGenerator } from "../src/model/Ids";
import { PageScene, PageSceneNode } from "../src/pagescene/PageScene";

describe("Editor Commands & Reversible Mutations", () => {
  let scene: PageScene;
  let node1: PageSceneNode;
  let node2: PageSceneNode;

  beforeEach(() => {
    node1 = {
      id: IdGenerator.objectId("n1"),
      layer: "shapes",
      bounds: { x: 50, y: 50, width: 100, height: 100, zIndex: 1 },
      aabb: Rectangle.create(50, 50, 100, 100),
      zIndex: 1,
      visible: true,
      element: {
        type: "shape",
        id: IdGenerator.objectId("n1"),
        bounds: { x: 50, y: 50, width: 100, height: 100, zIndex: 1 },
        shapeKind: "rectangle",
        strokeWidth: 2,
      },
    };

    node2 = {
      id: IdGenerator.objectId("n2"),
      layer: "text",
      bounds: { x: 200, y: 100, width: 150, height: 80, zIndex: 2 },
      aabb: Rectangle.create(200, 100, 150, 80),
      zIndex: 2,
      visible: true,
      renderedHtml: "<p>Hello World</p>",
      element: {
        type: "outline",
        id: IdGenerator.objectId("n2"),
        bounds: { x: 200, y: 100, width: 150, height: 80, zIndex: 2 },
        paragraphs: [
          {
            id: IdGenerator.objectId("p1"),
            indentLevel: 0,
            runs: [{ text: "Hello World" }],
          },
        ],
      },
    };

    scene = {
      pageId: IdGenerator.pageId("page_edit"),
      title: "Editor Commands Test",
      canvasBounds: Rectangle.create(0, 0, 1200, 800),
      canvasStyle: { backgroundColor: "#FFFFFF" },
      nodes: [node1, node2],
    };
  });

  it("executes and undos MoveNodesCommand translating coordinates", () => {
    const cmd = new MoveNodesCommand(scene, [node1.id, node2.id], 30, 40);

    cmd.execute();
    expect(node1.bounds.x).toBe(80);
    expect(node1.bounds.y).toBe(90);
    expect(node2.bounds.x).toBe(230);
    expect(node2.bounds.y).toBe(140);

    cmd.undo();
    expect(node1.bounds.x).toBe(50);
    expect(node1.bounds.y).toBe(50);
    expect(node2.bounds.x).toBe(200);
    expect(node2.bounds.y).toBe(100);
  });

  it("executes and undos ResizeNodeCommand", () => {
    const oldBounds = { ...node1.bounds };
    const newBounds = { x: 50, y: 50, width: 250, height: 180, zIndex: 1 };
    const cmd = new ResizeNodeCommand(scene, node1.id, oldBounds, newBounds);

    cmd.execute();
    expect(node1.bounds.width).toBe(250);
    expect(node1.bounds.height).toBe(180);

    cmd.undo();
    expect(node1.bounds.width).toBe(100);
    expect(node1.bounds.height).toBe(100);
  });

  it("executes and undos DeleteNodesCommand", () => {
    const cmd = new DeleteNodesCommand(scene, [node1.id]);

    cmd.execute();
    expect(scene.nodes.length).toBe(1);
    expect(scene.nodes[0]!.id).toBe(node2.id);

    cmd.undo();
    expect(scene.nodes.length).toBe(2);
    expect(scene.nodes.find((n) => n.id === node1.id)).toBeDefined();
  });

  it("executes and undos InsertElementCommand", () => {
    const newNode: PageSceneNode = {
      id: IdGenerator.objectId("n3"),
      layer: "shapes",
      bounds: { x: 300, y: 300, width: 50, height: 50, zIndex: 3 },
      aabb: Rectangle.create(300, 300, 50, 50),
      zIndex: 3,
      visible: true,
      element: {
        type: "shape",
        id: IdGenerator.objectId("n3"),
        bounds: { x: 300, y: 300, width: 50, height: 50, zIndex: 3 },
        shapeKind: "ellipse",
        strokeWidth: 1,
      },
    };

    const cmd = new InsertElementCommand(scene, newNode);

    cmd.execute();
    expect(scene.nodes.length).toBe(3);

    cmd.undo();
    expect(scene.nodes.length).toBe(2);
    expect(scene.nodes.find((n) => n.id === newNode.id)).toBeUndefined();
  });

  it("executes and undos ZOrderCommand (bringToFront & sendToBack)", () => {
    const bringFrontCmd = new ZOrderCommand(scene, [node1.id], "bringToFront");
    bringFrontCmd.execute();
    expect(node1.zIndex).toBeGreaterThan(node2.zIndex);

    bringFrontCmd.undo();
    expect(node1.zIndex).toBe(1);

    const sendBackCmd = new ZOrderCommand(scene, [node2.id], "sendToBack");
    sendBackCmd.execute();
    expect(node2.zIndex).toBe(0);

    sendBackCmd.undo();
    expect(node2.zIndex).toBe(2);
  });

  it("executes and undos EditTextCommand", () => {
    const outline = node2.element as CanonicalOutline;
    const oldParas = [...outline.paragraphs];
    const newParas = [
      {
        id: IdGenerator.objectId("p_edit"),
        indentLevel: 0,
        runs: [{ text: "Updated Content in-place" }],
      },
    ];

    const cmd = new EditTextCommand(node2, oldParas, newParas);
    cmd.execute();
    expect(outline.paragraphs[0]!.runs[0]!.text).toBe("Updated Content in-place");

    cmd.undo();
    expect(outline.paragraphs[0]!.runs[0]!.text).toBe("Hello World");
  });

  it("executes and undos DuplicateNodesCommand", () => {
    const cmd = new DuplicateNodesCommand(scene, [node1.id], 30);
    cmd.execute();
    expect(scene.nodes.length).toBe(3);

    const dup = cmd.duplicatedNodes[0]!;
    expect(dup.bounds.x).toBe(node1.bounds.x + 30);
    expect(dup.bounds.y).toBe(node1.bounds.y + 30);

    cmd.undo();
    expect(scene.nodes.length).toBe(2);
  });
});
