import { ItemView, Notice, TFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import { Point, Point2D } from "../geometry/Point";
import { CanonicalNotebook } from "../model/CanonicalNotebook";
import { CanonicalPage } from "../model/CanonicalPage";
import { PageId } from "../model/Ids";
import { StickyNoteUtils } from "../model/StickyNoteUtils";
import { PageScene } from "../pagescene/PageScene";
import { SceneBuilder } from "../pagescene/SceneBuilder";
import { CanvasScrollbars } from "../renderer/interaction/CanvasScrollbars";
import { PixiRenderer } from "../renderer/pixi/PixiRenderer";
import { PageContextManager } from "../context/PageContextManager";
import { FloatingStickyNoteManager } from "./FloatingStickyNoteManager";
import { StickyNotesHubModal } from "./StickyNotesHubModal";
import { OneNoteRibbon } from "./ribbon/OneNoteRibbon";
import { PagePropertiesModal } from "./modal/PagePropertiesModal";
import { CANVAS_STYLE_DEFAULTS, STICKY_NOTE_METRICS } from "../constants/StickyNoteConstants";

export const VIEW_TYPE_ONENOTE_SPATIAL = "onenote-spatial-view";

export class OneNoteItemView extends ItemView {
  public ribbon: OneNoteRibbon | null = null;
  public scrollbars: CanvasScrollbars | null = null;
  private renderer: PixiRenderer | null = null;
  private canvasHostEl: HTMLElement | null = null;
  private hudEl: HTMLElement | null = null;
  private emptyStateEl: HTMLElement | null = null;
  private loadingOverlayEl: HTMLElement | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private themeObserver: MutationObserver | null = null;
  private unsubscribePageContext: (() => void) | null = null;

  // Active Document State (One Page = One File Model)
  private activePage: CanonicalPage | null = null;

  // UI State
  private isDarkMode = false;
  private hasUserPannedOrZoomed = false;
  public cursorScenePos: Point2D = new Point(0, 0);

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  public getViewType(): string {
    return VIEW_TYPE_ONENOTE_SPATIAL;
  }

  public getDisplayText(): string {
    if (this.activePage) {
      return this.activePage.title || "Canvas";
    }
    return "Canvas";
  }

  public getIcon(): string {
    return "layout-dashboard";
  }

  public getState(): Record<string, unknown> {
    return {
      pageId: this.activePage?.id,
      pageTitle: this.activePage?.title,
    };
  }

  public async setState(state: any, result: ViewStateResult): Promise<void> {
    if (typeof (super.setState as any) === "function") {
      await super.setState(state, result);
    }
    if (state?.pageId && (!this.activePage || this.activePage.id !== state.pageId)) {
      await this.loadPageById(state.pageId);
    }
  }

  public async onOpen(): Promise<void> {
    this.containerEl.addClass("onenote-spatial-leaf");
    const container = this.contentEl;
    container.empty();
    container.addClass("onenote-spatial-view-root");

    // Detect Obsidian Dark/Light mode
    this.isDarkMode = document.body.classList.contains("theme-dark");

    // 1. Create Canvas Host DOM container (100% full view area)
    this.canvasHostEl = container.createDiv({ cls: "onenote-canvas-host-wrapper" });

    // 2. Initialize PixiJS Renderer
    this.renderer = new PixiRenderer();
    await this.renderer.initialize(this.canvasHostEl, {
      preference: "webgl",
      enableDomOverlay: true,
      devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
    });

    // 2b. Initialize Expandable Canvas Scrollbars
    this.scrollbars = new CanvasScrollbars({
      container: this.canvasHostEl,
      renderer: this.renderer,
    });

    this.renderer.setAssetResolver((assetId: string) => {
      try {
        const files = this.app.vault.getFiles();
        const assetFile = files.find((f) => f.name.includes(assetId));
        if (assetFile) {
          return this.app.vault.adapter.getResourcePath(assetFile.path);
        }
      } catch {
        // Fall back to undefined if vault access fails
      }
      return undefined;
    });

    // Wire renderer callbacks
    this.renderer.onViewportChange = () => {
      this.hasUserPannedOrZoomed = true;
      this.updateHud();
      this.ribbon?.updateZoomDisplay();
      this.scrollbars?.update();
    };

    this.renderer.onCursorSceneMove = (scenePt) => {
      this.cursorScenePos = scenePt;
    };

    this.renderer.onSelectionChange = (nodes) => {
      PageContextManager.getInstance().setSelectedNode(nodes.length > 0 ? nodes[0]!.id : null);
    };

    this.renderer.onWikilinkClick = (linkText: string) => {
      const activeCtx = PageContextManager.getInstance().getActivePageContext();
      const sourcePath = activeCtx?.markdownPath || "";
      (this.app.workspace as any).openLinkText(linkText, sourcePath, false);
    };

    this.renderer.onStickyNotePopout = (node) => {
      FloatingStickyNoteManager.getInstance().openPopoutWindow(
        this.app,
        node.element,
        this.activePage?.id,
        {
          onDockToCanvas: (noteId) => {
            this.renderer?.focusNode(noteId);
          },
        }
      );
    };

    this.renderer.onStickyNoteCreateSibling = (node) => {
      const sourceBounds = node.bounds || {
        x: 100,
        y: 100,
        width: STICKY_NOTE_METRICS.DEFAULT_WIDTH,
        height: STICKY_NOTE_METRICS.DEFAULT_HEIGHT,
        zIndex: 1,
      };
      const newBounds = {
        ...sourceBounds,
        x: sourceBounds.x + STICKY_NOTE_METRICS.SIBLING_OFFSET_X,
        y: sourceBounds.y + STICKY_NOTE_METRICS.SIBLING_OFFSET_Y,
      };
      const newNote = StickyNoteUtils.createDefaultStickyNote({
        color: node.element?.color || "yellow",
        bounds: newBounds,
      });

      FloatingStickyNoteManager.getInstance().openPopoutWindow(
        this.app,
        newNote,
        this.activePage?.id
      );
    };

    this.renderer.onStickyNoteOpenHub = () => {
      new StickyNotesHubModal(this.app).open();
    };

    this.renderer.onStickyNoteDelete = (node) => {
      if (!this.activePage) return;
      const updatedElements = this.activePage.elements.filter((e) => e.id !== node.id);
      this.activePage = { ...this.activePage, elements: updatedElements, modifiedTime: Date.now() };
      const ctx = PageContextManager.getInstance().getPageContext(this.activePage.id);
      if (ctx) {
        PageContextManager.getInstance().registerPage({
          ...ctx,
          canonicalPage: this.activePage,
        });
        if (ctx.sidecarPath) {
          FloatingStickyNoteManager.getInstance().schedulePageSave(
            this.app,
            this.activePage.id,
            ctx.sidecarPath,
            this.activePage
          );
        }
      }
      const scene = this.compilePageScene(this.activePage);
      this.renderer?.renderScene(scene);
    };

    this.renderer.onStickyNoteStyleChange = (node, style) => {
      if (!this.activePage) return;
      const updatedElements = this.activePage.elements.map((e) => {
        if (e.id === node.id && e.type === "stickyNote") {
          return {
            ...e,
            color: style.color ?? (e as any).color,
            opacity: style.opacity ?? (e as any).opacity,
            modifiedTime: Date.now(),
          };
        }
        return e;
      });
      this.activePage = { ...this.activePage, elements: updatedElements, modifiedTime: Date.now() };
      const ctx = PageContextManager.getInstance().getPageContext(this.activePage.id);
      if (ctx) {
        PageContextManager.getInstance().registerPage({
          ...ctx,
          canonicalPage: this.activePage,
        });
        if (ctx.sidecarPath) {
          FloatingStickyNoteManager.getInstance().schedulePageSave(
            this.app,
            this.activePage.id,
            ctx.sidecarPath,
            this.activePage
          );
        }
      }
      const scene = this.compilePageScene(this.activePage);
      this.renderer?.renderScene(scene);
    };

    this.renderer.onStickyNotePinToggle = (node) => {
      if (!this.activePage) return;
      const updatedElements = this.activePage.elements.map((e) => {
        if (e.id === node.id && e.type === "stickyNote") {
          const isPinned = !(e as any).spatialMeta?.isPinned;
          return {
            ...e,
            spatialMeta: {
              ...(e as any).spatialMeta,
              isPinned,
            },
            modifiedTime: Date.now(),
          };
        }
        return e;
      });
      this.activePage = { ...this.activePage, elements: updatedElements, modifiedTime: Date.now() };
      const ctx = PageContextManager.getInstance().getPageContext(this.activePage.id);
      if (ctx) {
        PageContextManager.getInstance().registerPage({
          ...ctx,
          canonicalPage: this.activePage,
        });
        if (ctx.sidecarPath) {
          FloatingStickyNoteManager.getInstance().schedulePageSave(
            this.app,
            this.activePage.id,
            ctx.sidecarPath,
            this.activePage
          );
        }
      }
      const scene = this.compilePageScene(this.activePage);
      this.renderer?.renderScene(scene);
    };

    this.renderer.onStickyNoteTitleChange = (node, newTitle) => {
      if (!this.activePage) return;
      const updatedElements = this.activePage.elements.map((e) => {
        if (e.id === node.id && e.type === "stickyNote") {
          return {
            ...e,
            title: newTitle,
            modifiedTime: Date.now(),
          };
        }
        return e;
      });
      this.activePage = { ...this.activePage, elements: updatedElements, modifiedTime: Date.now() };
      const ctx = PageContextManager.getInstance().getPageContext(this.activePage.id);
      if (ctx) {
        PageContextManager.getInstance().registerPage({
          ...ctx,
          canonicalPage: this.activePage,
        });
        if (ctx.sidecarPath) {
          FloatingStickyNoteManager.getInstance().schedulePageSave(
            this.app,
            this.activePage.id,
            ctx.sidecarPath,
            this.activePage
          );
        }
      }
    };

    this.renderer.onAttachmentClick = (node) => {
      new Notice(`Attachment: ${node.fileName} (${(node.fileSizeBytes / 1024).toFixed(1)} KB)`);
    };

    this.renderer.onTitleChange = async (newTitle: string) => {
      if (!this.activePage) return;
      const sanitized = newTitle.trim() || "Untitled";
      this.activePage = { ...this.activePage, title: sanitized };

      // Update tab header
      if ((this.leaf as any).updateHeader) {
        (this.leaf as any).updateHeader();
      }

      // Rename markdown note and sidecar in Obsidian vault if registered
      const ctx = PageContextManager.getInstance().getPageContext(this.activePage.id);
      if (ctx && ctx.markdownPath) {
        try {
          const oldMdPath = ctx.markdownPath;
          const parentDir = oldMdPath.substring(0, oldMdPath.lastIndexOf("/"));
          const newMdPath = `${parentDir}/${sanitized}.md`;
          const newSidecarPath = `${parentDir}/${sanitized}.onecanvas.json`;

          const mdFile = this.app.vault.getAbstractFileByPath(oldMdPath);
          if (mdFile instanceof TFile) {
            await this.app.fileManager.renameFile(mdFile, newMdPath);
          }

          if (ctx.sidecarPath) {
            const sidecarFile = this.app.vault.getAbstractFileByPath(ctx.sidecarPath);
            if (sidecarFile instanceof TFile) {
              await this.app.fileManager.renameFile(sidecarFile, newSidecarPath);
            }
          }

          PageContextManager.getInstance().updatePageTitle(
            this.activePage.id,
            sanitized,
            newMdPath,
            newSidecarPath
          );
        } catch {
          PageContextManager.getInstance().updatePageTitle(this.activePage.id, sanitized);
        }
      } else {
        PageContextManager.getInstance().updatePageTitle(this.activePage.id, sanitized);
      }
    };

    // 3. Create Authentic OneNote Ribbon, HUD & Empty State
    const pluginInstance = this.getPluginInstance();
    const defaultStickyColor = pluginInstance?.settings?.defaultStickyNoteColor || "yellow";

    this.ribbon = new OneNoteRibbon({
      container: this.containerEl,
      insertTarget: this.contentEl,
      renderer: this.renderer,
      app: this.app,
      defaultStickyNoteColor: defaultStickyColor,
      onPagePropertiesClick: () => {
        this.openPagePropertiesModal();
      },
    });
    this.createHud(container);
    this.createEmptyState(container);
    this.createLoadingOverlay(container);

    // 4. Setup Resize Observer
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0 && this.renderer) {
            this.renderer.resize(width, height);
            if (!this.hasUserPannedOrZoomed) {
              this.renderer.fitToPage({ padding: 0, align: "top-left" });
            }
            this.updateHud();
            this.ribbon?.updateZoomDisplay();
            this.scrollbars?.update();
          }
        }
      });
      this.resizeObserver.observe(this.canvasHostEl);
    }

    // 5. Setup Obsidian Theme Change Observer
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

    // 6. Listen to Active Page changes across Obsidian
    this.unsubscribePageContext = PageContextManager.getInstance().onPageChange((ctx) => {
      if (ctx?.canonicalPage && ctx.canonicalPage.id !== this.activePage?.id) {
        this.loadPage(ctx.canonicalPage);
      }
    });

    // 7. If page is already attached or active context exists, render it
    if (this.activePage) {
      this.loadPage(this.activePage);
    } else {
      const activeCtx = PageContextManager.getInstance().getActivePageContext();
      if (activeCtx?.canonicalPage) {
        this.loadPage(activeCtx.canonicalPage);
      } else {
        this.autoResolveActiveDocument();
      }
    }
  }

  private async autoResolveActiveDocument(): Promise<void> {
    try {
      if (this.activePage) return;
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile || activeFile.extension !== "md") return;

      const plugin = this.getPluginInstance();
      if (plugin?.coordinator && !this.activePage) {
        const page = await plugin.coordinator.resolveCanonicalPage(
          undefined,
          undefined,
          activeFile.path
        );
        if (page && !this.activePage) {
          this.loadPage(page);
        }
      }
    } catch {
      // ignore
    }
  }

  public openPagePropertiesModal(): void {
    if (!this.activePage) {
      new Notice("No active page loaded to edit properties.");
      return;
    }
    new PagePropertiesModal(this.app, this.activePage.id, (updatedProps) => {
      if (updatedProps.onenote_title && this.activePage) {
        this.activePage = { ...this.activePage, title: updatedProps.onenote_title };
        if (this.renderer) {
          const scene = this.compilePageScene(this.activePage);
          this.renderer.renderScene(scene);
        }
      }
    }).open();
  }

  public onResize(): void {
    super.onResize();
    if (!this.canvasHostEl || !this.renderer) return;
    const width = this.canvasHostEl.clientWidth;
    const height = this.canvasHostEl.clientHeight;
    if (width > 0 && height > 0) {
      this.renderer.resize(width, height);
      if (!this.hasUserPannedOrZoomed) {
        this.renderer.fitToPage({ padding: 0, align: "top-left" });
      }
      this.updateHud();
      this.ribbon?.updateZoomDisplay();
      this.scrollbars?.update();
    }
  }

  public async onClose(): Promise<void> {
    if (this.scrollbars) {
      this.scrollbars.destroy();
      this.scrollbars = null;
    }
    if (this.unsubscribePageContext) {
      this.unsubscribePageContext();
      this.unsubscribePageContext = null;
    }
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
    if (this.ribbon) {
      this.ribbon.destroy();
      this.ribbon = null;
    }
    this.containerEl.removeClass("onenote-spatial-leaf");
    this.hudEl = null;
    this.emptyStateEl = null;
    this.loadingOverlayEl = null;
    this.contentEl.empty();
  }

  /**
   * Load a single CanonicalPage into the spatial viewer.
   */
  public loadPage(page: CanonicalPage): void {
    this.activePage = page;
    PageContextManager.getInstance().setActivePage(page.id);

    if (this.emptyStateEl) {
      this.emptyStateEl.addClass("is-hidden");
    }

    this.showLoading(true);

    try {
      const scene = this.compilePageScene(page);
      if (this.renderer) {
        this.renderer.renderScene(scene);
        this.hasUserPannedOrZoomed = false;
        this.renderer.fitToPage({ padding: 0, align: "top-left" });
      }
      this.updateHud();
      this.ribbon?.updateZoomDisplay();
      this.scrollbars?.update();
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Backward-compatible notebook loader: loads the first page of the notebook.
   */
  public loadNotebook(notebook: CanonicalNotebook): void {
    let firstPage: CanonicalPage | null = null;
    for (const sec of notebook.sections) {
      if (sec.pages.length > 0) {
        firstPage = sec.pages[0] || null;
        break;
      }
    }
    if (!firstPage) {
      for (const group of notebook.sectionGroups) {
        for (const sec of group.sections) {
          if (sec.pages.length > 0) {
            firstPage = sec.pages[0] || null;
            break;
          }
        }
        if (firstPage) break;
      }
    }

    if (firstPage) {
      this.loadPage(firstPage);
    }
  }

  /**
   * Load page by ID from the global PageContextManager if registered,
   * or resolve from vault sidecar files via coordinator.
   */
  public async loadPageById(pageId: PageId): Promise<void> {
    const ctx = PageContextManager.getInstance().getPageContext(pageId);
    if (ctx?.canonicalPage) {
      this.loadPage(ctx.canonicalPage);
      return;
    }

    try {
      const plugin = this.getPluginInstance();
      if (plugin?.coordinator) {
        const page = await plugin.coordinator.resolveCanonicalPage(pageId);
        if (page) {
          this.loadPage(page);
        }
      }
    } catch {
      // ignore
    }
  }

  private getPluginInstance(): any {
    const plugins = typeof this.app !== "undefined" ? (this.app as any)?.plugins : undefined;
    return (
      plugins?.getPlugin?.("on-to-od") ||
      plugins?.plugins?.["on-to-od"] ||
      plugins?.getPlugin?.("onenote-spatial") ||
      plugins?.plugins?.["onenote-spatial"] ||
      plugins?.getPlugin?.("on2od") ||
      plugins?.plugins?.["on2od"] ||
      plugins?.getPlugin?.("onenote2obsidian") ||
      plugins?.plugins?.["onenote2obsidian"]
    );
  }

  private compilePageScene(page: CanonicalPage): PageScene {
    // Theme-adjusted background style with on-canvas page title injection
    const baseScene = SceneBuilder.build(page, { showPageTitle: true });

    if (this.isDarkMode) {
      return {
        ...baseScene,
        canvasStyle: {
          ...baseScene.canvasStyle,
          backgroundColor: CANVAS_STYLE_DEFAULTS.DARK_MODE_BACKGROUND,
          ruleLines: baseScene.canvasStyle.ruleLines
            ? {
                ...baseScene.canvasStyle.ruleLines,
                color: CANVAS_STYLE_DEFAULTS.DARK_MODE_RULE_COLOR,
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

  private createEmptyState(container: HTMLElement): void {
    this.emptyStateEl = container.createDiv({ cls: "onenote-empty-state" });
    this.emptyStateEl.createDiv({ cls: "onenote-empty-title", text: "Canvas" });
    this.emptyStateEl.createDiv({
      cls: "onenote-empty-desc",
      text: "Create a new canvas, open an existing note, or import a file (.one / .onepkg) to view.",
    });

    const btnRow = this.emptyStateEl.createDiv({
      cls: "onenote-empty-actions",
    });

    const newBtn = btnRow.createEl("button", {
      cls: "onenote-empty-btn mod-cta",
      text: "➕ New Canvas",
    });
    newBtn.addEventListener("click", async () => {
      const plugin = this.getPluginInstance();
      if (plugin && typeof plugin.createNewCanvas === "function") {
        await plugin.createNewCanvas();
      }
    });

    const importBtn = btnRow.createEl("button", {
      cls: "onenote-empty-btn",
      text: "📥 Import File",
    });
    importBtn.addEventListener("click", () => {
      const plugin = this.getPluginInstance();
      if (plugin && typeof plugin.openImportModal === "function") {
        plugin.openImportModal();
      }
    });

    if (this.activePage) {
      this.emptyStateEl.addClass("is-hidden");
    }
  }

  private createHud(container: HTMLElement): void {
    this.hudEl = container.createDiv({ cls: "onenote-hud-panel" });
    this.updateHud();
  }

  private updateHud(): void {
    if (!this.hudEl || !this.renderer) return;
    const transform = this.renderer.getTransform();
    const zoomPct = Math.round(transform.scale * 100);
    this.hudEl.setText(`Zoom: ${zoomPct}%`);
  }

  private createLoadingOverlay(container: HTMLElement): void {
    this.loadingOverlayEl = container.createDiv({ cls: "onenote-loading-overlay is-hidden" });
    this.loadingOverlayEl.createDiv({ cls: "onenote-spinner" });
    this.loadingOverlayEl.createDiv({
      cls: "onenote-loading-text",
      text: "Loading spatial page...",
    });
  }

  private showLoading(show: boolean): void {
    if (!this.loadingOverlayEl) return;
    if (show) {
      this.loadingOverlayEl.removeClass("is-hidden");
    } else {
      this.loadingOverlayEl.addClass("is-hidden");
    }
  }

  public navigateToStickyNote(
    noteId: import("../model/Ids").StickyNoteId,
    options?: { zoom?: number }
  ): boolean {
    return this.renderer?.focusNode(noteId as any, options) ?? false;
  }
}
