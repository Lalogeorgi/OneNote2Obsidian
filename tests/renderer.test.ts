import { describe, expect, it, vi, beforeEach } from "vitest";
import { Point } from "../src/geometry/Point";
import { ViewportTransform } from "../src/geometry/Transform";
import { IdGenerator } from "../src/model/Ids";
import { CanonicalPage } from "../src/model/CanonicalPage";
import { SceneBuilder } from "../src/pagescene/SceneBuilder";
import { RendererInstrumentation } from "../src/renderer/pixi/Instrumentation";
import { ResourceTracker } from "../src/renderer/pixi/ResourceTracker";
import { SceneGraphHierarchy } from "../src/renderer/pixi/SceneGraphHierarchy";
import { PixiRenderer } from "../src/renderer/pixi/PixiRenderer";
import { Application, Container } from "pixi.js";

// Mock PixiJS Application.init in headless Node/JSDOM test runner
vi.spyOn(Application.prototype, "init").mockImplementation(async function (this: Application) {
  const mockCanvas = document.createElement("canvas");
  Object.defineProperty(this, "canvas", {
    value: mockCanvas,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(this, "stage", {
    value: new Container(),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(this, "renderer", {
    value: {
      resolution: 1,
      resize: vi.fn(),
      destroy: vi.fn(),
    },
    writable: true,
    configurable: true,
  });
});

vi.spyOn(Application.prototype, "destroy").mockImplementation(function (this: Application) {
  // Mock teardown
});

describe("PixiJS Rendering Engine & Resource Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ResourceTracker", () => {
    it("releases registered disposables and DOM event listeners", () => {
      const tracker = new ResourceTracker();
      let isDisposed = false;

      tracker.register(() => {
        isDisposed = true;
      });

      const element = document.createElement("div");
      let clickCount = 0;
      const listener = () => clickCount++;

      tracker.addEventListener(element, "click", listener);

      element.dispatchEvent(new Event("click"));
      expect(clickCount).toBe(1);

      tracker.disposeAll();
      expect(isDisposed).toBe(true);

      // Event listener should have been removed
      element.dispatchEvent(new Event("click"));
      expect(clickCount).toBe(1);
    });
  });

  describe("SceneGraphHierarchy", () => {
    it("constructs the 6-layer container hierarchy and updates viewport", () => {
      const hierarchy = new SceneGraphHierarchy();

      expect(hierarchy.rootContainer.children.length).toBe(1); // pageContainer
      expect(hierarchy.pageContainer.children.length).toBe(14); // 14 layer containers (including stickyNotesLayer, spatialLinksLayer, spatialGroupsLayer, annotationsLayer)

      const transform: ViewportTransform = { x: 50, y: 80, scale: 1.5 };
      hierarchy.updateViewport(transform);

      expect(hierarchy.pageContainer.position.x).toBe(50);
      expect(hierarchy.pageContainer.position.y).toBe(80);
      expect(hierarchy.pageContainer.scale.x).toBe(1.5);
      expect(hierarchy.pageContainer.scale.y).toBe(1.5);

      hierarchy.destroy();
    });
  });

  describe("RendererInstrumentation", () => {
    it("tracks frames and calculates stats", () => {
      const instr = new RendererInstrumentation();
      const t0 = instr.beginFrame();
      instr.visibleNodeCount = 25;
      instr.totalNodeCount = 100;
      instr.endFrame(t0);

      const stats = instr.getStats();
      expect(stats.visibleNodeCount).toBe(25);
      expect(stats.totalNodeCount).toBe(100);
      expect(stats.frameTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("PixiRenderer Decoupled Abstraction", () => {
    const samplePage: CanonicalPage = {
      id: IdGenerator.pageId("p_render_test"),
      title: "Renderer Integration Page",
      pageLevel: 0,
      createdTime: Date.now(),
      modifiedTime: Date.now(),
      canvasStyle: {
        backgroundColor: "#F9FAFB",
        ruleLines: { kind: "college", color: "#E5E7EB", spacing: 28 },
      },
      elements: [
        {
          type: "outline",
          id: IdGenerator.objectId("out_render"),
          bounds: { x: 100, y: 100, width: 400, height: 200, zIndex: 10 },
          paragraphs: [
            {
              id: IdGenerator.objectId("p"),
              indentLevel: 0,
              runs: [{ text: "Renderer Test", style: { fontSize: 18, bold: true } }],
            },
          ],
        },
        {
          type: "shape",
          id: IdGenerator.objectId("shape_test"),
          bounds: { x: 550, y: 120, width: 100, height: 80, zIndex: 5 },
          shapeKind: "rectangle",
          strokeWidth: 2,
        },
        {
          type: "ink",
          id: IdGenerator.objectId("ink_test"),
          bounds: { x: 100, y: 100, width: 50, height: 50, zIndex: 15 },
          isHighlighter: false,
          strokes: [
            {
              id: IdGenerator.objectId("st"),
              color: "#000000",
              width: 2,
              points: [
                { x: 100, y: 100 },
                { x: 150, y: 150 },
              ],
            },
          ],
        },
      ],
    };

    it("initializes, renders a scene, performs hit tests, and destroys cleanly without leaks", async () => {
      const hostEl = document.createElement("div");
      document.body.appendChild(hostEl);

      const renderer = new PixiRenderer();
      await renderer.initialize(hostEl, { enableDomOverlay: true });

      const scene = SceneBuilder.build(samplePage);
      renderer.renderScene(scene);

      // Verify DOM overlay mounted outline container
      const overlay = hostEl.querySelector(".onenote-dom-overlay");
      expect(overlay).not.toBeNull();
      const outlineEl = overlay?.querySelector(".onenote-outline-container");
      expect(outlineEl).not.toBeNull();
      expect(outlineEl?.textContent).toContain("Renderer Test");

      // Verify hit testing
      const hit = renderer.hitTest(new Point(120, 120));
      expect(hit).not.toBeNull();
      // Should hit highest zIndex element at that point
      expect(hit?.node).toBeDefined();

      // Verify coordinate transformation
      renderer.setViewport({ x: 50, y: 50, scale: 2.0 });
      const screenPt = renderer.sceneToScreen({ x: 100, y: 100 });
      expect(screenPt.x).toBe(250); // (100 * 2) + 50
      expect(screenPt.y).toBe(250);

      const scenePt = renderer.screenToScene(screenPt);
      expect(scenePt.x).toBeCloseTo(100);
      expect(scenePt.y).toBeCloseTo(100);

      // Resize
      renderer.resize(800, 600);

      // Verify stats and frustum culling
      const stats = renderer.getStats();
      expect(stats.totalNodeCount).toBe(3);
      expect(stats.visibleNodeCount).toBe(2);
      expect(stats.culledNodeCount).toBe(1);

      // Destroy and ensure teardown
      renderer.destroy();
      expect(hostEl.querySelector(".onenote-dom-overlay")).toBeNull();
      document.body.removeChild(hostEl);
    });
  });
});
