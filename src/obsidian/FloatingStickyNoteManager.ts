import { App, TFile, WorkspaceLeaf } from "obsidian";
import { DiagnosticCode } from "../diagnostics/DiagnosticTypes";
import { logger } from "../diagnostics/Logger";
import { SpatialBounds } from "../geometry/Bounds";
import { CanonicalStickyNote } from "../model/CanonicalStickyNote";
import { CanonicalPage } from "../model/CanonicalPage";
import { PageId, StickyNoteId } from "../model/Ids";
import { PageContextManager } from "../context/PageContextManager";
import { PageSceneSerializer } from "../pagescene/PageSceneSerializer";
import { SceneBuilder } from "../pagescene/SceneBuilder";
import {
  FLOATING_WINDOW_METRICS,
  STICKY_NOTE_METRICS,
  VIEW_TYPE_STICKY_NOTE,
} from "../constants/StickyNoteConstants";
import { StickyNoteUtils } from "../model/StickyNoteUtils";
import { FloatingStickyNoteWindow, FloatingStickyNoteCallbacks } from "./FloatingStickyNoteWindow";
import { StickyNotesHubModal } from "./StickyNotesHubModal";

export interface FloatingNoteOpenOptions {
  initialBounds?: SpatialBounds;
  onDockToCanvas?: (noteId: StickyNoteId, pageId?: PageId) => void;
  preferPopout?: boolean;
  mode?: "auto" | "popout" | "floating";
}

interface PendingSaveEntry {
  app: App;
  sidecarPath: string;
  page: CanonicalPage;
}

export class FloatingStickyNoteManager {
  private static instance: FloatingStickyNoteManager | null = null;
  private activeNotes = new Map<StickyNoteId, FloatingStickyNoteWindow>();
  private activePopoutLeaves = new Map<StickyNoteId, WorkspaceLeaf>();
  private activePopoutNotes = new Map<StickyNoteId, CanonicalStickyNote>();

  // Debounced save pipeline
  private pendingSaveTimers = new Map<PageId, ReturnType<typeof setTimeout>>();
  private pendingPagesToSave = new Map<PageId, PendingSaveEntry>();

  // Theme mutation observer
  private themeObserver: MutationObserver | null = null;

  public static getInstance(): FloatingStickyNoteManager {
    if (!FloatingStickyNoteManager.instance) {
      FloatingStickyNoteManager.instance = new FloatingStickyNoteManager();
    }
    return FloatingStickyNoteManager.instance;
  }

  public static resetInstanceForTesting(): void {
    if (FloatingStickyNoteManager.instance) {
      FloatingStickyNoteManager.instance.closeAll();
      FloatingStickyNoteManager.instance = null;
    }
  }

  /**
   * Checks whether Obsidian native OS popout windows are supported in this environment.
   */
  public canOpenNativePopout(app: App): boolean {
    return (
      typeof (app?.workspace as any)?.openPopoutLeaf === "function" &&
      typeof (app?.workspace as any)?.setActiveLeaf === "function"
    );
  }

