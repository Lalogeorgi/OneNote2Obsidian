import { describe, expect, it, vi } from "vitest";
import { Application, Container } from "pixi.js";
import { WorkspaceLeaf } from "obsidian";
import { CanonicalNotebook } from "../src/model/CanonicalNotebook";
import { CanonicalPage } from "../src/model/CanonicalPage";
import { IdGenerator } from "../src/model/Ids";
import {
  OneNoteItemView,
  VIEW_TYPE_ONENOTE_SPATIAL,
} from "../src/obsidian/OneNoteItemView";

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

describe("Obsidian Custom OneNoteItemView Lifecycle & Navigation", () => {
  const createMockLeaf = (): WorkspaceLeaf => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    return {
      view: null as any,
      containerEl: container,
      open: async () => {},
    } as unknown as WorkspaceLeaf;
  };

  const createMockNotebook = (): CanonicalNotebook => {
    const page1: CanonicalPage = {
      id: IdGenerator.pageId("p1"),
      title: "Page 1: Overview",
      pageLevel: 0,
      createdTime: 1724218800000,
      modifiedTime: 1724222400000,
      canvasStyle: { backgroundColor: "#FFFFFF" },
      elements: [
        {
          type: "outline",
          id: IdGenerator.objectId("out1"),
          bounds: { x: 100, y: 100, width: 400, height: 80, zIndex: 1 },
          paragraphs: [{ id: IdGenerator.objectId("p1"), indentLevel: 0, runs: [{ text: "Hello Page 1" }] }],
        },
      ],
    };

    const page2: CanonicalPage = {
      id: IdGenerator.pageId("p2"),
      title: "Page 2: Architecture",
      pageLevel: 0,
      createdTime: 1724218800000,
      modifiedTime: 1724222400000,
      canvasStyle: { backgroundColor: "#FFFFFF" },
      elements: [
        {
          type: "outline",
          id: IdGenerator.objectId("out2"),
          bounds: { x: 100, y: 100, width: 400, height: 80, zIndex: 1 },
          paragraphs: [{ id: IdGenerator.objectId("p2"), indentLevel: 0, runs: [{ text: "Hello Page 2" }] }],
        },
      ],
    };

    return {
      id: IdGenerator.notebookId("nb1"),
      title: "Engineering Notebook",
      sectionGroups: [],
      sections: [
        {
          id: IdGenerator.sectionId("sec1"),
          name: "Sprint Notes",
          isEncrypted: false,
          pages: [page1, page2],
        },
      ],
    };
  };

  it("initializes ItemView, registers view type, and mounts toolbar & HUD", async () => {
    const leaf = createMockLeaf();
    const view = new OneNoteItemView(leaf);

    expect(view.getViewType()).toBe(VIEW_TYPE_ONENOTE_SPATIAL);
    expect(view.getIcon()).toBe("layout-dashboard");

    await view.onOpen();

    const root = view.containerEl.querySelector(".onenote-spatial-view-root");
    expect(root).not.toBeNull();

    // Verify Canvas Host occupies root
    const canvasHost = view.containerEl.querySelector(".onenote-canvas-host-wrapper");
    expect(canvasHost).not.toBeNull();

    // Verify Empty State Prompt is present initially
    const emptyState = view.containerEl.querySelector(".onenote-empty-state");
    expect(emptyState).not.toBeNull();
    expect(emptyState?.classList.contains("is-hidden")).toBe(false);

    // Verify Floating Toolbar (Select, Pan, Zoom)
    const toolbar = view.containerEl.querySelector(".onenote-floating-toolbar");
    expect(toolbar).not.toBeNull();

    // Verify HUD
    const hud = view.containerEl.querySelector(".onenote-hud-panel");
    expect(hud).not.toBeNull();

    await view.onClose();
    if (view.containerEl.parentElement) {
      document.body.removeChild(view.containerEl);
    }
  });

  it("loads a page into spatial view and updates display text and empty state", async () => {
    const leaf = createMockLeaf();
    const view = new OneNoteItemView(leaf);
    await view.onOpen();

    const notebook = createMockNotebook();
    const page1 = notebook.sections[0]!.pages[0]!;
    const page2 = notebook.sections[0]!.pages[1]!;

    view.loadPage(page1);

    // Verify Display text reflects active page
    expect(view.getDisplayText()).toContain("Page 1: Overview");

    // Empty state should be hidden after loading page
    const emptyState = view.containerEl.querySelector(".onenote-empty-state");
    expect(emptyState?.classList.contains("is-hidden")).toBe(true);

    // Load page 2
    view.loadPage(page2);
    expect(view.getDisplayText()).toContain("Page 2: Architecture");

    await view.onClose();
    if (view.containerEl.parentElement) {
      document.body.removeChild(view.containerEl);
    }
  });

  it("tears down observers and WebGL renderer on close without leaking DOM nodes", async () => {
    const leaf = createMockLeaf();
    const view = new OneNoteItemView(leaf);
    await view.onOpen();

    await view.onClose();
    expect(view.containerEl.querySelector(".onenote-canvas-host-wrapper")).toBeNull();
    if (view.containerEl.parentElement) {
      document.body.removeChild(view.containerEl);
    }
  });
});
