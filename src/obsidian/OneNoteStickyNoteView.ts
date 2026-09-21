import { App, ItemView, ViewStateResult, WorkspaceLeaf } from "obsidian";
import {
  FLOATING_WINDOW_METRICS,
  OPACITY_PRESETS,
  POPOVER_OFFSETS,
  STICKY_NOTE_ACCESSIBILITY_STRINGS,
  STICKY_NOTE_COLOR_PRESETS,
  STICKY_NOTE_SVG_ICONS,
  STICKY_NOTE_STRINGS,
  STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT,
  VIEW_TYPE_STICKY_NOTE,
} from "../constants/StickyNoteConstants";
import { PageContextManager } from "../context/PageContextManager";
import { StickyNoteFormatToolbar } from "../editor/text/StickyNoteFormatToolbar";
import { SpatialBounds } from "../geometry/Bounds";
import { CanonicalStickyNote } from "../model/CanonicalStickyNote";
import { PageId, StickyNoteId } from "../model/Ids";
import { StickyNoteUtils, STICKY_NOTE_PRESET_PALETTES } from "../model/StickyNoteUtils";
import { FloatingStickyNoteManager } from "./FloatingStickyNoteManager";
import { StickyNotesHubModal } from "./StickyNotesHubModal";
import { setSvgContent, setSanitizedHtml } from "../dom/DomUtils";

export class OneNoteStickyNoteView extends ItemView {
  public noteId: StickyNoteId | null = null;
  public pageId?: PageId;
  private note: CanonicalStickyNote | null = null;

  // DOM Elements
  private rootContainerEl!: HTMLElement;
  private headerEl!: HTMLElement;
  private titleInputEl!: HTMLInputElement;
  private bodyEl!: HTMLElement;
  public menuPopoverEl!: HTMLElement;
  public moreBtnEl!: HTMLButtonElement;
  public pinBtnEl!: HTMLButtonElement;
  public minimizeBtnEl!: HTMLButtonElement;
  public closeBtnEl!: HTMLButtonElement;
  public hubBtnEl!: HTMLButtonElement;
  private formatToolbar!: StickyNoteFormatToolbar;
  private footerDateEl?: HTMLElement;
  public isPinned = false;
  public isMinimized = false;