  /**
   * Opens a Sticky Note in an independent native OS popout window.
   * If native popouts are unavailable (e.g. mobile, tests), falls back to floating window.
   */
  public async openPopoutWindow(
    app: App,
    note: CanonicalStickyNote,
    pageId?: PageId,
    options: FloatingNoteOpenOptions = {}
  ): Promise<WorkspaceLeaf | null> {
    // If already open in in-app floating window, unmount it to transfer to OS window
    const existingFloat = this.activeNotes.get(note.id);
    if (existingFloat) {
      existingFloat.unmount();
      this.activeNotes.delete(note.id);
    }

    // If already open in popout leaf, focus it
    const existingLeaf = this.activePopoutLeaves.get(note.id);
    if (existingLeaf) {
      if ((app.workspace as any)?.setActiveLeaf) {
        (app.workspace as any).setActiveLeaf(existingLeaf, { focus: true });
      }
      return existingLeaf;
    }

    if (!this.canOpenNativePopout(app)) {
      this.openFloatingWindow(app, note, pageId, options);
      return null;
    }

    try {
      const bounds = options.initialBounds ||
        note.spatialMeta?.floatingBounds || {
          x: 100,
          y: 100,
          width: FLOATING_WINDOW_METRICS.DEFAULT_WIDTH,
          height: FLOATING_WINDOW_METRICS.DEFAULT_HEIGHT,
          zIndex: FLOATING_WINDOW_METRICS.BASE_Z_INDEX,
        };

      const leaf = (app.workspace as any).openPopoutLeaf({
        x: bounds.x,
        y: bounds.y,
        size: {
          width: bounds.width,
          height: bounds.height,
        },
      });

      const updatedNote: CanonicalStickyNote = {
        ...note,
        spatialMeta: {
          ...note.spatialMeta,
          isPoppedOut: true,
          floatingBounds: bounds,
        },
      };

      this.activePopoutLeaves.set(note.id, leaf);
      this.activePopoutNotes.set(note.id, updatedNote);

      await leaf.setViewState({
        type: VIEW_TYPE_STICKY_NOTE,
        state: {
          noteId: note.id,
          pageId,
          note: updatedNote,
        },
      });

      if (pageId) {
        this.updateNoteInPageContext(app, pageId, updatedNote);
      }

      logger.info(
        DiagnosticCode.GENERAL_INFO,
        `Opened native popout sticky note leaf: ${note.id} (${note.title || "Untitled"})`
      );

      return leaf;
    } catch (err) {
      this.activePopoutLeaves.delete(note.id);
      this.activePopoutNotes.delete(note.id);
      logger.warn(
        DiagnosticCode.GENERAL_INFO,
        `Failed to open native popout leaf, falling back to floating window: ${err}`
      );
      this.openFloatingWindow(app, note, pageId, options);
      return null;
    }
  }

  /**
   * Opens a Sticky Note in an in-app screen-draggable floating window.
   */
  public openFloatingWindow(
    app: App,
    note: CanonicalStickyNote,
    pageId?: PageId,
    options: FloatingNoteOpenOptions = {}
  ): FloatingStickyNoteWindow {
    this.ensureThemeObserver();

    const existing = this.activeNotes.get(note.id);
    if (existing) {
      logger.info(
        DiagnosticCode.GENERAL_INFO,
        `Floating sticky note already open, focusing window: ${note.id}`
      );
      existing.focus();
      return existing;
    }

    // Mark note as popped out
    const updatedNote: CanonicalStickyNote = {
      ...note,
      spatialMeta: {
        ...note.spatialMeta,
        isPoppedOut: true,
        floatingBounds: options.initialBounds || note.spatialMeta?.floatingBounds,
      },
    };

    const callbacks: FloatingStickyNoteCallbacks = {
      onTitleChange: (noteId, newTitle) => {
        this.handleNoteTitleChange(app, pageId, noteId, newTitle);
      },
      onContentChange: (noteId, newContent) => {
        this.handleNoteContentChange(app, pageId, noteId, newContent);
      },
      onStyleChange: (noteId, style) => {
        this.handleNoteStyleChange(app, pageId, noteId, style);
      },
      onBoundsChange: (noteId, bounds) => {
        this.handleNoteBoundsChange(app, pageId, noteId, bounds);
      },
      onDock: (noteId, targetPageId) => {
        this.dockNote(noteId, targetPageId, options.onDockToCanvas);
      },
      onClose: (noteId) => {
        this.closeNote(noteId);
      },
      onDelete: (noteId) => {
        this.deleteNote(app, pageId, noteId);
      },
      onNewNote: (sourceNoteId) => {
        this.createSiblingNote(app, sourceNoteId, pageId);
      },
      onOpenHub: () => {
        new StickyNotesHubModal(app).open();
      },
      onWikilinkClick: (linkText) => {
        const sourcePath = pageId
          ? PageContextManager.getInstance().getPageContext(pageId)?.markdownPath || ""
          : "";
        (app.workspace as any)?.openLinkText?.(linkText, sourcePath, false);
      },
      onPopoutToDesktop: (sourceNoteId) => {
        const noteToPopout = this.activeNotes.get(sourceNoteId)?.getNote() || updatedNote;
        this.openPopoutWindow(app, noteToPopout, pageId, options);
      },
    };

    const windowInstance = new FloatingStickyNoteWindow(
      updatedNote,
      pageId,
      callbacks,
      options.initialBounds
    );

    windowInstance.mount();
    this.activeNotes.set(note.id, windowInstance);

    // Persist popped-out state in PageContextManager
    if (pageId) {
      this.updateNoteInPageContext(app, pageId, updatedNote);
    }

    logger.info(
      DiagnosticCode.GENERAL_INFO,
      `Opened floating sticky note window: ${note.id} (${note.title || "Untitled"})`
    );

    return windowInstance;
  }

