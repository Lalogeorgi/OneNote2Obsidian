import { ItemView, WorkspaceLeaf } from "obsidian";
import { Point, Point2D } from "../geometry/Point";
import { CanonicalNotebook } from "../model/CanonicalNotebook";
import { CanonicalPage } from "../model/CanonicalPage";
import { PageId } from "../model/Ids";
import { PageScene } from "../pagescene/PageScene";
import { SceneBuilder } from "../pagescene/SceneBuilder";
import { InteractionTool } from "../renderer/interaction/SpatialInteractionController";
import { PixiRenderer } from "../renderer/pixi/PixiRenderer";
import { logger } from "../diagnostics/Logger";
import { DiagnosticEntry } from "../diagnostics/DiagnosticTypes";
import { PageContextManager } from "../context/PageContextManager";
import { HybridViewCoordinator } from "./HybridViewCoordinator";

export const VIEW_TYPE_ONENOTE_SPATIAL = "onenote-spatial-view";

export class OneNoteItemView extends ItemView {
  private renderer: PixiRenderer | null = null;
  private canvasHostEl: HTMLElement | null = null;
  private toolbarEl: HTMLElement | null = null;
  private navBarEl: HTMLElement | null = null;
  private hudEl: HTMLElement | null = null;
  private diagnosticsDrawerEl: HTMLElement | null = null;
  private loadingOverlayEl: HTMLElement | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private themeObserver: MutationObserver | null = null;

  // Active Document State
  private activeNotebook: CanonicalNotebook | null = null;
  private activePage: CanonicalPage | null = null;
  private allPages: CanonicalPage[] = [];
  private activePageIndex = 0;

  // UI State
  private isDarkMode = false;
  private isDiagnosticsOpen = false;
  private cursorScenePos: Point2D = new Point(0, 0);

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  public getViewType(): string {
    return VIEW_TYPE_ONENOTE_SPATIAL;
  }

  public getDisplayText(): string {
    if (this.activePage) {
      return `OneNote: ${this.activePage.title || "Untitled"}`;
    }
    return "OneNote Spatial Canvas";
  }

  public getIcon(): string {
    return "layout-dashboard";
  }

  public async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("onenote-spatial-view-root");

    // Detect Obsidian Dark/Light mode
    this.isDarkMode = document.body.classList.contains("theme-dark");

    // 1. Create Navigation Header Bar
    this.createNavBar(container);

    // 2. Create Canvas Host DOM container
    this.canvasHostEl = container.createDiv({ cls: "onenote-canvas-host-wrapper" });

    // 3. Initialize PixiJS Renderer
    this.renderer = new PixiRenderer();
    await this.renderer.initialize(this.canvasHostEl, {
      preference: "webgl",
      enableDomOverlay: true,
      devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
    });

    // Wire renderer callbacks
    this.renderer.onViewportChange = () => {
      this.updateHud();
    };

    this.renderer.onCursorSceneMove = (scenePt) => {
      this.cursorScenePos = scenePt;
      this.updateHud();
    };

    this.renderer.onSelectionChange = (nodes) => {
      this.updateToolbarSelectionState(nodes.length > 0);
      PageContextManager.getInstance().setSelectedNode(nodes.length > 0 ? nodes[0]!.id : null);
    };

    // 4. Create Floating Spatial Toolbar & HUD Panel
    this.createFloatingToolbar(container);
    this.createHud(container);
    this.createDiagnosticsDrawer(container);
    this.createLoadingOverlay(container);

