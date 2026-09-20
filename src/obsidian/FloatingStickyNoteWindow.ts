import { SpatialBounds } from "../geometry/Bounds";
import { CanonicalStickyNote } from "../model/CanonicalStickyNote";
import { StickyNoteId, PageId } from "../model/Ids";
import { StickyNoteUtils, STICKY_NOTE_PRESET_PALETTES } from "../model/StickyNoteUtils";
import {
  FLOATING_WINDOW_METRICS,
  STICKY_NOTE_COLOR_PRESETS,
  STICKY_NOTE_STRINGS,
  STICKY_NOTE_ACCESSIBILITY_STRINGS,
  STICKY_NOTE_SVG_ICONS,
  STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT,
  OPACITY_PRESETS,
  POPOVER_OFFSETS,
} from "../constants/StickyNoteConstants";
import { StickyNoteFormatToolbar } from "../editor/text/StickyNoteFormatToolbar";
import { FloatingStickyNoteManager } from "./FloatingStickyNoteManager";
import { emptyElement, setSvgContent, setSanitizedHtml } from "../dom/DomUtils";

export interface FloatingStickyNoteCallbacks {
  onContentChange?: (noteId: StickyNoteId, newContent: string) => void;
  onTitleChange?: (noteId: StickyNoteId, newTitle: string) => void;
  onStyleChange?: (noteId: StickyNoteId, style: { color?: string; opacity?: number }) => void;
  onBoundsChange?: (noteId: StickyNoteId, bounds: SpatialBounds) => void;
  onDock?: (noteId: StickyNoteId, pageId?: PageId) => void;
  onClose?: (noteId: StickyNoteId) => void;
  onDelete?: (noteId: StickyNoteId) => void;
  onNewNote?: (sourceNoteId: StickyNoteId) => void;
  onOpenHub?: () => void;
  onWikilinkClick?: (linkText: string) => void;
  onPopoutToDesktop?: (noteId: StickyNoteId) => void;
}

export class FloatingStickyNoteWindow {
  private static topZIndex = FLOATING_WINDOW_METRICS.BASE_Z_INDEX;

  public readonly noteId: StickyNoteId;
  public readonly pageId?: PageId;
  private note: CanonicalStickyNote;
  private callbacks: FloatingStickyNoteCallbacks;

  // DOM Elements
  public containerEl!: HTMLElement;
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
  private isMinimized = false;
  private currentBounds: SpatialBounds;

  // Dragging state
  private isDragging = false;
  private dragStartPointer = { x: 0, y: 0 };
  private dragStartPos = { x: 0, y: 0 };

  // Resizing state
  private isResizing = false;
  private resizeHandle = "";
  private resizeStartPointer = { x: 0, y: 0 };
  private resizeStartBounds: SpatialBounds = { x: 0, y: 0, width: 0, height: 0, zIndex: 0 };

  // RAF Animation Frame state for 60/120Hz batching
  private rafId: number | null = null;

  // Window-level event listeners for cleanup
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;

  constructor(
    note: CanonicalStickyNote,
    pageId?: PageId,
    callbacks: FloatingStickyNoteCallbacks = {},
    initialBounds?: SpatialBounds
  ) {
    this.note = note;
    this.noteId = note.id;
    this.pageId = pageId;
    this.callbacks = callbacks;

    // Calculate default floating window position
    const saved = note.spatialMeta?.floatingBounds || initialBounds;
    const defaultX =
      typeof window !== "undefined"
        ? Math.max(
            FLOATING_WINDOW_METRICS.VIEWPORT_MARGIN,
            window.innerWidth - FLOATING_WINDOW_METRICS.DEFAULT_OFFSET_RIGHT
          )
        : 100;
    const defaultY =
      typeof window !== "undefined" ? FLOATING_WINDOW_METRICS.DEFAULT_OFFSET_TOP : 100;

    this.isPinned = !!(note as any).isPinned;

    this.currentBounds = {
      x: saved?.x ?? defaultX,
      y: saved?.y ?? defaultY,
      width: Math.max(
        FLOATING_WINDOW_METRICS.MIN_WIDTH,
        saved?.width ?? FLOATING_WINDOW_METRICS.DEFAULT_WIDTH
      ),
      height: Math.max(
        FLOATING_WINDOW_METRICS.MIN_HEIGHT,
        saved?.height ?? FLOATING_WINDOW_METRICS.DEFAULT_HEIGHT
      ),
      zIndex: this.isPinned
        ? FLOATING_WINDOW_METRICS.PINNED_Z_INDEX
        : ++FloatingStickyNoteWindow.topZIndex,
    };

    this.boundPointerMove = this.onWindowPointerMove.bind(this);
    this.boundPointerUp = this.onWindowPointerUp.bind(this);

    this.buildDOM();
  }