  /**
   * Opens a Sticky Note in an independent floating quick-note window.
   * If already open, brings the existing window to the front.
   */
  public openNote(
    app: App,
    note: CanonicalStickyNote,
    pageId?: PageId,
    options: FloatingNoteOpenOptions = {}
  ): FloatingStickyNoteWindow | null {
    if (options.mode === "popout" || options.preferPopout) {
      if (this.canOpenNativePopout(app)) {
        this.openPopoutWindow(app, note, pageId, options);
        return null;
      }
    }
    return this.openFloatingWindow(app, note, pageId, options);
  }

  /**
   * Closes a floating or popout sticky note window and flushes pending writes.
   */
  public closeNote(noteId: StickyNoteId): void {
    const popoutLeaf = this.activePopoutLeaves.get(noteId);
    if (popoutLeaf) {
      this.activePopoutLeaves.delete(noteId);
      this.activePopoutNotes.delete(noteId);
      try {
        popoutLeaf.detach();
      } catch {}
    }

    const win = this.activeNotes.get(noteId);
    if (!win) {
      this.flushPendingSaves();
      return;
    }

    win.unmount();
    this.activeNotes.delete(noteId);

    // Update note spatialMeta in context if page registered
    if (win.pageId) {
      const ctx = PageContextManager.getInstance().getPageContext(win.pageId);
      if (ctx?.canonicalPage) {
        const element = ctx.canonicalPage.elements.find(
          (el) => el.id === noteId && el.type === "stickyNote"
        ) as CanonicalStickyNote | undefined;

        if (element) {
          const unpopped: CanonicalStickyNote = {
            ...element,
            spatialMeta: {
              ...element.spatialMeta,
              isPoppedOut: false,
              floatingBounds: win.getBounds(),
            },
          };
          this.updateNoteInPageContext(null, win.pageId, unpopped);
        }
      }
    }

    // Flush pending saves to guarantee persistence on close
    this.flushPendingSaves();

    logger.info(DiagnosticCode.GENERAL_INFO, `Closed floating sticky note: ${noteId}`);
  }

  /**
   * Docks a floating sticky note back to its canvas page.
   */
  public dockNote(
    noteId: StickyNoteId,
    pageId?: PageId,
    onDockToCanvas?: (noteId: StickyNoteId, pageId?: PageId) => void
  ): void {
    this.closeNote(noteId);
    if (onDockToCanvas) {
      onDockToCanvas(noteId, pageId);
    }
  }

  /**
   * Closes all currently active floating sticky notes and popout windows, and flushes all pending saves.
   */
  public closeAll(): void {
    this.flushPendingSaves();

    for (const [, leaf] of this.activePopoutLeaves) {
      try {
        leaf.detach();
      } catch {}
    }
    this.activePopoutLeaves.clear();
    this.activePopoutNotes.clear();

    for (const [, win] of this.activeNotes) {
      win.unmount();
    }
    this.activeNotes.clear();

    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
  }

  public getActiveNotes(): ReadonlyMap<StickyNoteId, FloatingStickyNoteWindow> {
    return this.activeNotes;
  }

  public getActivePopoutLeaves(): ReadonlyMap<StickyNoteId, WorkspaceLeaf> {
    return this.activePopoutLeaves;
  }

  public hasOpenNote(noteId: StickyNoteId): boolean {
    return this.activeNotes.has(noteId) || this.activePopoutLeaves.has(noteId);
  }