    // 5. Setup Resize Observer
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0 && this.renderer) {
            this.renderer.resize(width, height);
            this.updateHud();
          }
        }
      });
      this.resizeObserver.observe(this.canvasHostEl);
    }

    // 6. Setup Obsidian Theme Change Observer
    if (typeof MutationObserver !== "undefined") {
      this.themeObserver = new MutationObserver(() => {
        const isDark = document.body.classList.contains("theme-dark");
        if (isDark !== this.isDarkMode) {
          this.isDarkMode = isDark;
          this.refreshCurrentSceneTheme();
        }
      });
      this.themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    // 7. Render Default Initial Sample Page
    this.loadSampleDemoNotebook();
  }

  public async onClose(): Promise<void> {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }

    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }

    this.canvasHostEl = null;
    this.toolbarEl = null;
    this.navBarEl = null;
    this.hudEl = null;
    this.diagnosticsDrawerEl = null;
    this.loadingOverlayEl = null;
    this.contentEl.empty();
  }

  /**
   * Load and display a full CanonicalNotebook.
   */
  public loadNotebook(notebook: CanonicalNotebook): void {
    this.activeNotebook = notebook;
    this.allPages = [];

    // Collect all pages across root sections and nested section groups
    for (const sec of notebook.sections) {
      for (const p of sec.pages) {
        this.allPages.push(p);
      }
    }
    for (const group of notebook.sectionGroups) {
      for (const sec of group.sections) {
        for (const p of sec.pages) {
          this.allPages.push(p);
        }
      }
    }

    this.updateNavBar();

    if (this.allPages.length > 0) {
      this.switchPageByIndex(0);
    }
  }

  /**
   * Load a single CanonicalPage into the spatial viewer.
   */
  public loadPage(page: CanonicalPage): void {
    this.activePage = page;
    PageContextManager.getInstance().setActivePage(page.id);
    this.showLoading(true);

    try {
      const scene = this.compilePageScene(page);
      if (this.renderer) {
        this.renderer.renderScene(scene);
        this.renderer.fitToPage({ padding: 60 });
      }
      this.updateNavBar();
      this.updateHud();
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Switch active page by ID.
   */
  public loadPageById(pageId: PageId): void {
    const idx = this.allPages.findIndex((p) => p.id === pageId);
    if (idx !== -1) {
      this.switchPageByIndex(idx);
    }
  }

  private switchPageByIndex(index: number): void {
    if (index < 0 || index >= this.allPages.length) return;
    this.activePageIndex = index;
    const page = this.allPages[index]!;
    this.loadPage(page);
  }

  private compilePageScene(page: CanonicalPage): PageScene {
    // Theme-adjusted background style
    const baseScene = SceneBuilder.build(page);

    if (this.isDarkMode) {
      return {
        ...baseScene,
        canvasStyle: {
          ...baseScene.canvasStyle,
          backgroundColor: "#1E1E1E",
          ruleLines: baseScene.canvasStyle.ruleLines
            ? {
                ...baseScene.canvasStyle.ruleLines,
                color: "#374151",
              }
            : undefined,
        },
      };
    }

    return baseScene;
  }

  private refreshCurrentSceneTheme(): void {
    if (this.activePage && this.renderer) {
      const scene = this.compilePageScene(this.activePage);
      this.renderer.renderScene(scene);
    }
  }

  private createNavBar(container: HTMLElement): void {
    this.navBarEl = container.createDiv({ cls: "onenote-nav-bar" });
    this.updateNavBar();
  }

  private updateNavBar(): void {
    if (!this.navBarEl) return;
    this.navBarEl.empty();

    const titleContainer = this.navBarEl.createDiv({ cls: "onenote-nav-title-group" });

    // Breadcrumbs & Notebook Badge
    const nbTitle = this.activeNotebook?.title || "OneNote Notebook";
    titleContainer.createEl("span", { cls: "onenote-nav-nb-badge", text: nbTitle });

    // Source Provenance Indicator
    titleContainer.createEl("span", {
      cls: "onenote-nav-provenance-pill",
      text: "📦 OneNote 100% Fidelity",
    });

    // Prev / Next Page Buttons
    const navButtons = this.navBarEl.createDiv({ cls: "onenote-nav-buttons" });

    const prevBtn = navButtons.createEl("button", { cls: "onenote-btn-icon", text: "‹" });
    prevBtn.title = "Previous Page";
    prevBtn.disabled = this.activePageIndex <= 0;
    prevBtn.addEventListener("click", () => this.switchPageByIndex(this.activePageIndex - 1));

    // Page Selector Dropdown
    const select = navButtons.createEl("select", { cls: "onenote-nav-page-select" });
    if (this.allPages.length === 0 && this.activePage) {
      const opt = select.createEl("option", { text: this.activePage.title || "Untitled Page" });
      opt.value = "0";
    } else {
      this.allPages.forEach((p, idx) => {
        const opt = select.createEl("option", { text: `${idx + 1}. ${p.title || "Untitled"}` });
        opt.value = `${idx}`;
        if (idx === this.activePageIndex) opt.selected = true;
      });
    }

    select.addEventListener("change", () => {
      this.switchPageByIndex(parseInt(select.value, 10));
    });

    const nextBtn = navButtons.createEl("button", { cls: "onenote-btn-icon", text: "›" });
    nextBtn.title = "Next Page";
    nextBtn.disabled = this.activePageIndex >= this.allPages.length - 1;
    nextBtn.addEventListener("click", () => this.switchPageByIndex(this.activePageIndex + 1));
  }

  private createFloatingToolbar(container: HTMLElement): void {
    this.toolbarEl = container.createDiv({ cls: "onenote-floating-toolbar" });

    // 1. Tool selection buttons
    const tools: Array<{ id: InteractionTool; label: string; title: string }> = [
      { id: "select", label: "↖ Select", title: "Select & Transform Objects" },
      { id: "pan", label: "✋ Pan", title: "Pan Canvas" },
      { id: "pen", label: "🖊️ Pen", title: "Draw Freehand Ink" },
      { id: "highlighter", label: "🖍️ High", title: "Highlight Content" },
      { id: "eraser", label: "🧹 Erase", title: "Erase Ink Strokes" },
      { id: "lasso", label: "➰ Lasso", title: "Lasso / Marquee Select" },
    ];

    const toolButtons = new Map<InteractionTool, HTMLElement>();

    for (const t of tools) {
      const btn = this.toolbarEl.createEl("button", {
        cls: `onenote-tool-btn ${t.id === "select" ? "is-active" : ""}`,
        text: t.label,
      });
      btn.title = t.title;
      btn.addEventListener("click", () => {
        this.setTool(t.id);
        toolButtons.forEach((b) => b.removeClass("is-active"));
        btn.addClass("is-active");
      });
      toolButtons.set(t.id, btn);
    }

    // Divider
    this.toolbarEl.createDiv({ cls: "onenote-toolbar-divider" });

    // 2. Edit Action Controls (Undo / Redo / Duplicate / Delete / Z-Order)
    const undoBtn = this.toolbarEl.createEl("button", { cls: "onenote-btn-icon", text: "↩" });
    undoBtn.title = "Undo (Ctrl+Z)";
    undoBtn.addEventListener("click", () => this.renderer?.undo());

    const redoBtn = this.toolbarEl.createEl("button", { cls: "onenote-btn-icon", text: "↪" });
    redoBtn.title = "Redo (Ctrl+Y)";
    redoBtn.addEventListener("click", () => this.renderer?.redo());

    const dupBtn = this.toolbarEl.createEl("button", { cls: "onenote-btn-icon", text: "⧉" });
    dupBtn.title = "Duplicate Selection (Ctrl+D)";
    dupBtn.addEventListener("click", () => this.renderer?.duplicateSelection());

    const delBtn = this.toolbarEl.createEl("button", { cls: "onenote-btn-icon", text: "🗑️" });
    delBtn.title = "Delete Selection (Delete)";
    delBtn.addEventListener("click", () => this.renderer?.deleteSelection());

    const frontBtn = this.toolbarEl.createEl("button", { cls: "onenote-btn-icon", text: "⇈" });
    frontBtn.title = "Bring to Front";
    frontBtn.addEventListener("click", () => this.renderer?.adjustZOrder("bringToFront"));

    const backBtn = this.toolbarEl.createEl("button", { cls: "onenote-btn-icon", text: "⇊" });
    backBtn.title = "Send to Back";
    backBtn.addEventListener("click", () => this.renderer?.adjustZOrder("sendToBack"));

    // Divider
    this.toolbarEl.createDiv({ cls: "onenote-toolbar-divider" });

    // 3. Zoom Controls
    const zoomInBtn = this.toolbarEl.createEl("button", { cls: "onenote-btn-icon", text: "+" });
    zoomInBtn.title = "Zoom In";
    zoomInBtn.addEventListener("click", () => this.zoomBy(1.2));

    const zoomOutBtn = this.toolbarEl.createEl("button", { cls: "onenote-btn-icon", text: "−" });
    zoomOutBtn.title = "Zoom Out";
    zoomOutBtn.addEventListener("click", () => this.zoomBy(0.8));

    const fitBtn = this.toolbarEl.createEl("button", { cls: "onenote-btn", text: "⛶ Fit" });
    fitBtn.title = "Fit Entire Page (Fit to Window)";
    fitBtn.addEventListener("click", () => {
      if (this.renderer) this.renderer.fitToPage({ padding: 60 });
    });

    const resetBtn = this.toolbarEl.createEl("button", { cls: "onenote-btn", text: "1:1" });
    resetBtn.title = "Reset Zoom to 100%";
    resetBtn.addEventListener("click", () => {
      if (this.renderer) this.renderer.setViewport({ x: 60, y: 60, scale: 1.0 });
    });

    const zoomSelBtn = this.toolbarEl.createEl("button", {
      cls: "onenote-btn onenote-btn-zoom-sel",
      text: "🔍 Selection",
    });
    zoomSelBtn.title = "Zoom to Selected Elements";
    zoomSelBtn.addEventListener("click", () => {
      if (this.renderer) this.renderer.zoomToSelection({ padding: 60 });
    });

    // Divider
    this.toolbarEl.createDiv({ cls: "onenote-toolbar-divider" });

    // 4. Hybrid View Switching Buttons
    const noteBtn = this.toolbarEl.createEl("button", {
      cls: "onenote-btn onenote-btn-note",
      text: "📄 Note",
    });
    noteBtn.title = "Open Semantic Markdown Note for this page";
    noteBtn.addEventListener("click", () => {
      new HybridViewCoordinator(this.app).openMarkdownView(this.activePage?.id);
    });

    const splitBtn = this.toolbarEl.createEl("button", {
      cls: "onenote-btn onenote-btn-split",
      text: "◫ Split",
    });
    splitBtn.title = "Open Side-by-Side Split View (Spatial + Markdown)";
    splitBtn.addEventListener("click", () => {
      new HybridViewCoordinator(this.app).openSplitView(this.activePage?.id);
    });

    // Divider
    this.toolbarEl.createDiv({ cls: "onenote-toolbar-divider" });

    // 5. Diagnostics Toggle
    const diagBtn = this.toolbarEl.createEl("button", { cls: "onenote-btn onenote-btn-diag", text: "⚡ Logs" });
    diagBtn.title = "Toggle Diagnostics & Issues Inspector";
    diagBtn.addEventListener("click", () => this.toggleDiagnostics());
  }

  private setTool(tool: InteractionTool): void {
    if (this.renderer) {
      this.renderer.setTool(tool);
    }
  }

  private zoomBy(factor: number): void {
    if (!this.canvasHostEl || !this.renderer) return;
    const rect = this.canvasHostEl.getBoundingClientRect();
    const center = new Point(rect.width / 2, rect.height / 2);
    this.renderer.zoomAt(center, factor);
  }

  private updateToolbarSelectionState(hasSelection: boolean): void {
    if (!this.toolbarEl) return;
    const zoomSelBtn = this.toolbarEl.querySelector(".onenote-btn-zoom-sel") as HTMLButtonElement;
    if (zoomSelBtn) {
      zoomSelBtn.disabled = !hasSelection;
      zoomSelBtn.style.opacity = hasSelection ? "1.0" : "0.5";
    }
  }

  private createHud(container: HTMLElement): void {
    this.hudEl = container.createDiv({ cls: "onenote-hud-panel" });
    this.updateHud();
  }

  private updateHud(): void {
    if (!this.hudEl || !this.renderer) return;
    const stats = this.renderer.getStats();
    const transform = this.renderer.getTransform();
    const zoomPct = Math.round(transform.scale * 100);

    const x = Math.round(this.cursorScenePos.x);
    const y = Math.round(this.cursorScenePos.y);

    this.hudEl.setText(
      `Zoom: ${zoomPct}% | Nodes: ${stats.visibleNodeCount}/${stats.totalNodeCount} | FPS: ${stats.fps} | (X: ${x}, Y: ${y})`
    );
  }

  private createDiagnosticsDrawer(container: HTMLElement): void {
    this.diagnosticsDrawerEl = container.createDiv({ cls: "onenote-diagnostics-drawer is-hidden" });
  }

  private toggleDiagnostics(): void {
    if (!this.diagnosticsDrawerEl) return;
    this.isDiagnosticsOpen = !this.isDiagnosticsOpen;

    if (this.isDiagnosticsOpen) {
      this.renderDiagnosticsContent();
      this.diagnosticsDrawerEl.removeClass("is-hidden");
    } else {
      this.diagnosticsDrawerEl.addClass("is-hidden");
    }
  }

  private renderDiagnosticsContent(): void {
    if (!this.diagnosticsDrawerEl || !this.renderer) return;
    this.diagnosticsDrawerEl.empty();

    const header = this.diagnosticsDrawerEl.createDiv({ cls: "onenote-diag-header" });
    header.createEl("h4", { text: "⚡ Spatial Engine Diagnostics & Telemetry" });

    const closeBtn = header.createEl("button", { cls: "onenote-btn-icon", text: "✕" });
    closeBtn.addEventListener("click", () => this.toggleDiagnostics());

    const stats = this.renderer.getStats();
    const statsList = this.diagnosticsDrawerEl.createDiv({ cls: "onenote-diag-stats" });
    statsList.createEl("div", { text: `• Total Nodes: ${stats.totalNodeCount}` });
    statsList.createEl("div", { text: `• Visible Nodes: ${stats.visibleNodeCount}` });
    statsList.createEl("div", { text: `• Culled Nodes: ${stats.culledNodeCount ?? 0}` });
    statsList.createEl("div", { text: `• Cached Textures: ${stats.textureCount}` });
    statsList.createEl("div", { text: `• Sync Duration: ${stats.syncDurationMs ?? 0} ms` });
    statsList.createEl("div", { text: `• Hit-Test Latency: ${stats.hitTestLatencyMs ?? 0} ms` });
    statsList.createEl("div", { text: `• Render FPS: ${stats.fps} (${stats.frameTimeMs} ms)` });

    // Show recent structured logs
    const logSection = this.diagnosticsDrawerEl.createDiv({ cls: "onenote-diag-logs" });
    logSection.createEl("h5", { text: "Recent Structured Logs" });

    const entries: DiagnosticEntry[] = (logger as unknown as { entries?: DiagnosticEntry[] }).entries || [];
    if (entries.length === 0) {
      logSection.createEl("div", { cls: "onenote-log-empty", text: "No errors or warnings recorded." });
    } else {
      for (const entry of entries.slice(-10)) {
        const item = logSection.createDiv({ cls: `onenote-log-item is-${entry.severity}` });
        item.createEl("span", { cls: "onenote-log-badge", text: entry.code });
        item.createEl("span", { cls: "onenote-log-msg", text: entry.message });
      }
    }
  }

  private createLoadingOverlay(container: HTMLElement): void {
    this.loadingOverlayEl = container.createDiv({ cls: "onenote-loading-overlay is-hidden" });
    this.loadingOverlayEl.createDiv({ cls: "onenote-spinner" });
    this.loadingOverlayEl.createDiv({ cls: "onenote-loading-text", text: "Loading spatial page..." });
  }

  private showLoading(show: boolean): void {
    if (!this.loadingOverlayEl) return;
    if (show) {
      this.loadingOverlayEl.removeClass("is-hidden");
    } else {
      this.loadingOverlayEl.addClass("is-hidden");
    }
  }

  /**
   * Demo Scene with overlapping photos, handwritten ink annotations, arrows, and tables.
   */
  private loadSampleDemoNotebook(): void {
    const samplePage1: CanonicalPage = {
      id: "page_sample_01" as PageId,
      title: "Quarterly Strategy & Spatial Layout",
      pageLevel: 0,
      createdTime: Date.now() - 3600000,
      modifiedTime: Date.now(),
      pageWidth: 1600,
      pageHeight: 2000,
      canvasStyle: {
        backgroundColor: "#FCFCFA",
        ruleLines: {
          kind: "college",
          color: "#E5E7EB",
          spacing: 28,
          marginX: 96,
        },
      },
      elements: [
        // 1. Heading Text
        {
          type: "outline",
          id: "outline_h1" as any,
          bounds: { x: 120, y: 80, width: 800, height: 120, zIndex: 1 },
          paragraphs: [
            {
              id: "p1" as any,
              indentLevel: 0,
              runs: [
                {
                  text: "Quarterly Spatial Architecture",
                  style: { fontSize: 24, bold: true, fontColor: "#111827" },
                },
              ],
            },
            {
              id: "p2" as any,
              indentLevel: 0,
              runs: [
                {
                  text: "Freeform spatial document canvas preserving exact positions, layering, and annotations.",
                  style: { fontSize: 13, fontColor: "#4B5563" },
                },
              ],
            },
          ],
        },

        // 2. Pasted Photograph (Simulated Image)
        {
          type: "image",
          id: "img_photo_01" as any,
          bounds: { x: 120, y: 220, width: 500, height: 320, zIndex: 5 },
          assetId: "asset_photo_01" as any,
          mimeType: "image/png",
        },

        // 3. Handwritten Ink Annotations Over the Photograph
        {
          type: "ink",
          id: "ink_annotation_over_photo" as any,
          bounds: { x: 140, y: 240, width: 440, height: 260, zIndex: 25 },
          isHighlighter: false,
          strokes: [
            {
              id: "stroke_circle_focus" as any,
              color: "#EF4444", // Red pen circled over image
              width: 3.5,
              points: [
                { x: 180, y: 300 },
                { x: 260, y: 270 },
                { x: 340, y: 310 },
                { x: 310, y: 400 },
                { x: 200, y: 420 },
                { x: 180, y: 300 },
              ],
            },
            {
              id: "stroke_arrow_callout" as any,
              color: "#EF4444",
              width: 3,
              points: [
                { x: 340, y: 310 },
                { x: 440, y: 260 },
              ],
            },
          ],
        },

        // 4. Directional Arrow Shape
        {
          type: "shape",
          id: "arrow_pointer" as any,
          bounds: { x: 640, y: 320, width: 120, height: 80, zIndex: 10 },
          shapeKind: "arrow",
          strokeColor: "#2563EB",
          strokeWidth: 3,
        },

        // 5. Annotated Box Callout with Text
        {
          type: "shape",
          id: "callout_box" as any,
          bounds: { x: 780, y: 260, width: 420, height: 220, zIndex: 8 },
          shapeKind: "rectangle",
          fillColor: "#EFF6FF",
          strokeColor: "#3B82F6",
          strokeWidth: 2,
        },
        {
          type: "outline",
          id: "callout_text" as any,
          bounds: { x: 800, y: 280, width: 380, height: 180, zIndex: 15 },
          paragraphs: [
            {
              id: "p3" as any,
              indentLevel: 0,
              runs: [
                {
                  text: "Key Architectural Highlights",
                  style: { fontSize: 14, bold: true, fontColor: "#1E40AF" },
                },
              ],
            },
            {
              id: "p4" as any,
              indentLevel: 0,
              bulletType: "checkbox",
              isTaskChecked: true,
              runs: [{ text: "Infinite 2.5D spatial canvas", style: { fontSize: 12 } }],
            },
            {
              id: "p5" as any,
              indentLevel: 0,
              bulletType: "checkbox",
              isTaskChecked: true,
              runs: [{ text: "Ink rendered on top of images", style: { fontSize: 12 } }],
            },
            {
              id: "p6" as any,
              indentLevel: 0,
              bulletType: "checkbox",
              isTaskChecked: true,
              runs: [{ text: "Interactive selection & zooming", style: { fontSize: 12 } }],
            },
          ],
        },

        // 6. Data Table
        {
          type: "table",
          id: "table_metrics" as any,
          bounds: { x: 120, y: 580, width: 680, height: 180, zIndex: 6 },
          columns: [{ width: 220 }, { width: 230 }, { width: 230 }],
          rows: [
            {
              id: "r1" as any,
              cells: [
                { id: "c1" as any, elements: [] },
                { id: "c2" as any, elements: [] },
                { id: "c3" as any, elements: [] },
              ],
            },
            {
              id: "r2" as any,
              cells: [
                { id: "c4" as any, elements: [] },
                { id: "c5" as any, elements: [] },
                { id: "c6" as any, elements: [] },
              ],
            },
          ],
        },

        // 7. File Attachment Badge
        {
          type: "attachment",
          id: "att_doc" as any,
          bounds: { x: 840, y: 580, width: 260, height: 48, zIndex: 10 },
          assetId: "asset_spec_pdf" as any,
          fileName: "OneNote_Specification_v1.pdf",
          fileSizeBytes: 2048576,
        },
      ],
    };

    const samplePage2: CanonicalPage = {
      id: "page_sample_02" as PageId,
      title: "Component Breakdown & Diagrams",
      pageLevel: 0,
      createdTime: Date.now() - 1800000,
      modifiedTime: Date.now(),
      pageWidth: 1400,
      pageHeight: 1600,
      canvasStyle: {
        backgroundColor: "#FFFFFF",
        ruleLines: { kind: "small-grid", color: "#F3F4F6", spacing: 20 },
      },
      elements: [
        {
          type: "outline",
          id: "outline_p2" as any,
          bounds: { x: 100, y: 100, width: 600, height: 100, zIndex: 1 },
          paragraphs: [
            {
              id: "p2_1" as any,
              indentLevel: 0,
              runs: [{ text: "Component Architecture", style: { fontSize: 20, bold: true } }],
            },
          ],
        },
        {
          type: "shape",
          id: "shape_rect1" as any,
          bounds: { x: 100, y: 220, width: 260, height: 140, zIndex: 2 },
          shapeKind: "rectangle",
          fillColor: "#F9FAFB",
          strokeColor: "#10B981",
          strokeWidth: 2,
        },
      ],
    };

    const demoNotebook: CanonicalNotebook = {
      id: "nb_demo_01" as any,
      title: "OneNote Project Notebook",
      sectionGroups: [],
      sections: [
        {
          id: "sec_demo_01" as any,
          name: "General Strategy",
          isEncrypted: false,
          pages: [samplePage1, samplePage2],
        },
      ],
    };

    this.loadNotebook(demoNotebook);
  }
}