  public mount(parentEl: HTMLElement = document.body): void {
    parentEl.appendChild(this.containerEl);
    this.updatePinStyle();
    this.focus();
  }

  public unmount(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (typeof window !== "undefined") {
      window.removeEventListener("pointermove", this.boundPointerMove);
      window.removeEventListener("pointerup", this.boundPointerUp);
    }
    if (this.containerEl.parentElement) {
      this.containerEl.parentElement.removeChild(this.containerEl);
    }
  }

  public destroy(): void {
    this.unmount();
  }

  public focus(): void {
    if (this.isPinned) {
      this.containerEl.style.zIndex = `${FLOATING_WINDOW_METRICS.PINNED_Z_INDEX}`;
      return;
    }
    const nextZ = ++FloatingStickyNoteWindow.topZIndex;
    this.currentBounds = { ...this.currentBounds, zIndex: nextZ };
    this.containerEl.style.zIndex = `${nextZ}`;
  }

  public getBounds(): SpatialBounds {
    return { ...this.currentBounds };
  }

  public getNote(): CanonicalStickyNote {
    return this.note;
  }

  public updateNote(updatedNote: CanonicalStickyNote): void {
    this.note = updatedNote;

    const doc =
      this.containerEl.ownerDocument || (typeof document !== "undefined" ? document : null);
    const isTitleFocused = !!(doc && doc.activeElement === this.titleInputEl);
    if (this.titleInputEl && !isTitleFocused) {
      this.titleInputEl.value = updatedNote.title || "";
    }

    const isBodyFocused = !!(
      doc &&
      (doc.activeElement === this.bodyEl || this.bodyEl?.contains(doc.activeElement))
    );
    if (this.bodyEl && !isBodyFocused) {
      const targetHtml =
        updatedNote.content && updatedNote.content.trim().startsWith("<")
          ? updatedNote.content
          : updatedNote.content
            ? `<p>${updatedNote.content}</p>`
            : "";
      if (this.bodyEl.innerHTML !== targetHtml) {
        setSanitizedHtml(this.bodyEl, targetHtml);
      }
    }

    if (this.footerDateEl && updatedNote.modifiedTime) {
      this.footerDateEl.textContent = new Date(updatedNote.modifiedTime).toLocaleTimeString(
        undefined,
        {
          hour: "numeric",
          minute: "2-digit",
        }
      );
    }

    if (updatedNote.isPinned !== undefined) {
      this.isPinned = !!updatedNote.isPinned;
      this.updatePinStyle();
    }

    this.applyThemeColors();
    this.applyOpacity(updatedNote.opacity ?? 1.0);
  }

  public applyThemeColors(): void {
    const isDark =
      typeof document !== "undefined" &&
      (document.body?.classList?.contains("theme-dark") ||
        document.documentElement?.classList?.contains("theme-dark"));
    const colorPreset = this.note.color || "yellow";
    const colors = StickyNoteUtils.resolveStickyNoteColors(colorPreset, this.note.theme, isDark);

    this.containerEl.style.backgroundColor = colors.background;
    this.containerEl.style.color = colors.text;
    this.containerEl.style.borderColor = colors.border;
    this.headerEl.style.backgroundColor = colors.header;
  }