  public getOpenNote(noteId: StickyNoteId): FloatingStickyNoteWindow | undefined {
    return this.activeNotes.get(noteId);
  }

  public getPopoutLeaf(noteId: StickyNoteId): WorkspaceLeaf | undefined {
    return this.activePopoutLeaves.get(noteId);
  }

  public unregisterPopoutLeaf(noteId: StickyNoteId): void {
    this.activePopoutLeaves.delete(noteId);
    this.activePopoutNotes.delete(noteId);
  }

  public getAllActiveNotes(): CanonicalStickyNote[] {
    const notes: CanonicalStickyNote[] = [];
    for (const win of this.activeNotes.values()) {
      notes.push(win.getNote());
    }
    for (const [noteId, leaf] of this.activePopoutLeaves.entries()) {
      const view = leaf.view as any;
      if (view?.getNote && typeof view.getNote === "function") {
        const n = view.getNote();
        if (n) {
          notes.push(n);
          continue;
        }
      }
      const cached = this.activePopoutNotes.get(noteId);
      if (cached) {
        notes.push(cached);
      }
    }
    return notes;
  }

  public syncNoteState(app: App | null, pageId: PageId, updatedNote: CanonicalStickyNote): void {
    this.updateNoteInPageContext(app, pageId, updatedNote);
  }

  /**
   * Diagnostic state inspection for telemetry, debugging, and testing.
   */
  public debugDumpState(): Record<string, unknown> {
    const notesData: Record<string, unknown> = {};
    for (const [noteId, win] of this.activeNotes) {
      notesData[noteId] = {
        noteId,
        pageId: win.pageId,
        bounds: win.getBounds(),
      };
    }
    return {
      activeCount: this.activeNotes.size,
      pendingSavesCount: this.pendingPagesToSave.size,
      notes: notesData,
    };
  }

