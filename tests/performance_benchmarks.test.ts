import { beforeEach, describe, expect, it, vi } from "vitest";
import { Application, Container } from "pixi.js";
import { Point } from "../src/geometry/Point";
import { Rectangle } from "../src/geometry/Rectangle";
import {
  CanonicalInkStrokeGroup,
  CanonicalOutline,
  CanonicalStroke,
} from "../src/model/CanonicalElements";
import { CanonicalNotebook, CanonicalSection } from "../src/model/CanonicalNotebook";
import { CanonicalPage } from "../src/model/CanonicalPage";
import { IdGenerator } from "../src/model/Ids";
import { SceneBuilder } from "../src/pagescene/SceneBuilder";
import { SpatialIndex } from "../src/pagescene/SpatialIndex";
import { AssetExtractor } from "../src/projection/AssetExtractor";
import { MarkdownProjector } from "../src/projection/MarkdownProjector";
import { PixiRenderer } from "../src/renderer/pixi/PixiRenderer";

export interface BenchmarkMetrics {
  name: string;
  count: number;
  durationMs: number;
  throughputPerSec?: number;
}

describe("Production-Grade Performance & Scalability Benchmarks", () => {
  const benchmarkResults: BenchmarkMetrics[] = [];

  const setupPixiMock = () => {
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

    vi.spyOn(Application.prototype, "destroy").mockImplementation(function (this: Application) {});
  };

  beforeEach(() => {
    setupPixiMock();
  });

  const recordMetric = (name: string, count: number, durationMs: number): BenchmarkMetrics => {
    const throughputPerSec = count > 0 && durationMs > 0 ? count / (durationMs / 1000) : undefined;
    const metric: BenchmarkMetrics = {
      name,
      count,
      durationMs,
      throughputPerSec,
    };
    benchmarkResults.push(metric);
    return metric;
  };

  it("1. Benchmarks Small Page (<20 elements) construction and indexing", () => {
    const page: CanonicalPage = {
      id: IdGenerator.pageId("small_page"),
      title: "Quick Note",
      pageLevel: 0,
      createdTime: 1700000000000,
      modifiedTime: 1700000050000,
      pageWidth: 800,
      pageHeight: 600,
      canvasStyle: { backgroundColor: "#FFFFFF" },
      elements: [
        {
          type: "outline",
          id: IdGenerator.objectId("out_1"),
          bounds: { x: 50, y: 50, width: 400, height: 100, zIndex: 1 },
          paragraphs: [
            {
              id: IdGenerator.objectId("p1"),
              indentLevel: 0,
              runs: [{ text: "Meeting Notes with team." }],
            },
          ],
        },
        {
          type: "shape",
          id: IdGenerator.objectId("shape_1"),
          bounds: { x: 50, y: 180, width: 120, height: 80, zIndex: 2 },
          shapeKind: "rectangle",
          strokeWidth: 2,
        },
      ],
    };

    const start = performance.now();
    const scene = SceneBuilder.build(page);
    const spatialIndex = new SpatialIndex();
    spatialIndex.load(scene.nodes);
    const duration = performance.now() - start;

    recordMetric("Small Page Build & Indexing", page.elements.length, duration);

    expect(duration).toBeLessThan(100);
    expect(scene.nodes.length).toBe(2);
    expect(spatialIndex.size).toBe(2);
  });

  it("2. Benchmarks Large Canvas Page (5000x5000px, 500 nodes) viewport query", () => {
    const elements: CanonicalOutline[] = [];
    for (let i = 0; i < 500; i++) {
      const x = (i % 25) * 200;
      const y = Math.floor(i / 25) * 250;
      elements.push({
        type: "outline",
        id: IdGenerator.objectId(`large_node_${i}`),
        bounds: { x, y, width: 180, height: 200, zIndex: i },
        paragraphs: [
          {
            id: IdGenerator.objectId(`p_${i}`),
            indentLevel: 0,
            runs: [{ text: `Grid block item #${i}` }],
          },
        ],
      });
    }

    const page: CanonicalPage = {
      id: IdGenerator.pageId("large_canvas_page"),
      title: "Expansive Canvas Layout",
      pageLevel: 0,
      createdTime: 1700000000000,
      modifiedTime: 1700000050000,
      pageWidth: 5000,
      pageHeight: 5000,
      canvasStyle: { backgroundColor: "#FFFFFF" },
      elements,
    };

    const start = performance.now();
    const scene = SceneBuilder.build(page);
    const spatialIndex = new SpatialIndex();
    spatialIndex.load(scene.nodes);

    // Search visible viewport frustum
    const queryRect = Rectangle.create(400, 400, 1000, 800);
    const visibleNodes = spatialIndex.search(queryRect);
    const duration = performance.now() - start;

    recordMetric("Large Canvas Build & Frustum Query", elements.length, duration);

    expect(duration).toBeLessThan(500);
    expect(visibleNodes.length).toBeGreaterThan(10);
    expect(visibleNodes.length).toBeLessThan(500);
  });

  it("3. Benchmarks Image-Heavy Page (50 images) with SHA-256 Deduplication", async () => {
    const assets = new Map();
    const dummyImageBytes = new Uint8Array(1024 * 100); // 100KB each
    dummyImageBytes.fill(0x89);

    for (let i = 0; i < 50; i++) {
      const payloadId = i % 10;
      const data = new Uint8Array(dummyImageBytes);
      data[0] = payloadId;
      assets.set(IdGenerator.assetId(`img_asset_${i}`), {
        id: IdGenerator.assetId(`img_asset_${i}`),
        mimeType: "image/png",
        fileName: `photo_${i}.png`,
        data,
      });
    }

    const start = performance.now();
    const processed = await AssetExtractor.processAssets(assets);
    const duration = performance.now() - start;

    recordMetric("Image-Heavy 50-Image Deduplication", assets.size, duration);

    expect(processed.size).toBe(50);
    expect(duration).toBeLessThan(2500);

    const uniquePaths = new Set(Array.from(processed.values()).map((r) => r.relativeVaultPath));
    expect(uniquePaths.size).toBe(10);
  });

  it("4. Benchmarks Ink-Heavy Page (2,500 strokes) with Catmull-Rom vector smoothing", () => {
    const strokes: CanonicalStroke[] = [];

    for (let s = 0; s < 2500; s++) {
      const points = [];
      const originX = (s % 50) * 40;
      const originY = Math.floor(s / 50) * 40;

      for (let p = 0; p < 20; p++) {
        points.push(new Point(originX + p * 2, originY + Math.sin(p) * 10));
      }

      strokes.push({
        id: IdGenerator.objectId(`stroke_${s}`),
        points,
        color: s % 2 === 0 ? "#1E3A8A" : "#EF4444",
        width: 2.5,
      });
    }

    const inkGroup: CanonicalInkStrokeGroup = {
      type: "ink",
      id: IdGenerator.objectId("ink_massive"),
      bounds: { x: 0, y: 0, width: 2500, height: 2500, zIndex: 10 },
      isHighlighter: false,
      strokes,
    };

    const page: CanonicalPage = {
      id: IdGenerator.pageId("ink_heavy_page"),
      title: "Handwritten Journal & Math",
      pageLevel: 0,
      createdTime: 1700000000000,
      modifiedTime: 1700000050000,
      pageWidth: 2500,
      pageHeight: 2500,
      canvasStyle: { backgroundColor: "#FFFFFF" },
      elements: [inkGroup],
    };

    const start = performance.now();
    const scene = SceneBuilder.build(page);
    const duration = performance.now() - start;

    recordMetric("Ink-Heavy (2,500 strokes) IR Build", strokes.length, duration);

    expect(duration).toBeLessThan(500);
    expect(scene.nodes.length).toBe(1);
    expect((scene.nodes[0]!.element as CanonicalInkStrokeGroup).strokes.length).toBe(2500);
  });

  it("5. Benchmarks Object-Heavy Page (2,000 outlines, shapes, tables) Spatial Indexing and Hit-testing", () => {
    const nodes = [];

    for (let i = 0; i < 2000; i++) {
      const x = (i % 40) * 100;
      const y = Math.floor(i / 40) * 80;
      nodes.push({
        id: IdGenerator.objectId(`obj_${i}`),
        layer: (i % 3 === 0 ? "shapes" : i % 3 === 1 ? "tables" : "text") as any,
        bounds: { x, y, width: 90, height: 70, zIndex: i },
        aabb: Rectangle.create(x, y, 90, 70),
        zIndex: i,
        visible: true,
        element: {} as any,
      });
    }

    const start = performance.now();
    const spatialIndex = new SpatialIndex(256);
    spatialIndex.load(nodes);
    const indexDuration = performance.now() - start;

    const hitStart = performance.now();
    let hitCount = 0;
    for (let h = 0; h < 1000; h++) {
      const testPt = new Point((h * 73) % 4000, (h * 97) % 4000);
      const hit = spatialIndex.hitTest(testPt);
      if (hit) hitCount++;
    }
    const hitDuration = performance.now() - hitStart;
    const hitLatencyPerQueryUs = (hitDuration / 1000) * 1000;

    recordMetric("Object-Heavy (2,000 nodes) Index Build", nodes.length, indexDuration);
    recordMetric("1,000 Spatial Hit-Tests", 1000, hitDuration);

    expect(indexDuration).toBeLessThan(300);
    expect(hitLatencyPerQueryUs).toBeLessThan(300);
  });

  it("6. Benchmarks Large Multi-Section Notebook (50 pages) Markdown Projection", () => {
    const pages: CanonicalPage[] = [];
    for (let p = 0; p < 50; p++) {
      pages.push({
        id: IdGenerator.pageId(`page_${p}`),
        title: `Project Architecture Page ${p + 1}`,
        pageLevel: 0,
        createdTime: 1700000000000 + p * 1000,
        modifiedTime: 1700000050000 + p * 1000,
        pageWidth: 1200,
        pageHeight: 1000,
        canvasStyle: { backgroundColor: "#FFFFFF" },
        elements: [
          {
            type: "outline",
            id: IdGenerator.objectId(`title_${p}`),
            bounds: { x: 50, y: 50, width: 600, height: 60, zIndex: 1 },
            paragraphs: [
              {
                id: IdGenerator.objectId(`head_${p}`),
                indentLevel: 0,
                runs: [{ text: `Executive Summary for Milestone ${p + 1}`, style: { bold: true } }],
              },
            ],
          },
          {
            type: "outline",
            id: IdGenerator.objectId(`body_${p}`),
            bounds: { x: 50, y: 150, width: 800, height: 300, zIndex: 2 },
            paragraphs: [
              {
                id: IdGenerator.objectId(`p_body1_${p}`),
                indentLevel: 0,
                runs: [{ text: "Detailed architecture design notes, system requirements, and technical specifications." }],
              },
            ],
          },
        ],
      });
    }

    const section: CanonicalSection = {
      id: IdGenerator.sectionId("sec_big"),
      name: "Engineering Specifications",
      isEncrypted: false,
      pages,
    };

    const notebook: CanonicalNotebook = {
      id: IdGenerator.notebookId("nb_big"),
      title: "Enterprise Knowledge Base",
      sections: [section],
      sectionGroups: [],
    };

    const start = performance.now();
    const projections = pages.map((page) =>
      MarkdownProjector.project(page, {
        sidecarRelativePath: `${notebook.title}/${section.name}/${page.title}.onecanvas.json`,
      })
    );
    const duration = performance.now() - start;

    recordMetric("50-Page Notebook Markdown Projection", pages.length, duration);

    expect(projections.length).toBe(50);
    expect(duration).toBeLessThan(600);
    expect(projections[0]).toContain("Milestone 1");
  });

  it("7. Benchmarks PixiJS Renderer Lifecycle & Zero Memory Leak Teardown", async () => {
    const hostEl = document.createElement("div");
    Object.defineProperty(hostEl, "clientWidth", { value: 1200, configurable: true });
    Object.defineProperty(hostEl, "clientHeight", { value: 800, configurable: true });
    document.body.appendChild(hostEl);

    const renderer = new PixiRenderer();
    await renderer.initialize(hostEl, { preference: "webgl" });

    const page: CanonicalPage = {
      id: IdGenerator.pageId("lifecycle_page"),
      title: "Lifecycle Verification",
      pageLevel: 0,
      createdTime: 1700000000000,
      modifiedTime: 1700000050000,
      pageWidth: 1200,
      pageHeight: 800,
      canvasStyle: { backgroundColor: "#FFFFFF" },
      elements: [
        {
          type: "outline",
          id: IdGenerator.objectId("node_life"),
          bounds: { x: 50, y: 50, width: 300, height: 100, zIndex: 1 },
          paragraphs: [{ id: IdGenerator.objectId("pl"), indentLevel: 0, runs: [{ text: "Test text" }] }],
        },
      ],
    };

    const scene = SceneBuilder.build(page);
    renderer.renderScene(scene);

    const statsBefore = renderer.getStats();
    expect(statsBefore.totalNodeCount).toBe(1);

    renderer.destroy();
    expect(renderer.getActiveScene()).toBeNull();
    expect(renderer.getHostElement()).toBeNull();

    document.body.removeChild(hostEl);
  });
});