  private themeObserver: MutationObserver | null = null;
  private resizeListener: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, app: App) {
    super(leaf);
    this.app = app;
  }

  public getViewType(): string {
    return VIEW_TYPE_STICKY_NOTE;
  }

  public getDisplayText(): string {
    if (this.note?.title) {
      return `Sticky Note: ${this.note.title}`;
    }
    return "Sticky Note";
  }

  public getIcon(): string {
    return "pin";
  }

  public getState(): Record<string, unknown> {
    return {
      noteId: this.noteId,
      pageId: this.pageId,
      note: this.note,
    };
  }

  public async setState(state: any, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);

    if (state?.noteId) {
      this.noteId = state.noteId;
    }
    if (state?.pageId) {
      this.pageId = state.pageId;
    }
    if (state?.note) {
      this.note = state.note;
    }

    // Resolve note from PageContextManager if available
    if (this.pageId && this.noteId) {
      const ctx = PageContextManager.getInstance().getPageContext(this.pageId);
      if (ctx?.canonicalPage) {
        const found = ctx.canonicalPage.elements.find(
          (el) => el.id === this.noteId && el.type === "stickyNote"
        ) as CanonicalStickyNote | undefined;
        if (found) {
          this.note = found;
        }
      }
    }

    if (!this.note && this.noteId) {
      this.note = StickyNoteUtils.createDefaultStickyNote({
        id: this.noteId,
        title: STICKY_NOTE_STRINGS.UNTITLED_NOTE,
      });
    }

    if (this.rootContainerEl && this.note) {
      this.updateViewFromNote();
    }
  }

  public async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("onenote-sticky-popout-leaf-container");

    this.rootContainerEl = container.createDiv({
      cls: "onenote-floating-window onenote-sticky-popout-window",
    });
    this.rootContainerEl.setAttribute("role", "dialog");
    this.rootContainerEl.setAttribute(
      "aria-label",
      STICKY_NOTE_ACCESSIBILITY_STRINGS.STICKY_NOTE_TITLE
    );

    this.buildHeader();
    this.buildBody();
    this.buildToolbar();
    this.buildFooter();

    if (this.note) {
      this.updateViewFromNote();
    }

    // Strip Obsidian's upper control line (view header, tab header bar) so the note's authentic header acts as the sole header and drag region
    const leafContainer = (this.leaf as any)?.containerEl;
    if (leafContainer) {
      const viewHeader = leafContainer.querySelector(".view-header") as HTMLElement | null;
      if (viewHeader) viewHeader.classList.add("is-hidden");
      const tabsParent = leafContainer.closest(".workspace-tabs");
      const tabHeader = tabsParent?.querySelector(
        ".workspace-tab-header-container"
      ) as HTMLElement | null;
      if (tabHeader) tabHeader.classList.add("is-hidden");
    }

    // Also strip Obsidian's titlebar and window control buttons ONLY in a popout window document, NEVER in the main Obsidian window
    const doc = this.contentEl.ownerDocument;
    const childWin = doc?.defaultView;
    const isPopoutDoc =
      doc &&
      childWin &&
      childWin !== window &&
      (doc.body?.classList?.contains("is-popout-window") ||
        doc.body?.classList?.contains("mod-popout") ||
        doc !== document);
    if (isPopoutDoc) {
      const titlebars = doc.querySelectorAll(".titlebar, .titlebar-button-container");
      titlebars.forEach((tb) => (tb as HTMLElement).classList.add("is-hidden"));
      if (childWin && typeof childWin.requestAnimationFrame === "function") {
        childWin.requestAnimationFrame(() => {
          const lateTitlebars = doc.querySelectorAll(".titlebar, .titlebar-button-container");
          lateTitlebars.forEach((tb) => (tb as HTMLElement).classList.add("is-hidden"));
        });
      }
    }

    this.setupThemeObserver();
    this.setupWindowListeners();
  }

  public async onClose(): Promise<void> {
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }

    if (this.resizeListener && typeof window !== "undefined") {
      window.removeEventListener("resize", this.resizeListener);
      this.resizeListener = null;
    }

    // Persist current window bounds
    this.persistWindowBounds();

    // Mark note as unpopped in manager / context
    if (this.noteId) {
      FloatingStickyNoteManager.getInstance().unregisterPopoutLeaf(this.noteId);
    }

    FloatingStickyNoteManager.getInstance().flushPendingSaves();
  }

  public getNote(): CanonicalStickyNote | null {
    return this.note;
  }

  public applyThemeColors(): void {
    if (!this.note || !this.rootContainerEl) return;
    const isDark =
      typeof document !== "undefined" &&
      (document.body?.classList?.contains("theme-dark") ||
        document.documentElement?.classList?.contains("theme-dark"));
    const colorPreset = this.note.color || "yellow";
    const colors = StickyNoteUtils.resolveStickyNoteColors(colorPreset, this.note.theme, isDark);

    this.rootContainerEl.style.backgroundColor = colors.background;
    this.rootContainerEl.style.color = colors.text;
    this.rootContainerEl.style.borderColor = colors.border;
    if (this.headerEl) {
      this.headerEl.style.backgroundColor = colors.header;
    }
    if (this.contentEl) {
      this.contentEl.classList.add("onenote-transparent-bg");
    }
  }

  private buildHeader(): void {
    this.headerEl = this.rootContainerEl.createDiv({ cls: "onenote-floating-header" });

    const left = this.headerEl.createDiv({ cls: "onenote-floating-header-left" });

    // "+" New Note Button
    const newNoteBtn = left.createEl("button", {
      cls: "onenote-sticky-action-btn onenote-sticky-new-btn",
      title: STICKY_NOTE_STRINGS.NEW_NOTE_TOOLTIP,
    });
    setSvgContent(newNoteBtn, STICKY_NOTE_SVG_ICONS.PLUS);
    newNoteBtn.setAttribute("aria-label", STICKY_NOTE_STRINGS.NEW_NOTE_TOOLTIP);
    newNoteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.noteId) {
        FloatingStickyNoteManager.getInstance().createSiblingNote(
          this.app,
          this.noteId,
          this.pageId
        );
      }
    });

    const dots = left.createSpan({
      cls: "onenote-sticky-grab-dots",
    });
    setSvgContent(dots, STICKY_NOTE_SVG_ICONS.GRAB_DOTS);
    dots.setAttribute("aria-hidden", "true");

    this.titleInputEl = left.createEl("input", {
      cls: "onenote-floating-title-input",
      type: "text",
      placeholder: STICKY_NOTE_STRINGS.TITLE_PLACEHOLDER,
    });
    this.titleInputEl.setAttribute(
      "aria-label",
      STICKY_NOTE_ACCESSIBILITY_STRINGS.FLOATING_NOTE_TITLE
    );
    this.titleInputEl.addEventListener("change", () => {
      if (!this.note) return;
      const newTitle = this.titleInputEl.value.trim();
      this.note = { ...this.note, title: newTitle, modifiedTime: Date.now() };
      const doc = this.contentEl.ownerDocument;
      const childWin = doc?.defaultView;
      if (childWin && childWin !== window && this.noteId) {
        childWin.document.title = `Quick Note - ${newTitle || "Untitled"} [sn:${this.noteId}]`;
      }
      this.syncNoteToContext();
    });

    // Popover element attached to root container
    this.menuPopoverEl = this.rootContainerEl.createDiv({
      cls: "onenote-sticky-popover onenote-sticky-menu-popover is-hidden",
    });
    this.buildMenuPopover(this.menuPopoverEl);

    const actions = this.headerEl.createDiv({ cls: "onenote-floating-header-actions" });

    // 1. Three Dots (...) Menu Button (Color, Opacity, Notes List)
    this.moreBtnEl = actions.createEl("button", {
      cls: "onenote-sticky-action-btn onenote-sticky-menu-btn",
      title: STICKY_NOTE_STRINGS.MENU_TOOLTIP,
    });
    setSvgContent(this.moreBtnEl, STICKY_NOTE_SVG_ICONS.MENU_DOTS);
    this.moreBtnEl.setAttribute("aria-label", STICKY_NOTE_STRINGS.MENU_TOOLTIP);
    this.moreBtnEl.setAttribute("aria-expanded", "false");
    this.moreBtnEl.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = this.menuPopoverEl.classList.toggle("is-hidden");
      this.moreBtnEl.setAttribute("aria-expanded", isHidden ? "false" : "true");
      if (!isHidden) {
        this.menuPopoverEl.style.top = `${POPOVER_OFFSETS.TOP_PX}px`;
        this.menuPopoverEl.style.right = `${POPOVER_OFFSETS.RIGHT_PX}px`;
      }
    });

    // 2. Pin in Front (Always on top) Button
    this.pinBtnEl = actions.createEl("button", {
      cls: `onenote-sticky-action-btn onenote-floating-pin-btn ${this.isPinned ? "is-active is-pinned" : ""}`,
      title: this.isPinned
        ? STICKY_NOTE_STRINGS.UNPIN_FRONT_TOOLTIP
        : STICKY_NOTE_STRINGS.PIN_FRONT_TOOLTIP,
    });
    setSvgContent(this.pinBtnEl, STICKY_NOTE_SVG_ICONS.PIN);
    this.pinBtnEl.setAttribute(
      "aria-label",
      this.isPinned
        ? STICKY_NOTE_ACCESSIBILITY_STRINGS.UNPIN_FROM_FRONT
        : STICKY_NOTE_ACCESSIBILITY_STRINGS.PIN_IN_FRONT
    );
    this.pinBtnEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.menuPopoverEl.classList.add("is-hidden");
      this.moreBtnEl.setAttribute("aria-expanded", "false");
      this.togglePinInFront();
    });

    // 3. Minimize Button (next to close button)
    this.minimizeBtnEl = actions.createEl("button", {
      cls: "onenote-sticky-action-btn onenote-floating-minimize-btn",
      title: STICKY_NOTE_STRINGS.MINIMIZE_TOOLTIP,
    });
    setSvgContent(this.minimizeBtnEl, STICKY_NOTE_SVG_ICONS.MINIMIZE);
    this.minimizeBtnEl.setAttribute("aria-label", STICKY_NOTE_STRINGS.MINIMIZE_TOOLTIP);
    this.minimizeBtnEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.menuPopoverEl.classList.add("is-hidden");
      this.moreBtnEl.setAttribute("aria-expanded", "false");
      this.minimizeWindow();
    });

    // 4. Close Button
    this.closeBtnEl = actions.createEl("button", {
      cls: "onenote-sticky-action-btn onenote-floating-close-btn",
      title: STICKY_NOTE_STRINGS.CLOSE_TOOLTIP,
    });
    setSvgContent(this.closeBtnEl, STICKY_NOTE_SVG_ICONS.CLOSE);
    this.closeBtnEl.setAttribute(
      "aria-label",
      STICKY_NOTE_ACCESSIBILITY_STRINGS.CLOSE_FLOATING_NOTE
    );
    this.closeBtnEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeWindow();
    });

    // Prevent redundant context menu on header
    this.headerEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  private buildBody(): void {
    this.bodyEl = this.rootContainerEl.createDiv({
      cls: "onenote-sticky-body onenote-floating-body",
    });
    this.bodyEl.contentEditable = "true";
    this.bodyEl.tabIndex = 0;
    this.bodyEl.setAttribute("data-placeholder", STICKY_NOTE_STRINGS.BODY_PLACEHOLDER);

    this.bodyEl.addEventListener("blur", () => {
      if (!this.note) return;
      const innerHtml = this.bodyEl.innerHTML || "";
      const directText = (this.bodyEl as any).innerText;
      let newContent = innerHtml;
      if (directText && !innerHtml.includes(directText) && !/<[a-z][\s\S]*>/i.test(directText)) {
        newContent = directText;
      }
      this.note = { ...this.note, content: newContent, modifiedTime: Date.now() };
      this.syncNoteToContext();
    });

    // Checklist toggling
    this.bodyEl.addEventListener("change", (e) => {
      if (!this.note) return;
      const target = e.target as HTMLElement;
      if (target && target.classList.contains("onenote-sticky-checkbox")) {
        const item = target.closest(".onenote-sticky-checklist-item");
        if ((target as HTMLInputElement).checked) {
          item?.classList.add("is-completed");
          target.setAttribute("checked", "checked");
        } else {
          item?.classList.remove("is-completed");
          target.removeAttribute("checked");
        }
        const newHtml = this.bodyEl.innerHTML || "";
        this.note = { ...this.note, content: newHtml, modifiedTime: Date.now() };
        this.syncNoteToContext();
      }
    });

    this.bodyEl.addEventListener("paste", (e: ClipboardEvent) => {
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file && file.type.startsWith("image/")) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              this.formatToolbar.insertImageSrc(reader.result);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    });

    this.bodyEl.addEventListener("click", (e) => {
      const linkEl = (e.target as HTMLElement)?.closest(".internal-link") as HTMLElement | null;
      if (linkEl) {
        const href = linkEl.getAttribute("data-href");
        if (href) {
          e.preventDefault();
          e.stopPropagation();
          const sourcePath = this.pageId
            ? PageContextManager.getInstance().getPageContext(this.pageId)?.markdownPath || ""
            : "";
          (this.app.workspace as any)?.openLinkText?.(href, sourcePath, false);
        }
      }
    });
  }

  private buildToolbar(): void {
    this.formatToolbar = new StickyNoteFormatToolbar({
      onMutate: () => {
        if (!this.note) return;
        const newHtml = this.bodyEl.innerHTML || "";
        this.note = { ...this.note, content: newHtml, modifiedTime: Date.now() };
        this.syncNoteToContext();
      },
    });
    this.formatToolbar.attachTo(this.bodyEl);
    this.rootContainerEl.appendChild(this.formatToolbar.el);
  }

  private buildFooter(): void {
    this.footerDateEl = this.rootContainerEl.createDiv({
      cls: "onenote-sticky-footer-date",
    });
  }

  private buildMenuPopover(popover: HTMLElement): void {
    popover.empty();

    // 1. Color Palette Section
    popover.createDiv({ cls: "onenote-menu-section-title", text: "Color" });
    const swatchRow = popover.createDiv({ cls: "onenote-swatch-row" });
    for (const p of STICKY_NOTE_COLOR_PRESETS) {
      const palette = STICKY_NOTE_PRESET_PALETTES[p];
      const swatch = swatchRow.createDiv({
        cls: `onenote-color-swatch onenote-color-${p} ${this.note?.color === p ? "is-active" : ""}`,
      });
      if (palette) {
        swatch.style.backgroundColor = palette.light.background;
        swatch.style.borderColor = palette.light.border;
      }
      swatch.setAttribute("role", "button");
      swatch.setAttribute(
        "aria-label",
        `${STICKY_NOTE_ACCESSIBILITY_STRINGS.COLOR_PRESET_PREFIX}${p}`
      );
      swatch.title = p;
      swatch.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!this.note) return;
        this.note = { ...this.note, color: p, modifiedTime: Date.now() };
        this.applyThemeColors();
        swatchRow
          .querySelectorAll(".onenote-color-swatch")
          .forEach((s) => s.classList.remove("is-active"));
        swatch.classList.add("is-active");
        this.syncNoteToContext();
      });
    }

    popover.createDiv({ cls: "onenote-menu-divider" });

    // 2. Opacity Section
    popover.createDiv({ cls: "onenote-menu-section-title", text: "Opacity" });
    const opacityCtrl = popover.createDiv({ cls: "onenote-sticky-opacity-control" });
    const currentOp = this.note?.opacity ?? 1.0;

    const opHeader = opacityCtrl.createDiv({ cls: "onenote-sticky-opacity-header" });
    opHeader.createSpan({ text: STICKY_NOTE_STRINGS.TRANSPARENCY_HEADER });
    opHeader.createSpan({
      cls: "onenote-sticky-op-val",
      text: `${Math.round(currentOp * 100)}%`,
    });

    const slider = opacityCtrl.createEl("input", {
      cls: "onenote-sticky-opacity-slider",
      type: "range",
    });
    slider.min = `${STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.MIN_OPACITY}`;
    slider.max = "1.0";
    slider.step = "0.05";
    slider.value = `${currentOp}`;

    slider.addEventListener("input", (e) => {
      e.stopPropagation();
      const val = parseFloat(slider.value);
      this.applyOpacity(val);
      const pctSpan = opHeader.querySelector(".onenote-sticky-op-val");
      if (pctSpan) pctSpan.textContent = `${Math.round(val * 100)}%`;
    });

    slider.addEventListener("change", (e) => {
      e.stopPropagation();
      if (!this.note) return;
      const val = parseFloat(slider.value);
      this.note = { ...this.note, opacity: val, modifiedTime: Date.now() };
      this.syncNoteToContext();
    });

    const chipRow = opacityCtrl.createDiv({ cls: "onenote-sticky-opacity-chips" });
    for (const p of OPACITY_PRESETS) {
      const chip = chipRow.createEl("button", {
        cls: `onenote-sticky-opacity-chip ${Math.abs(currentOp - p.val) < 0.05 ? "is-active" : ""}`,
        text: p.label,
      });
      chip.setAttribute("role", "button");
      chip.setAttribute(
        "aria-label",
        `${STICKY_NOTE_ACCESSIBILITY_STRINGS.SET_OPACITY_PREFIX}${p.label}`
      );
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!this.note) return;
        slider.value = `${p.val}`;
        const pctSpan = opHeader.querySelector(".onenote-sticky-op-val");
        if (pctSpan) pctSpan.textContent = p.label;
        this.applyOpacity(p.val);
        this.note = { ...this.note, opacity: p.val, modifiedTime: Date.now() };
        chipRow
          .querySelectorAll(".onenote-sticky-opacity-chip")
          .forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        this.syncNoteToContext();
      });
    }

    popover.createDiv({ cls: "onenote-menu-divider" });

    // 3. Notes List Button
    this.hubBtnEl = popover.createEl("button", {
      cls: "onenote-menu-item onenote-floating-hub-btn",
    });
    const iconSpan = this.hubBtnEl.createSpan({ cls: "onenote-menu-icon" });
    setSvgContent(iconSpan, STICKY_NOTE_SVG_ICONS.HUB_LIST);
    this.hubBtnEl.createSpan({ text: "Notes list" });
    this.hubBtnEl.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.OPEN_NOTES_LIST);
    this.hubBtnEl.addEventListener("click", (e) => {
      e.stopPropagation();
      popover.classList.add("is-hidden");
      if (this.moreBtnEl) this.moreBtnEl.setAttribute("aria-expanded", "false");
      new StickyNotesHubModal(this.app).open();
    });
  }

  /**
   * Safely retrieves the Electron BrowserWindow for this specific popout window.
   * STRICTLY returns null if this view is inside the main Obsidian window, preventing
   * any accidental manipulation of the main application window.
   */
  private getPopoutBrowserWindow(): any {
    const doc = this.contentEl.ownerDocument;
    const childWin = doc?.defaultView;
    // If not in a popout window context, NEVER return a BrowserWindow
    if (!childWin || childWin === window || doc === document) {
      return null;
    }

    try {
      // Safe check for electron remote without filesystem crawling
      const electron = typeof window !== "undefined" ? (window as any).require?.("electron") : null;
      if (electron?.remote?.BrowserWindow) {
        const allWins = electron.remote.BrowserWindow.getAllWindows();
        const mainWin = electron.remote.getCurrentWindow?.();

        // Filter out the main Obsidian window immediately
        const popoutWins = allWins.filter((bw: any) => !mainWin || bw.id !== mainWin.id);
        if (popoutWins.length === 0) return null;

        // Match by unique noteId in document/window title if present
        if (this.noteId) {
          const match = popoutWins.find((bw: any) => {
            const title = bw.getTitle?.() || "";
            return title.includes(this.noteId);
          });
          if (match) return match;
        }

        // If exactly one non-main popout window exists, use it
        if (popoutWins.length === 1) {
          return popoutWins[0];
        }
      }
    } catch {
      // Non-electron/fallback
    }
    return null;
  }

  public minimizeWindow(): void {
    try {
      const popoutBW = this.getPopoutBrowserWindow();
      if (popoutBW?.minimize) {
        popoutBW.minimize();
        return;
      }
    } catch {}
    this.toggleCompactMinimize();
  }

  public toggleCompactMinimize(): void {
    this.isMinimized = !this.isMinimized;
    this.rootContainerEl.classList.toggle("is-minimized", this.isMinimized);
  }

  public closeWindow(): void {
    this.persistWindowBounds();
    try {
      this.leaf.detach();
      return;
    } catch {}

    try {
      const doc = this.contentEl.ownerDocument;
      const win = doc?.defaultView;
      if (win && typeof win.close === "function" && win !== window) {
        win.close();
      }
    } catch {}
  }

  public togglePinInFront(): void {
    this.isPinned = !this.isPinned;
    if (this.note) {
      this.note = { ...this.note, isPinned: this.isPinned, modifiedTime: Date.now() };
    }
    this.updatePinStyle();
    this.syncNoteToContext();
  }

  public updatePinStyle(): void {
    if (!this.pinBtnEl || !this.rootContainerEl) return;
    if (this.isPinned) {
      this.rootContainerEl.classList.add("is-pinned-in-front");
      this.pinBtnEl.classList.add("is-active", "is-pinned");
      this.pinBtnEl.title = STICKY_NOTE_STRINGS.UNPIN_FRONT_TOOLTIP;
      this.pinBtnEl.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.UNPIN_FROM_FRONT);
      this.rootContainerEl.style.zIndex = `${FLOATING_WINDOW_METRICS.PINNED_Z_INDEX}`;
    } else {
      this.rootContainerEl.classList.remove("is-pinned-in-front");
      this.pinBtnEl.classList.remove("is-active", "is-pinned");
      this.pinBtnEl.title = STICKY_NOTE_STRINGS.PIN_FRONT_TOOLTIP;
      this.pinBtnEl.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.PIN_IN_FRONT);
      this.rootContainerEl.style.zIndex = `${FLOATING_WINDOW_METRICS.BASE_Z_INDEX}`;
    }

    // Only set always-on-top on the specific popout window, NEVER on the main Obsidian window!
    const popoutBW = this.getPopoutBrowserWindow();
    if (popoutBW?.setAlwaysOnTop) {
      popoutBW.setAlwaysOnTop(this.isPinned, "screen-saver");
    }
  }

  public applyOpacity(val: number): void {
    if (!this.rootContainerEl) return;
    const clampedVal = Math.max(STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.MIN_OPACITY, Math.min(1.0, val));
    this.rootContainerEl.style.opacity = `${clampedVal}`;
    if (clampedVal < 1.0) {
      this.rootContainerEl.classList.add("onenote-sticky-backdrop-blur");
    } else {
      this.rootContainerEl.classList.remove("onenote-sticky-backdrop-blur");
    }

    // Apply OS-level window opacity strictly to the child popout window (never main Obsidian window)
    const popoutBW = this.getPopoutBrowserWindow();
    if (popoutBW && typeof popoutBW.setOpacity === "function") {
      try {
        popoutBW.setOpacity(clampedVal);
      } catch {}
    }
  }

  private updateViewFromNote(): void {
    if (!this.note) return;

    this.isPinned = !!this.note.isPinned;

    const doc = this.contentEl.ownerDocument || (typeof document !== "undefined" ? document : null);
    const isTitleFocused = !!(doc && doc.activeElement === this.titleInputEl);
    if (this.titleInputEl && !isTitleFocused) {
      this.titleInputEl.value = this.note.title || "";
    }

    const isBodyFocused = !!(
      doc &&
      (doc.activeElement === this.bodyEl || this.bodyEl?.contains(doc.activeElement))
    );
    if (this.bodyEl && !isBodyFocused) {
      const targetHtml =
        this.note.content && this.note.content.trim().startsWith("<")
          ? this.note.content
          : this.note.content
            ? `<p>${this.note.content}</p>`
            : "";
      if (this.bodyEl.innerHTML !== targetHtml) {
        setSanitizedHtml(this.bodyEl, targetHtml);
      }
    }

    if (this.footerDateEl && this.note.modifiedTime) {
      this.footerDateEl.textContent = new Date(this.note.modifiedTime).toLocaleTimeString(
        undefined,
        { hour: "numeric", minute: "2-digit" }
      );
    }

    this.applyThemeColors();
    this.applyOpacity(this.note.opacity ?? 1.0);
    this.updatePinStyle();
  }

  public dockToCanvas(): void {
    if (!this.noteId) return;
    this.persistWindowBounds();
    FloatingStickyNoteManager.getInstance().dockNote(this.noteId, this.pageId);
    this.leaf.detach();
  }

  private persistWindowBounds(): void {
    if (!this.note) return;

    // Read popout window coordinate metrics
    const win =
      this.contentEl.ownerDocument?.defaultView || (typeof window !== "undefined" ? window : null);
    if (win) {
      const bounds: SpatialBounds = {
        x: win.screenX ?? 100,
        y: win.screenY ?? 100,
        width: Math.max(
          FLOATING_WINDOW_METRICS.MIN_WIDTH,
          win.outerWidth || FLOATING_WINDOW_METRICS.DEFAULT_WIDTH
        ),
        height: Math.max(
          FLOATING_WINDOW_METRICS.MIN_HEIGHT,
          win.outerHeight || FLOATING_WINDOW_METRICS.DEFAULT_HEIGHT
        ),
        zIndex: FLOATING_WINDOW_METRICS.BASE_Z_INDEX,
      };

      this.note = {
        ...this.note,
        spatialMeta: {
          ...this.note.spatialMeta,
          floatingBounds: bounds,
          isPoppedOut: false,
        },
      };
      this.syncNoteToContext();
    }
  }

  private syncNoteToContext(): void {
    if (!this.note || !this.pageId) return;
    FloatingStickyNoteManager.getInstance().syncNoteState(this.app, this.pageId, this.note);
  }

  private setupThemeObserver(): void {
    if (
      typeof MutationObserver !== "undefined" &&
      typeof document !== "undefined" &&
      document.body
    ) {
      this.themeObserver = new MutationObserver(() => {
        this.applyThemeColors();
      });
      this.themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
  }

  private setupWindowListeners(): void {
    const doc = this.contentEl.ownerDocument;
    const win = doc?.defaultView || (typeof window !== "undefined" ? window : null);
    if (win) {
      if (win !== window && this.noteId && doc) {
        doc.title = `Quick Note - ${this.note?.title || "Untitled"} [sn:${this.noteId}]`;
      }
      this.resizeListener = () => {
        this.persistWindowBounds();
      };
      win.addEventListener("resize", this.resizeListener);
      win.addEventListener("keydown", (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          this.dockToCanvas();
        }
      });
    }
  }
}