  /**
   * Flushes all debounced writes immediately to vault disk storage.
   */
  public flushPendingSaves(): void {
    for (const timer of this.pendingSaveTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingSaveTimers.clear();

    for (const [, entry] of this.pendingPagesToSave) {
      this.executeDiskWrite(entry.app, entry.sidecarPath, entry.page);
    }
    this.pendingPagesToSave.clear();
  }

  // --- Internal Synchronization Helpers ---

  private ensureThemeObserver(): void {
    if (this.themeObserver) return;
    if (
      typeof MutationObserver !== "undefined" &&
      typeof document !== "undefined" &&
      document.body
    ) {
      this.themeObserver = new MutationObserver(() => {
        for (const win of this.activeNotes.values()) {
          win.applyThemeColors();
        }
      });
      this.themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
  }

  private handleNoteTitleChange(
    app: App | null,
    pageId: PageId | undefined,
    noteId: StickyNoteId,
    newTitle: string
  ): void {
    let ctx = pageId ? PageContextManager.getInstance().getPageContext(pageId) : undefined;
    if (!ctx?.canonicalPage) {
      ctx = PageContextManager.getInstance()
        .getAllPages()
        .find((p) => p.canonicalPage?.elements.some((e) => e.id === noteId));
    }
    if (!ctx?.canonicalPage) return;

    const el = ctx.canonicalPage.elements.find(
      (e) => e.id === noteId && e.type === "stickyNote"
    ) as CanonicalStickyNote | undefined;

    if (el) {
      const updated: CanonicalStickyNote = {
        ...el,
        title: newTitle,
        modifiedTime: Date.now(),
      };
      this.updateNoteInPageContext(app, ctx.pageId, updated);
    }
  }

  private handleNoteContentChange(
    app: App | null,
    pageId: PageId | undefined,
    noteId: StickyNoteId,
    newContent: string
  ): void {
    let ctx = pageId ? PageContextManager.getInstance().getPageContext(pageId) : undefined;
    if (!ctx?.canonicalPage) {
      ctx = PageContextManager.getInstance()
        .getAllPages()
        .find((p) => p.canonicalPage?.elements.some((e) => e.id === noteId));
    }
    if (!ctx?.canonicalPage) return;

    const el = ctx.canonicalPage.elements.find(
      (e) => e.id === noteId && e.type === "stickyNote"
    ) as CanonicalStickyNote | undefined;

    if (el) {
      const updated: CanonicalStickyNote = {
        ...el,
        content: newContent,
        modifiedTime: Date.now(),
      };
      this.updateNoteInPageContext(app, ctx.pageId, updated);
    }
  }

  private handleNoteStyleChange(
    app: App | null,
    pageId: PageId | undefined,
    noteId: StickyNoteId,
    style: { color?: string; opacity?: number }
  ): void {
    let ctx = pageId ? PageContextManager.getInstance().getPageContext(pageId) : undefined;
    if (!ctx?.canonicalPage) {
      ctx = PageContextManager.getInstance()
        .getAllPages()
        .find((p) => p.canonicalPage?.elements.some((e) => e.id === noteId));
    }
    if (!ctx?.canonicalPage) return;

    const el = ctx.canonicalPage.elements.find(
      (e) => e.id === noteId && e.type === "stickyNote"
    ) as CanonicalStickyNote | undefined;

    if (el) {
      const updated: CanonicalStickyNote = {
        ...el,
        color: (style.color as any) ?? el.color,
        opacity: style.opacity ?? el.opacity,
        modifiedTime: Date.now(),
      };
      this.updateNoteInPageContext(app, ctx.pageId, updated);
    }
  }

  private handleNoteBoundsChange(
    app: App | null,
    pageId: PageId | undefined,
    noteId: StickyNoteId,
    bounds: SpatialBounds
  ): void {
    let ctx = pageId ? PageContextManager.getInstance().getPageContext(pageId) : undefined;
    if (!ctx?.canonicalPage) {
      ctx = PageContextManager.getInstance()
        .getAllPages()
        .find((p) => p.canonicalPage?.elements.some((e) => e.id === noteId));
    }
    if (!ctx?.canonicalPage) return;

    const el = ctx.canonicalPage.elements.find(
      (e) => e.id === noteId && e.type === "stickyNote"
    ) as CanonicalStickyNote | undefined;

    if (el) {
      const updated: CanonicalStickyNote = {
        ...el,
        spatialMeta: {
          ...el.spatialMeta,
          floatingBounds: bounds,
        },
      };
      this.updateNoteInPageContext(app, ctx.pageId, updated);
    }
  }

  private updateNoteInPageContext(
    app: App | null,
    pageId: PageId | undefined,
    updatedNote: CanonicalStickyNote
  ): void {
    let ctx = pageId ? PageContextManager.getInstance().getPageContext(pageId) : undefined;
    if (!ctx?.canonicalPage) {
      ctx = PageContextManager.getInstance()
        .getAllPages()
        .find((p) => p.canonicalPage?.elements.some((e) => e.id === updatedNote.id));
    }
    if (!ctx?.canonicalPage) return;
    const resolvedPageId = ctx.pageId;

    const nextElements = ctx.canonicalPage.elements.map((e) =>
      e.id === updatedNote.id ? updatedNote : e
    );

    const nextCanonicalPage = {
      ...ctx.canonicalPage,
      elements: nextElements,
      modifiedTime: Date.now(),
    };

    // Immediate in-memory registration for synchronous UI reactivity
    PageContextManager.getInstance().registerPage({
      ...ctx,
      canonicalPage: nextCanonicalPage,
    });

    // Debounced disk save pipeline to avoid I/O thrashing
    if (app && ctx.sidecarPath) {
      this.schedulePageSave(app, resolvedPageId, ctx.sidecarPath, nextCanonicalPage);
    }
  }

  public schedulePageSave(
    app: App,
    pageId: PageId,
    sidecarPath: string,
    page: CanonicalPage
  ): void {
    if (!app || !sidecarPath) return;
    this.pendingPagesToSave.set(pageId, {
      app,
      sidecarPath,
      page,
    });

    const existingTimer = this.pendingSaveTimers.get(pageId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.pendingSaveTimers.delete(pageId);
      const entry = this.pendingPagesToSave.get(pageId);
      if (entry) {
        this.pendingPagesToSave.delete(pageId);
        this.executeDiskWrite(entry.app, entry.sidecarPath, entry.page);
      }
    }, FLOATING_WINDOW_METRICS.SAVE_DEBOUNCE_MS);

    this.pendingSaveTimers.set(pageId, timer);
  }

  private executeDiskWrite(app: App, sidecarPath: string, page: CanonicalPage): void {
    try {
      const sidecarFile = app.vault.getAbstractFileByPath(sidecarPath);
      if (sidecarFile instanceof TFile) {
        const scene = SceneBuilder.build(page);
        const sidecarJson = PageSceneSerializer.serialize(scene);
        app.vault.modify(sidecarFile, sidecarJson).catch(() => {});
      }
    } catch {
      // Safe non-blocking sidecar write failure containment
    }
  }

  public createSiblingNote(
    app: App,
    sourceNoteId: StickyNoteId,
    pageId?: PageId
  ): CanonicalStickyNote | null {
    const activeCtx = pageId
      ? PageContextManager.getInstance().getPageContext(pageId)
      : PageContextManager.getInstance().getActivePageContext();

    const sourceNote =
      this.activeNotes.get(sourceNoteId)?.getNote() ||
      (activeCtx?.canonicalPage?.elements.find((e) => e.id === sourceNoteId) as
        CanonicalStickyNote | undefined);

    const sourceBounds = sourceNote?.bounds || {
      x: 100,
      y: 100,
      width: STICKY_NOTE_METRICS.DEFAULT_WIDTH,
      height: STICKY_NOTE_METRICS.DEFAULT_HEIGHT,
      zIndex: 1,
    };

    const newBounds: SpatialBounds = {
      ...sourceBounds,
      x: sourceBounds.x + STICKY_NOTE_METRICS.SIBLING_OFFSET_X,
      y: sourceBounds.y + STICKY_NOTE_METRICS.SIBLING_OFFSET_Y,
    };

    const newNote = StickyNoteUtils.createDefaultStickyNote({
      color: sourceNote?.color || "yellow",
      bounds: newBounds,
    });

    const isSourceOnCanvas = !!activeCtx?.canonicalPage?.elements.some(
      (e) => e.id === sourceNoteId && e.type === "stickyNote"
    );

    if (isSourceOnCanvas && activeCtx?.canonicalPage) {
      const updatedElements = [...activeCtx.canonicalPage.elements, newNote];
      const updatedPage = {
        ...activeCtx.canonicalPage,
        elements: updatedElements,
        modifiedTime: Date.now(),
      };
      PageContextManager.getInstance().registerPage({
        ...activeCtx,
        canonicalPage: updatedPage,
      });
      if (app && activeCtx.sidecarPath) {
        this.schedulePageSave(app, activeCtx.canonicalPage.id, activeCtx.sidecarPath, updatedPage);
      }
    }

    this.openNote(app, newNote, pageId, {
      preferPopout: true,
      initialBounds: newBounds,
    });
    return newNote;
  }

  public deleteNote(app: App, pageId: PageId | undefined, noteId: StickyNoteId): void {
    this.closeNote(noteId);
    let activeCtx = pageId
      ? PageContextManager.getInstance().getPageContext(pageId)
      : PageContextManager.getInstance().getActivePageContext();

    if (!activeCtx?.canonicalPage?.elements.some((e) => e.id === noteId)) {
      activeCtx = PageContextManager.getInstance()
        .getAllPages()
        .find((p) => p.canonicalPage?.elements.some((e) => e.id === noteId));
    }

    if (activeCtx?.canonicalPage) {
      const updatedElements = activeCtx.canonicalPage.elements.filter((e) => e.id !== noteId);
      const updatedPage = {
        ...activeCtx.canonicalPage,
        elements: updatedElements,
        modifiedTime: Date.now(),
      };
      PageContextManager.getInstance().registerPage({
        ...activeCtx,
        canonicalPage: updatedPage,
      });
      if (app && activeCtx.sidecarPath) {
        this.schedulePageSave(app, activeCtx.canonicalPage.id, activeCtx.sidecarPath, updatedPage);
      }
    }
  }
}