  private buildDOM(): void {
    this.containerEl = document.createElement("div");
    this.containerEl.className = "onenote-floating-window";
    this.containerEl.id = `floating-sticky-${this.noteId}`;
    this.containerEl.setAttribute("role", "dialog");
    this.containerEl.setAttribute("aria-modal", "false");
    this.containerEl.setAttribute(
      "aria-label",
      `Floating Sticky Note: ${this.note.title || "Untitled"}`
    );
    this.containerEl.tabIndex = -1;

    this.updatePositionStyle();

    // Bring to front on pointerdown
    this.containerEl.addEventListener("pointerdown", () => this.focus());

    // Keyboard Shortcuts (Escape to minimize/close, Ctrl+Enter to dock, Ctrl+S to save)
    this.containerEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.toggleMinimize();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onDock) {
          this.callbacks.onDock(this.noteId, this.pageId);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
        FloatingStickyNoteManager.getInstance().flushPendingSaves();
      }
    });

    // 1. Header (Drag Handle + Title + Window Controls)
    this.headerEl = document.createElement("div");
    this.headerEl.className = "onenote-floating-header";

    const left = document.createElement("div");
    left.className = "onenote-floating-header-left";

    // OneNote Top-Left "+" New Note Button
    const newNoteBtn = document.createElement("button");
    newNoteBtn.className = "onenote-sticky-action-btn onenote-sticky-new-btn";
    newNoteBtn.title = STICKY_NOTE_STRINGS.NEW_NOTE_TOOLTIP;
    newNoteBtn.setAttribute("aria-label", STICKY_NOTE_STRINGS.NEW_NOTE_TOOLTIP);
    setSvgContent(newNoteBtn, STICKY_NOTE_SVG_ICONS.PLUS);
    newNoteBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    newNoteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.callbacks.onNewNote) {
        this.callbacks.onNewNote(this.noteId);
      }
    });
    left.appendChild(newNoteBtn);

    const dots = document.createElement("span");
    dots.className = "onenote-sticky-grab-dots";
    setSvgContent(dots, STICKY_NOTE_SVG_ICONS.GRAB_DOTS);
    dots.setAttribute("aria-hidden", "true");
    left.appendChild(dots);

    this.titleInputEl = document.createElement("input");
    this.titleInputEl.className = "onenote-floating-title-input";
    this.titleInputEl.value = this.note.title || "";
    this.titleInputEl.placeholder = STICKY_NOTE_STRINGS.TITLE_PLACEHOLDER;
    this.titleInputEl.setAttribute(
      "aria-label",
      STICKY_NOTE_ACCESSIBILITY_STRINGS.FLOATING_NOTE_TITLE
    );
    this.titleInputEl.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.titleInputEl.addEventListener("change", () => {
      const newTitle = this.titleInputEl.value.trim();
      this.note = { ...this.note, title: newTitle };
      if (this.callbacks.onTitleChange) {
        this.callbacks.onTitleChange(this.noteId, newTitle);
      }
    });
    left.appendChild(this.titleInputEl);
    this.headerEl.appendChild(left);

    // Header dragging
    this.headerEl.addEventListener("pointerdown", (e) => this.onHeaderPointerDown(e));

    // Popover element attached to container
    this.menuPopoverEl = document.createElement("div");
    this.menuPopoverEl.className = "onenote-sticky-popover onenote-sticky-menu-popover is-hidden";
    this.buildMenuPopover(this.menuPopoverEl);
    this.containerEl.appendChild(this.menuPopoverEl);

    // Header Actions: [ ... ] -> [ 📌 ] -> [ — ] -> [ ✕ ]
    const actions = document.createElement("div");
    actions.className = "onenote-floating-header-actions";

    // 1. Three Dots (...) Menu Button (Color, Opacity, Notes List)
    this.moreBtnEl = document.createElement("button");
    this.moreBtnEl.className = "onenote-sticky-action-btn onenote-sticky-menu-btn";
    this.moreBtnEl.title = STICKY_NOTE_STRINGS.MENU_TOOLTIP;
    this.moreBtnEl.setAttribute("aria-label", STICKY_NOTE_STRINGS.MENU_TOOLTIP);
    this.moreBtnEl.setAttribute("aria-expanded", "false");
    setSvgContent(this.moreBtnEl, STICKY_NOTE_SVG_ICONS.MENU_DOTS);
    this.moreBtnEl.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.moreBtnEl.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = this.menuPopoverEl.classList.toggle("is-hidden");
      this.moreBtnEl.setAttribute("aria-expanded", isHidden ? "false" : "true");
      if (!isHidden) {
        this.menuPopoverEl.style.top = `${POPOVER_OFFSETS.TOP_PX}px`;
        this.menuPopoverEl.style.right = `${POPOVER_OFFSETS.RIGHT_PX}px`;
      }
    });
    actions.appendChild(this.moreBtnEl);

    // 2. Pin in Front (Always on top) Button
    this.pinBtnEl = document.createElement("button");
    this.pinBtnEl.className = `onenote-sticky-action-btn onenote-floating-pin-btn ${this.isPinned ? "is-active is-pinned" : ""}`;
    this.pinBtnEl.title = this.isPinned
      ? STICKY_NOTE_STRINGS.UNPIN_FRONT_TOOLTIP
      : STICKY_NOTE_STRINGS.PIN_FRONT_TOOLTIP;
    this.pinBtnEl.setAttribute(
      "aria-label",
      this.isPinned
        ? STICKY_NOTE_ACCESSIBILITY_STRINGS.UNPIN_FROM_FRONT
        : STICKY_NOTE_ACCESSIBILITY_STRINGS.PIN_IN_FRONT
    );
    setSvgContent(this.pinBtnEl, STICKY_NOTE_SVG_ICONS.PIN);
    this.pinBtnEl.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.pinBtnEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.menuPopoverEl.classList.add("is-hidden");
      this.moreBtnEl.setAttribute("aria-expanded", "false");
      this.togglePinInFront();
    });
    actions.appendChild(this.pinBtnEl);

    // 3. Minimize Button (next to close button)
    this.minimizeBtnEl = document.createElement("button");
    this.minimizeBtnEl.className = "onenote-sticky-action-btn onenote-floating-minimize-btn";
    this.minimizeBtnEl.title = STICKY_NOTE_STRINGS.MINIMIZE_TOOLTIP;
    this.minimizeBtnEl.setAttribute("aria-label", STICKY_NOTE_STRINGS.MINIMIZE_TOOLTIP);
    setSvgContent(this.minimizeBtnEl, STICKY_NOTE_SVG_ICONS.MINIMIZE);
    this.minimizeBtnEl.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.minimizeBtnEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.menuPopoverEl.classList.add("is-hidden");
      this.moreBtnEl.setAttribute("aria-expanded", "false");
      this.toggleMinimize();
    });
    actions.appendChild(this.minimizeBtnEl);

    // 4. Close Button
    this.closeBtnEl = document.createElement("button");
    this.closeBtnEl.className = "onenote-sticky-action-btn onenote-floating-close-btn";
    this.closeBtnEl.title = STICKY_NOTE_STRINGS.CLOSE_TOOLTIP;
    this.closeBtnEl.setAttribute(
      "aria-label",
      STICKY_NOTE_ACCESSIBILITY_STRINGS.CLOSE_FLOATING_NOTE
    );
    setSvgContent(this.closeBtnEl, STICKY_NOTE_SVG_ICONS.CLOSE);
    this.closeBtnEl.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.closeBtnEl.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.callbacks.onClose) {
        this.callbacks.onClose(this.noteId);
      }
    });
    actions.appendChild(this.closeBtnEl);

    // Prevent redundant context menu on header
    this.headerEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    this.headerEl.appendChild(actions);
    this.containerEl.appendChild(this.headerEl);

    // 2. Body (ContentEditable)
    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "onenote-sticky-body onenote-floating-body";
    this.bodyEl.contentEditable = "true";
    this.bodyEl.tabIndex = 0;
    this.bodyEl.setAttribute("data-placeholder", STICKY_NOTE_STRINGS.BODY_PLACEHOLDER);
    const initialContent = this.note.content
      ? this.note.content.trim().startsWith("<")
        ? this.note.content
        : `<p>${this.note.content}</p>`
      : "";
    setSanitizedHtml(this.bodyEl, initialContent);

    this.bodyEl.addEventListener("blur", () => {
      const innerHtml = this.bodyEl.innerHTML || "";
      const directText = (this.bodyEl as any).innerText;
      let newContent = innerHtml;
      if (directText && !innerHtml.includes(directText) && !/<[a-z][\s\S]*>/i.test(directText)) {
        newContent = directText;
      }
      this.note = { ...this.note, content: newContent };
      if (this.callbacks.onContentChange) {
        this.callbacks.onContentChange(this.noteId, newContent);
      }
    });

    this.bodyEl.addEventListener("paste", (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
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
        if (href && this.callbacks.onWikilinkClick) {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.onWikilinkClick(href);
        }
      }
    });

    // Checklist item checkbox state change delegation
    this.bodyEl.addEventListener("change", (e) => {
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
        this.note = { ...this.note, content: newHtml };
        if (this.callbacks.onContentChange) {
          this.callbacks.onContentChange(this.noteId, newHtml);
        }
      }
    });

    this.containerEl.appendChild(this.bodyEl);

    // 3. OneNote Bottom Format Toolbar
    this.formatToolbar = new StickyNoteFormatToolbar({
      onMutate: () => {
        const newHtml = this.bodyEl.innerHTML || "";
        this.note = { ...this.note, content: newHtml };
        if (this.callbacks.onContentChange) {
          this.callbacks.onContentChange(this.noteId, newHtml);
        }
      },
    });
    this.formatToolbar.attachTo(this.bodyEl);
    this.containerEl.appendChild(this.formatToolbar.el);

    // 4. Footer Date/Time
    this.footerDateEl = document.createElement("div");
    this.footerDateEl.className = "onenote-sticky-footer-date";
    const dateStr = this.note.modifiedTime
      ? new Date(this.note.modifiedTime).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })
      : "";
    this.footerDateEl.textContent = dateStr;
    this.containerEl.appendChild(this.footerDateEl);

    // 5. Resize handles
    const handles = ["se", "e", "s"];
    for (const h of handles) {
      const r = document.createElement("div");
      r.className = `onenote-sticky-resizer onenote-sticky-resizer-handle onenote-sticky-resizer-${h}`;
      r.addEventListener("pointerdown", (e) => this.onResizePointerDown(e, h));
      this.containerEl.appendChild(r);
    }

    this.applyThemeColors();
    this.applyOpacity(this.note.opacity ?? 1.0);
    this.updatePinStyle();
  }

  public togglePinInFront(): void {
    this.isPinned = !this.isPinned;
    this.note = { ...this.note, isPinned: this.isPinned };
    this.updatePinStyle();
    if (this.callbacks.onStyleChange) {
      this.callbacks.onStyleChange(this.noteId, { isPinned: this.isPinned } as any);
    }
  }

  public updatePinStyle(): void {
    if (!this.pinBtnEl) return;
    if (this.isPinned) {
      this.containerEl.classList.add("is-pinned-in-front");
      this.pinBtnEl.classList.add("is-active", "is-pinned");
      this.pinBtnEl.title = STICKY_NOTE_STRINGS.UNPIN_FRONT_TOOLTIP;
      this.pinBtnEl.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.UNPIN_FROM_FRONT);
      this.containerEl.style.zIndex = `${FLOATING_WINDOW_METRICS.PINNED_Z_INDEX}`;
    } else {
      this.containerEl.classList.remove("is-pinned-in-front");
      this.pinBtnEl.classList.remove("is-active", "is-pinned");
      this.pinBtnEl.title = STICKY_NOTE_STRINGS.PIN_FRONT_TOOLTIP;
      this.pinBtnEl.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.PIN_IN_FRONT);
      this.containerEl.style.zIndex = `${this.currentBounds.zIndex}`;
    }
  }

  public toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
    this.containerEl.classList.toggle("is-minimized", this.isMinimized);
  }

  private applyOpacity(val: number): void {
    const clampedVal = Math.max(STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.MIN_OPACITY, Math.min(1.0, val));
    this.containerEl.style.opacity = `${clampedVal}`;
    if (clampedVal < 1.0) {
      this.containerEl.classList.add("onenote-sticky-backdrop-blur");
    } else {
      this.containerEl.classList.remove("onenote-sticky-backdrop-blur");
    }
  }

  private updatePositionStyle(): void {
    this.containerEl.style.left = `${this.currentBounds.x}px`;
    this.containerEl.style.top = `${this.currentBounds.y}px`;
    this.containerEl.style.width = `${this.currentBounds.width}px`;
    this.containerEl.style.height = `${this.currentBounds.height}px`;
  }

  private scheduleRender(): void {
    if (this.rafId === null) {
      if (typeof requestAnimationFrame !== "undefined") {
        this.rafId = requestAnimationFrame(() => {
          this.updatePositionStyle();
          this.rafId = null;
        });
      } else {
        this.updatePositionStyle();
      }
    }
  }

  // --- Dragging Handlers with Magnetic Snap & RAF ---

  private onHeaderPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.isDragging = true;
    this.dragStartPointer = { x: e.clientX, y: e.clientY };
    this.dragStartPos = { x: this.currentBounds.x, y: this.currentBounds.y };
    this.containerEl.classList.add("is-dragging");

    if (typeof window !== "undefined") {
      window.addEventListener("pointermove", this.boundPointerMove);
      window.addEventListener("pointerup", this.boundPointerUp);
    }
    e.preventDefault();
  }

  private onResizePointerDown(e: PointerEvent, handle: string): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    this.isResizing = true;
    this.resizeHandle = handle;
    this.resizeStartPointer = { x: e.clientX, y: e.clientY };
    this.resizeStartBounds = { ...this.currentBounds };
    this.containerEl.classList.add("is-resizing");

    if (typeof window !== "undefined") {
      window.addEventListener("pointermove", this.boundPointerMove);
      window.addEventListener("pointerup", this.boundPointerUp);
    }
  }

  private onWindowPointerMove(e: PointerEvent): void {
    if (this.isDragging) {
      const dx = e.clientX - this.dragStartPointer.x;
      const dy = e.clientY - this.dragStartPointer.y;

      let nextX = this.dragStartPos.x + dx;
      let nextY = this.dragStartPos.y + dy;

      // Viewport boundary handling & Magnetic edge snapping
      if (typeof window !== "undefined") {
        const snapThreshold = FLOATING_WINDOW_METRICS.MAGNETIC_SNAP_THRESHOLD;
        const margin = FLOATING_WINDOW_METRICS.VIEWPORT_MARGIN;

        // Snap left
        if (Math.abs(nextX - margin) <= snapThreshold) {
          nextX = margin;
        }

        // Snap right
        const maxRight = window.innerWidth - this.currentBounds.width - margin;
        if (Math.abs(nextX - maxRight) <= snapThreshold) {
          nextX = maxRight;
        }

        // Snap top
        if (Math.abs(nextY - margin) <= snapThreshold) {
          nextY = margin;
        }

        // Snap bottom
        const maxBottom = window.innerHeight - FLOATING_WINDOW_METRICS.TASKBAR_BOTTOM_MARGIN;
        if (Math.abs(nextY - maxBottom) <= snapThreshold) {
          nextY = maxBottom;
        }

        // Screen-wide movement: Ensure at least MIN_VISIBLE_EDGE_PX remains visible so the user never loses the note,
        // but allow freely dragging across the entire screen over sidebars, ribbon, status bar, and monitor edges.
        const minVisible = FLOATING_WINDOW_METRICS.MIN_VISIBLE_EDGE_PX;
        const minX = -this.currentBounds.width + minVisible;
        const maxX = window.innerWidth - minVisible;
        const minY = margin;
        const maxY = window.innerHeight - minVisible;

        nextX = Math.max(minX, Math.min(maxX, nextX));
        nextY = Math.max(minY, Math.min(maxY, nextY));
      }

      this.currentBounds = {
        ...this.currentBounds,
        x: nextX,
        y: nextY,
      };
      this.scheduleRender();
    } else if (this.isResizing) {
      const dx = e.clientX - this.resizeStartPointer.x;
      const dy = e.clientY - this.resizeStartPointer.y;

      let w = this.resizeStartBounds.width;
      let h = this.resizeStartBounds.height;

      if (this.resizeHandle.includes("e")) {
        w = Math.max(FLOATING_WINDOW_METRICS.MIN_WIDTH, this.resizeStartBounds.width + dx);
      }
      if (this.resizeHandle.includes("s")) {
        h = Math.max(FLOATING_WINDOW_METRICS.MIN_HEIGHT, this.resizeStartBounds.height + dy);
      }

      this.currentBounds = {
        ...this.currentBounds,
        width: w,
        height: h,
      };
      this.scheduleRender();
    }
  }

  private onWindowPointerUp(_e: PointerEvent): void {
    if (this.isDragging || this.isResizing) {
      this.isDragging = false;
      this.isResizing = false;
      this.containerEl.classList.remove("is-dragging", "is-resizing");

      if (this.rafId !== null && typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.updatePositionStyle();

      if (typeof window !== "undefined") {
        window.removeEventListener("pointermove", this.boundPointerMove);
        window.removeEventListener("pointerup", this.boundPointerUp);
      }

      if (this.callbacks.onBoundsChange) {
        this.callbacks.onBoundsChange(this.noteId, this.getBounds());
      }
    }
  }

  // --- Popover: Unified Menu (Color Palette, Opacity, Notes List) ---

  private buildMenuPopover(popover: HTMLElement): void {
    emptyElement(popover);

    // 1. Color Palette Section
    const colorTitle = document.createElement("div");
    colorTitle.className = "onenote-menu-section-title";
    colorTitle.textContent = "Color";
    popover.appendChild(colorTitle);

    const swatchRow = document.createElement("div");
    swatchRow.className = "onenote-swatch-row";
    for (const p of STICKY_NOTE_COLOR_PRESETS) {
      const palette = STICKY_NOTE_PRESET_PALETTES[p];
      const swatch = document.createElement("div");
      swatch.className = `onenote-color-swatch onenote-color-${p} ${this.note.color === p ? "is-active" : ""}`;
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
      swatch.setAttribute("tabindex", "0");
      swatch.addEventListener("click", (e) => {
        e.stopPropagation();
        this.note = { ...this.note, color: p };
        this.applyThemeColors();
        swatchRow
          .querySelectorAll(".onenote-color-swatch")
          .forEach((s) => s.classList.remove("is-active"));
        swatch.classList.add("is-active");
        if (this.callbacks.onStyleChange) {
          this.callbacks.onStyleChange(this.noteId, { color: p });
        }
      });
      swatchRow.appendChild(swatch);
    }
    popover.appendChild(swatchRow);

    const divider1 = document.createElement("div");
    divider1.className = "onenote-menu-divider";
    popover.appendChild(divider1);

    // 2. Opacity Section
    const opacityTitle = document.createElement("div");
    opacityTitle.className = "onenote-menu-section-title";
    opacityTitle.textContent = "Opacity";
    popover.appendChild(opacityTitle);

    const opacityCtrl = document.createElement("div");
    opacityCtrl.className = "onenote-sticky-opacity-control";

    const currentOp = this.note.opacity ?? 1.0;
    const opHeader = document.createElement("div");
    opHeader.className = "onenote-sticky-opacity-header";
    const titleSpan = document.createElement("span");
    titleSpan.textContent = STICKY_NOTE_STRINGS.TRANSPARENCY_HEADER;
    const valSpan = document.createElement("span");
    valSpan.className = "onenote-sticky-op-val";
    valSpan.textContent = `${Math.round(currentOp * 100)}%`;
    opHeader.appendChild(titleSpan);
    opHeader.appendChild(valSpan);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.OPACITY_SLIDER_MIN;
    slider.max = STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.OPACITY_SLIDER_MAX;
    slider.step = STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.OPACITY_SLIDER_STEP;
    slider.value = `${currentOp}`;
    slider.className = "onenote-sticky-opacity-slider";

    slider.addEventListener("input", (e) => {
      e.stopPropagation();
      const val = parseFloat(slider.value);
      this.applyOpacity(val);
      const pctSpan = opHeader.querySelector(".onenote-sticky-op-val");
      if (pctSpan) pctSpan.textContent = `${Math.round(val * 100)}%`;
    });

    slider.addEventListener("change", (e) => {
      e.stopPropagation();
      const val = parseFloat(slider.value);
      this.note = { ...this.note, opacity: val };
      if (this.callbacks.onStyleChange) {
        this.callbacks.onStyleChange(this.noteId, { opacity: val });
      }
    });

    const chipRow = document.createElement("div");
    chipRow.className = "onenote-sticky-opacity-chips";
    for (const p of OPACITY_PRESETS) {
      const chip = document.createElement("button");
      chip.className = `onenote-sticky-opacity-chip ${Math.abs(currentOp - p.val) < 0.05 ? "is-active" : ""}`;
      chip.textContent = p.label;
      chip.setAttribute("role", "button");
      chip.setAttribute(
        "aria-label",
        `${STICKY_NOTE_ACCESSIBILITY_STRINGS.SET_OPACITY_PREFIX}${p.label}`
      );
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        slider.value = `${p.val}`;
        const pctSpan = opHeader.querySelector(".onenote-sticky-op-val");
        if (pctSpan) pctSpan.textContent = p.label;
        this.applyOpacity(p.val);
        this.note = { ...this.note, opacity: p.val };
        chipRow
          .querySelectorAll(".onenote-sticky-opacity-chip")
          .forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        if (this.callbacks.onStyleChange) {
          this.callbacks.onStyleChange(this.noteId, { opacity: p.val });
        }
      });
      chipRow.appendChild(chip);
    }

    opacityCtrl.appendChild(opHeader);
    opacityCtrl.appendChild(slider);
    opacityCtrl.appendChild(chipRow);
    popover.appendChild(opacityCtrl);

    const divider2 = document.createElement("div");
    divider2.className = "onenote-menu-divider";
    popover.appendChild(divider2);

    // 3. Notes List Button
    this.hubBtnEl = document.createElement("button");
    this.hubBtnEl.className = "onenote-menu-item onenote-floating-hub-btn";
    const iconSpan = document.createElement("span");
    iconSpan.className = "onenote-menu-icon";
    setSvgContent(iconSpan, STICKY_NOTE_SVG_ICONS.HUB_LIST);
    const textSpan = document.createElement("span");
    textSpan.textContent = "Notes list";
    this.hubBtnEl.appendChild(iconSpan);
    this.hubBtnEl.appendChild(textSpan);
    this.hubBtnEl.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.OPEN_NOTES_LIST);
    this.hubBtnEl.addEventListener("click", (e) => {
      e.stopPropagation();
      popover.classList.add("is-hidden");
      if (this.moreBtnEl) this.moreBtnEl.setAttribute("aria-expanded", "false");
      if (this.callbacks.onOpenHub) {
        this.callbacks.onOpenHub();
      }
    });
    popover.appendChild(this.hubBtnEl);
  }
}
