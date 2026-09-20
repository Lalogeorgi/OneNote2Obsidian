import { App } from "obsidian";
import { PixiRenderer } from "../../renderer/pixi/PixiRenderer";
import { InteractionTool } from "../../renderer/interaction/SpatialInteractionController";
import { NoveltyInkEffect, PenType, ShapeKind } from "../../model/CanonicalElements";
import { StickyNoteUtils } from "../../model/StickyNoteUtils";
import { IdGenerator } from "../../model/Ids";
import { PageContextManager } from "../../context/PageContextManager";
import { FloatingStickyNoteManager } from "../FloatingStickyNoteManager";
import { ViewportManager } from "../../geometry/ViewportManager";
import {
  DEFAULT_PEN_SHELF_PRESETS,
  MAX_PEN_SHELF_COUNT,
  ONENOTE_STANDARD_PALETTE,
  NOVELTY_INK_DEFINITIONS,
  INK_THICKNESS_PRESETS,
  PAGE_TINT_PRESETS,
  VIEWPORT_ZOOM_LIMITS,
  INSERT_IMAGE_LIMITS,
  RIBBON_STICKY_COLOR_PRESETS,
  PenPreset,
  RibbonTabId,
  RIBBON_TABS_CONFIG,
  TEXT_FORMAT_ACTIONS_CONFIG,
  SHAPE_CHOICES_CONFIG,
  ERASER_MODES_CONFIG,
  RULE_LINES_CONFIG,
  RIBBON_UI_STRINGS,
  RIBBON_SVG_ICONS,
} from "../../constants/RibbonConstants";
import { setSvgContent, emptyElement } from "../../dom/DomUtils";

export type RibbonTab = RibbonTabId;

export interface OneNoteRibbonOptions {
  container: HTMLElement;
  renderer: PixiRenderer | null;
  app?: App;
  defaultStickyNoteColor?: string;
  onToolChange?: (tool: InteractionTool) => void;
  onInkOptionsChange?: (
    options: Partial<import("../../editor/ink/InkDrawingController").InkToolOptions>
  ) => void;
  onPageTitleClick?: () => void;
  onInsertLink?: () => void;
  onPagePropertiesClick?: () => void;
  onCollapseChange?: (isCollapsed: boolean) => void;
}

export class OneNoteRibbon {
  public readonly el: HTMLElement;
  private activeTab: RibbonTab = "draw";
  private isCollapsed = false;

  private activeTool: InteractionTool = "select";
  private activePenType: PenType = "gel";
  private activeInkColor = "#000000";
  private activeInkWidth = 2.5;
  private activeNoveltyEffect?: NoveltyInkEffect;
  private activeEraserMode: "stroke" | "point_small" | "point_medium" | "point_large" = "stroke";
  private activeShapeKind: ShapeKind = "rectangle";
  private isInkToShape = false;

  // Pre-configured Pen Shelf (Favorite Pens initialized from centralized constants)
  private penShelf: PenPreset[] = [...DEFAULT_PEN_SHELF_PRESETS];

  private tabHeaderButtons = new Map<RibbonTab, HTMLElement>();
  private tabPanels = new Map<RibbonTab, HTMLElement>();
  private toolButtons = new Map<string, HTMLElement>();
  private penShelfElements = new Map<string, HTMLElement>();
  private penShelfContainer: HTMLElement | null = null;

  private zoomBadgeEl!: HTMLButtonElement;
  private collapseBtnEl: HTMLButtonElement | null = null;
  private activeColorIndicatorEl!: HTMLElement;
  private outsideClickListener: ((e: MouseEvent) => void) | null = null;
  private escapeKeyListener: ((e: KeyboardEvent) => void) | null = null;

  constructor(private options: OneNoteRibbonOptions) {
    this.el = document.createElement("div");
    this.el.className = "onenote-ribbon-bar onenote-floating-toolbar";
    this.el.setAttribute("role", "toolbar");
    this.el.setAttribute("aria-label", RIBBON_UI_STRINGS.TOOLBAR_ARIA);
    this.buildRibbon();
    if (options.container.firstChild) {
      options.container.insertBefore(this.el, options.container.firstChild);
    } else {
      options.container.appendChild(this.el);
    }

    if (typeof document !== "undefined") {
      this.outsideClickListener = (e: MouseEvent) => {
        if (!this.el.contains(e.target as Node)) {
          this.closeAllPopups();
        }
      };
      document.addEventListener("click", this.outsideClickListener);

      this.escapeKeyListener = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          this.closeAllPopups();
        }
      };
      document.addEventListener("keydown", this.escapeKeyListener);
    }
  }

  public destroy(): void {
    if (typeof document !== "undefined") {
      if (this.outsideClickListener) {
        document.removeEventListener("click", this.outsideClickListener);
        this.outsideClickListener = null;
      }
      if (this.escapeKeyListener) {
        document.removeEventListener("keydown", this.escapeKeyListener);
        this.escapeKeyListener = null;
      }
    }
    this.el.remove();
  }

  public closeAllPopups(): void {
    const popups = this.el.querySelectorAll(".onenote-palette-popup");
    popups.forEach((p) => p.classList.add("is-hidden"));
    this.el.querySelectorAll("[aria-expanded='true']").forEach((b) => {
      b.setAttribute("aria-expanded", "false");
    });
  }

  public openFlyout(triggerBtn: HTMLElement, popupEl: HTMLElement): void {
    const isCurrentlyHidden = popupEl.classList.contains("is-hidden");
    this.closeAllPopups();
    if (!isCurrentlyHidden) {
      triggerBtn.setAttribute("aria-expanded", "false");
      return;
    }

    popupEl.classList.remove("is-hidden");
    triggerBtn.setAttribute("aria-expanded", "true");

    // Ensure popup is appended directly to this.el to escape any parent overflow clipping
    if (popupEl.parentElement !== this.el) {
      this.el.appendChild(popupEl);
    }

    const btnRect = triggerBtn.getBoundingClientRect();
    const ribbonRect = this.el.getBoundingClientRect();

    // Position right below the trigger button
    const top = btnRect.bottom - ribbonRect.top + 2;
    popupEl.style.top = `${top}px`;

    // Compute horizontal position clamped within ribbon container
    const popupWidth = popupEl.offsetWidth || 280;
    let left = btnRect.left - ribbonRect.left;
    const maxLeft = ribbonRect.width - popupWidth - 12;
    if (left > maxLeft) {
      left = Math.max(8, maxLeft);
    }
    popupEl.style.left = `${Math.max(8, left)}px`;
  }

  public setRenderer(renderer: PixiRenderer | null): void {
    this.options.renderer = renderer;
    this.updateZoomDisplay();
  }

  public setTool(tool: InteractionTool): void {
    this.activeTool = tool;
    this.toolButtons.forEach((btn, id) => {
      btn.classList.toggle("is-active", id === tool);
    });
    this.options.renderer?.setTool(tool);
    this.options.onToolChange?.(tool);
  }

  public updateZoomDisplay(): void {
    if (!this.zoomBadgeEl || !this.options.renderer) return;
    const zoom = Math.round(this.options.renderer.getTransform().scale * 100);
    this.zoomBadgeEl.textContent = `${zoom}%`;
  }

  public getActiveTab(): RibbonTab {
    return this.activeTab;
  }

  public getActiveTool(): InteractionTool {
    return this.activeTool;
  }

  public getActivePenType(): PenType {
    return this.activePenType;
  }

  public getActiveInkColor(): string {
    return this.activeInkColor;
  }

  public getActiveInkWidth(): number {
    return this.activeInkWidth;
  }

  public getActiveNoveltyEffect(): NoveltyInkEffect | undefined {
    return this.activeNoveltyEffect;
  }

  public getActiveEraserMode(): "stroke" | "point_small" | "point_medium" | "point_large" {
    return this.activeEraserMode;
  }

  public getActiveShapeKind(): ShapeKind {
    return this.activeShapeKind;
  }

  public isInkToShapeActive(): boolean {
    return this.isInkToShape;
  }

  private buildRibbon(): void {
    // 1. Ribbon Top Bar (Symmetric 3-Zone Layout: Left Controls, Center Tabs, Right Controls)
    const ribbonHeader = document.createElement("div");
    ribbonHeader.className = "onenote-ribbon-header";

    // Zone 1: Left Controls (Brand Badge)
    const leftControls = document.createElement("div");
    leftControls.className = "onenote-ribbon-left-controls";
    leftControls.setAttribute("role", "group");
    leftControls.setAttribute("aria-label", RIBBON_UI_STRINGS.LEFT_CONTROLS_ARIA);

    const brandBadge = document.createElement("div");
    brandBadge.className = "onenote-ribbon-brand";
    brandBadge.title = RIBBON_UI_STRINGS.CANVAS_ICON_TITLE;
    brandBadge.setAttribute("aria-label", RIBBON_UI_STRINGS.CANVAS_ICON_ARIA);
    const brandIcon = document.createElement("span");
    brandIcon.className = "onenote-brand-icon";
    setSvgContent(brandIcon, RIBBON_SVG_ICONS.CANVAS_BADGE);
    brandBadge.appendChild(brandIcon);
    leftControls.appendChild(brandBadge);
    ribbonHeader.appendChild(leftControls);

    // Zone 2: Center Ribbon Tabs Bar (Accessible tablist with Arrow keys navigation)
    const tabsContainer = document.createElement("div");
    tabsContainer.className = "onenote-ribbon-tabs";
    tabsContainer.setAttribute("role", "tablist");
    tabsContainer.setAttribute("aria-label", RIBBON_UI_STRINGS.TABLIST_ARIA);

    for (const [i, tab] of RIBBON_TABS_CONFIG.entries()) {
      const tabBtn = document.createElement("button");
      tabBtn.type = "button";
      tabBtn.className = `onenote-ribbon-tab ${this.activeTab === tab.id ? "is-active" : ""}`;
      tabBtn.textContent = tab.label;
      tabBtn.title = tab.tooltip;
      tabBtn.setAttribute("role", "tab");
      tabBtn.id = `onenote-tab-${tab.id}`;
      tabBtn.setAttribute("aria-controls", `onenote-panel-${tab.id}`);
      tabBtn.setAttribute("aria-selected", this.activeTab === tab.id ? "true" : "false");
      tabBtn.tabIndex = this.activeTab === tab.id ? 0 : -1;

      tabBtn.onclick = () => this.switchTab(tab.id);
      tabBtn.ondblclick = () => this.toggleCollapse(collapseBtn);

      tabBtn.onkeydown = (e: KeyboardEvent) => {
        let targetIndex = -1;
        if (e.key === "ArrowRight") {
          targetIndex = (i + 1) % RIBBON_TABS_CONFIG.length;
        } else if (e.key === "ArrowLeft") {
          targetIndex = (i - 1 + RIBBON_TABS_CONFIG.length) % RIBBON_TABS_CONFIG.length;
        } else if (e.key === "Home") {
          targetIndex = 0;
        } else if (e.key === "End") {
          targetIndex = RIBBON_TABS_CONFIG.length - 1;
        }
        if (targetIndex >= 0) {
          e.preventDefault();
          const targetTab = RIBBON_TABS_CONFIG[targetIndex];
          if (targetTab) {
            const targetBtn = this.tabHeaderButtons.get(targetTab.id);
            if (targetBtn) {
              targetBtn.focus();
              this.switchTab(targetTab.id);
            }
          }
        }
      };

      tabsContainer.appendChild(tabBtn);
      this.tabHeaderButtons.set(tab.id, tabBtn);
    }
    ribbonHeader.appendChild(tabsContainer);

    // Zone 3: Right Controls (Chevron at top-right corner, followed by toolbar buttons to the left)
    const rightControls = document.createElement("div");
    rightControls.className = "onenote-ribbon-right-controls";
    rightControls.setAttribute("role", "group");
    rightControls.setAttribute("aria-label", RIBBON_UI_STRINGS.RIGHT_CONTROLS_ARIA);

    const undoBtn = document.createElement("button");
    undoBtn.type = "button";
    undoBtn.className = "onenote-btn-icon onenote-undo-btn";
    undoBtn.title = RIBBON_UI_STRINGS.UNDO_TITLE;
    undoBtn.setAttribute("aria-label", RIBBON_UI_STRINGS.UNDO_ARIA);
    setSvgContent(undoBtn, RIBBON_SVG_ICONS.UNDO);
    undoBtn.onclick = () => this.options.renderer?.undo();
    rightControls.appendChild(undoBtn);

    const redoBtn = document.createElement("button");
    redoBtn.type = "button";
    redoBtn.className = "onenote-btn-icon onenote-redo-btn";
    redoBtn.title = RIBBON_UI_STRINGS.REDO_TITLE;
    redoBtn.setAttribute("aria-label", RIBBON_UI_STRINGS.REDO_ARIA);
    setSvgContent(redoBtn, RIBBON_SVG_ICONS.REDO);
    redoBtn.onclick = () => this.options.renderer?.redo();
    rightControls.appendChild(redoBtn);

    const fitBtn = document.createElement("button");
    fitBtn.type = "button";
    fitBtn.className = "onenote-btn-icon onenote-fit-btn";
    fitBtn.title = "Fit to Content";
    fitBtn.setAttribute("aria-label", "Fit all content to view");
    setSvgContent(
      fitBtn,
      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`
    );
    fitBtn.onclick = () => {
      if (this.options.renderer) {
        this.options.renderer.fitToPage({ padding: 48, align: "top-left" });
        this.updateZoomDisplay();
      }
    };
    rightControls.appendChild(fitBtn);

    this.zoomBadgeEl = document.createElement("button");
    this.zoomBadgeEl.type = "button";
    this.zoomBadgeEl.className = "onenote-zoom-badge";
    this.zoomBadgeEl.textContent = "100%";
    this.zoomBadgeEl.title = RIBBON_UI_STRINGS.ZOOM_RESET_TITLE;
    this.zoomBadgeEl.setAttribute("aria-label", RIBBON_UI_STRINGS.ZOOM_RESET_ARIA);
    this.zoomBadgeEl.onclick = () => {
      if (this.options.renderer) {
        this.options.renderer.fitToPage({ padding: 48, align: "top-left" });
        this.updateZoomDisplay();
      }
    };
    rightControls.appendChild(this.zoomBadgeEl);

    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "onenote-btn-icon onenote-collapse-btn";
    collapseBtn.title = RIBBON_UI_STRINGS.COLLAPSE_TITLE;
    collapseBtn.setAttribute("aria-label", RIBBON_UI_STRINGS.COLLAPSE_ARIA);
    collapseBtn.setAttribute("aria-expanded", "true");
    setSvgContent(collapseBtn, RIBBON_SVG_ICONS.CHEVRON_UP);
    collapseBtn.onclick = () => this.toggleCollapse(collapseBtn);
    this.collapseBtnEl = collapseBtn;
    rightControls.appendChild(collapseBtn);

    ribbonHeader.appendChild(rightControls);
    this.el.appendChild(ribbonHeader);

    // 2. Ribbon Panels Body
    const ribbonBody = document.createElement("div");
    ribbonBody.className = "onenote-ribbon-body";

    // Build Tab Panels
    this.tabPanels.set("home", this.buildHomeTab());
    this.tabPanels.set("insert", this.buildInsertTab());
    this.tabPanels.set("draw", this.buildDrawTab());
    this.tabPanels.set("view", this.buildViewTab());

    for (const [id, panel] of this.tabPanels.entries()) {
      panel.setAttribute("role", "tabpanel");
      panel.id = `onenote-panel-${id}`;
      panel.setAttribute("aria-labelledby", `onenote-tab-${id}`);
      panel.tabIndex = 0;
      panel.classList.toggle("is-hidden", id !== this.activeTab);
      panel.setAttribute("aria-hidden", id === this.activeTab ? "false" : "true");
      ribbonBody.appendChild(panel);
    }

    this.el.appendChild(ribbonBody);
  }

  private switchTab(tab: RibbonTab): void {
    this.closeAllPopups();
    this.activeTab = tab;
    this.tabHeaderButtons.forEach((btn, id) => {
      const isSelected = id === tab;
      btn.classList.toggle("is-active", isSelected);
      btn.setAttribute("aria-selected", isSelected ? "true" : "false");
      btn.tabIndex = isSelected ? 0 : -1;
    });
    this.tabPanels.forEach((panel, id) => {
      const isSelected = id === tab;
      panel.classList.toggle("is-hidden", !isSelected);
      panel.setAttribute("aria-hidden", isSelected ? "false" : "true");
    });
    if (this.isCollapsed) {
      this.isCollapsed = false;
      this.el.classList.remove("is-collapsed");
      if (this.collapseBtnEl) {
        this.collapseBtnEl.setAttribute("aria-expanded", "true");
        setSvgContent(this.collapseBtnEl, RIBBON_SVG_ICONS.CHEVRON_UP);
      }
      this.options.onCollapseChange?.(false);
    }
  }

  public toggleCollapse(btn?: HTMLElement): void {
    this.isCollapsed = !this.isCollapsed;
    this.el.classList.toggle("is-collapsed", this.isCollapsed);
    const targetBtn = btn || this.collapseBtnEl;
    if (targetBtn) {
      targetBtn.setAttribute("aria-expanded", this.isCollapsed ? "false" : "true");
      setSvgContent(
        targetBtn,
        this.isCollapsed ? RIBBON_SVG_ICONS.CHEVRON_DOWN : RIBBON_SVG_ICONS.CHEVRON_UP
      );
    }
    this.options.onCollapseChange?.(this.isCollapsed);
  }

  public getIsCollapsed(): boolean {
    return this.isCollapsed;
  }

  // --- TAB: DRAW ---
  private buildDrawTab(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "onenote-ribbon-panel";

    // 1. Mode / Selection Tools
    const toolsGroup = this.createGroup(panel, "Tools");
    const selectBtn = this.createToolButton(
      toolsGroup,
      "select",
      "↖",
      "Type / Select",
      "Select & Type (Pointer)"
    );
    selectBtn.classList.add("is-active");
    this.toolButtons.set("select", selectBtn);

    const lassoBtn = this.createToolButton(toolsGroup, "lasso", "➰", "Lasso", "Lasso Select");
    this.toolButtons.set("lasso", lassoBtn);

    const panBtn = this.createToolButton(toolsGroup, "pan", "✋", "Pan", "Pan Canvas");
    this.toolButtons.set("pan", panBtn);

    this.createDivider(panel);

    // 2. Pens Gallery (Shelf)
    const pensGroup = this.createGroup(panel, "Pens Gallery");
    this.penShelfContainer = document.createElement("div");
    this.penShelfContainer.className = "onenote-pen-shelf";
    this.penShelfContainer.setAttribute("role", "toolbar");
    this.penShelfContainer.setAttribute("aria-label", "Favorite Pens Shelf");
    this.renderPenShelfItems();
    pensGroup.appendChild(this.penShelfContainer);

    this.createDivider(panel);

    // 3. Color & Thickness Inspector
    const colorGroup = this.createGroup(panel, "Color & Size");
    const colorFlyoutBtn = document.createElement("button");
    colorFlyoutBtn.type = "button";
    colorFlyoutBtn.className = "onenote-ribbon-btn onenote-color-flyout-btn";
    colorFlyoutBtn.title = "Pen Color, Novelty Effects & Thickness";
    colorFlyoutBtn.setAttribute("aria-label", "Pen Color, Novelty Effects and Thickness Options");
    colorFlyoutBtn.setAttribute("aria-haspopup", "true");
    colorFlyoutBtn.setAttribute("aria-expanded", "false");

    this.activeColorIndicatorEl = document.createElement("div");
    this.activeColorIndicatorEl.className = "onenote-color-swatch-indicator";
    this.activeColorIndicatorEl.style.backgroundColor = this.activeInkColor;
    colorFlyoutBtn.appendChild(this.activeColorIndicatorEl);

    const colorLabel = document.createElement("span");
    colorLabel.textContent = "Color & Size ▼";
    colorFlyoutBtn.appendChild(colorLabel);

    const palettePopup = document.createElement("div");
    palettePopup.className = "onenote-palette-popup is-hidden";
    palettePopup.setAttribute("role", "dialog");
    palettePopup.setAttribute("aria-label", "Pen Color and Thickness Palette");

    // Standard Colors from constants
    const colorsHeader = document.createElement("div");
    colorsHeader.className = "onenote-palette-section-title";
    colorsHeader.textContent = RIBBON_UI_STRINGS.STANDARD_COLORS_TITLE;
    palettePopup.appendChild(colorsHeader);

    const colorsGrid = document.createElement("div");
    colorsGrid.className = "onenote-swatch-grid";
    colorsGrid.setAttribute("role", "group");
    colorsGrid.setAttribute("aria-label", RIBBON_UI_STRINGS.STANDARD_COLORS_TITLE);

    for (const c of ONENOTE_STANDARD_PALETTE) {
      const sw = document.createElement("button");
      sw.type = "button";
      sw.className = "onenote-color-swatch";
      sw.style.backgroundColor = c;
      sw.title = `Color: ${c}`;
      sw.setAttribute("aria-label", `Select ink color ${c}`);
      if (c === "#FFFFFF") sw.classList.add("onenote-swatch-white");
      sw.onclick = (e) => {
        e.stopPropagation();
        this.activeInkColor = c;
        this.activeNoveltyEffect = undefined;
        this.activeColorIndicatorEl.style.background = c;
        this.options.renderer?.setInkOptions({
          color: c,
          noveltyEffect: undefined,
        });
        palettePopup.classList.add("is-hidden");
        colorFlyoutBtn.setAttribute("aria-expanded", "false");
      };
      colorsGrid.appendChild(sw);
    }
    palettePopup.appendChild(colorsGrid);

    // Novelty Inks from constants
    const noveltyHeader = document.createElement("div");
    noveltyHeader.className = "onenote-palette-section-title";
    noveltyHeader.textContent = RIBBON_UI_STRINGS.NOVELTY_INKS_TITLE;
    palettePopup.appendChild(noveltyHeader);

    const noveltyGrid = document.createElement("div");
    noveltyGrid.className = "onenote-novelty-grid";
    noveltyGrid.setAttribute("role", "group");
    noveltyGrid.setAttribute("aria-label", RIBBON_UI_STRINGS.NOVELTY_INKS_TITLE);

    for (const nov of NOVELTY_INK_DEFINITIONS) {
      const novBtn = document.createElement("button");
      novBtn.type = "button";
      novBtn.className = "onenote-novelty-btn";
      novBtn.style.background = nov.gradientCss;
      novBtn.textContent = nov.label;
      novBtn.title = `Novelty Ink: ${nov.label}`;
      novBtn.setAttribute("aria-label", `Select novelty ink ${nov.label}`);
      novBtn.onclick = (e) => {
        e.stopPropagation();
        this.activeNoveltyEffect = nov.effect;
        this.activeColorIndicatorEl.style.background = nov.gradientCss;
        this.options.renderer?.setInkOptions({
          noveltyEffect: nov.effect,
          mode: "pen",
        });
        this.setTool("pen");
        palettePopup.classList.add("is-hidden");
        colorFlyoutBtn.setAttribute("aria-expanded", "false");
      };
      noveltyGrid.appendChild(novBtn);
    }
    palettePopup.appendChild(noveltyGrid);

    // Thickness steps from constants
    const thickHeader = document.createElement("div");
    thickHeader.className = "onenote-palette-section-title";
    thickHeader.textContent = RIBBON_UI_STRINGS.THICKNESS_TITLE;
    palettePopup.appendChild(thickHeader);

    const thickRow = document.createElement("div");
    thickRow.className = "onenote-thickness-row";
    thickRow.setAttribute("role", "group");
    thickRow.setAttribute("aria-label", RIBBON_UI_STRINGS.THICKNESS_TITLE);

    for (const t of INK_THICKNESS_PRESETS) {
      const tb = document.createElement("button");
      tb.type = "button";
      tb.className = "onenote-thick-btn";
      tb.title = `Thickness: ${t.label}`;
      tb.setAttribute("aria-label", `Set stroke thickness to ${t.label}`);
      const dot = document.createElement("span");
      dot.className = "onenote-thick-dot";
      const dotSize = `${Math.min(16, Math.max(3, t.width))}px`;
      dot.style.width = dotSize;
      dot.style.height = dotSize;
      dot.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = t.label;
      tb.appendChild(dot);
      tb.appendChild(label);
      tb.onclick = (e) => {
        e.stopPropagation();
        this.activeInkWidth = t.width;
        this.options.renderer?.setInkOptions({ strokeWidth: t.width });
        palettePopup.classList.add("is-hidden");
        colorFlyoutBtn.setAttribute("aria-expanded", "false");
      };
      thickRow.appendChild(tb);
    }
    palettePopup.appendChild(thickRow);

    colorFlyoutBtn.onclick = (e) => {
      e.stopPropagation();
      this.openFlyout(colorFlyoutBtn, palettePopup);
    };
    colorGroup.appendChild(colorFlyoutBtn);
    this.el.appendChild(palettePopup);

    this.createDivider(panel);

    // 4. Eraser Dropdown
    const eraserGroup = this.createGroup(panel, "Eraser");
    const eraserFlyoutBtn = document.createElement("button");
    eraserFlyoutBtn.type = "button";
    eraserFlyoutBtn.className = "onenote-ribbon-btn";
    const eraserIcon = document.createElement("span");
    eraserIcon.setAttribute("aria-hidden", "true");
    eraserIcon.textContent = "🧹";
    const eraserText = document.createElement("span");
    eraserText.textContent = "Eraser ▼";
    eraserFlyoutBtn.appendChild(eraserIcon);
    eraserFlyoutBtn.appendChild(eraserText);
    eraserFlyoutBtn.title = "Eraser Modes";
    eraserFlyoutBtn.setAttribute("aria-label", "Eraser modes dropdown");
    eraserFlyoutBtn.setAttribute("aria-haspopup", "true");
    eraserFlyoutBtn.setAttribute("aria-expanded", "false");

    const eraserPopup = document.createElement("div");
    eraserPopup.className = "onenote-palette-popup is-hidden";
    eraserPopup.setAttribute("role", "menu");
    eraserPopup.setAttribute("aria-label", "Eraser Modes");

    for (const em of ERASER_MODES_CONFIG) {
      const eb = document.createElement("button");
      eb.type = "button";
      eb.className = "onenote-popup-item-btn";
      eb.textContent = em.label;
      eb.setAttribute("role", "menuitem");
      eb.setAttribute("aria-label", em.ariaLabel);
      eb.onclick = (e) => {
        e.stopPropagation();
        this.activeEraserMode = em.mode;
        this.options.renderer?.setInkOptions({
          mode: "eraser",
          eraserMode: em.mode,
        });
        this.setTool("eraser");
        eraserPopup.classList.add("is-hidden");
        eraserFlyoutBtn.setAttribute("aria-expanded", "false");
      };
      eraserPopup.appendChild(eb);
    }

    eraserFlyoutBtn.onclick = (e) => {
      e.stopPropagation();
      this.openFlyout(eraserFlyoutBtn, eraserPopup);
    };
    eraserGroup.appendChild(eraserFlyoutBtn);
    this.el.appendChild(eraserPopup);

    this.createDivider(panel);

    // 5. Shapes Gallery & Ink-to-Shape
    const shapesGroup = this.createGroup(panel, "Shapes");
    const shapesFlyoutBtn = document.createElement("button");
    shapesFlyoutBtn.type = "button";
    shapesFlyoutBtn.className = "onenote-ribbon-btn";
    const shapesIcon = document.createElement("span");
    shapesIcon.setAttribute("aria-hidden", "true");
    shapesIcon.textContent = "🔷";
    const shapesText = document.createElement("span");
    shapesText.textContent = "Shapes ▼";
    shapesFlyoutBtn.appendChild(shapesIcon);
    shapesFlyoutBtn.appendChild(shapesText);
    shapesFlyoutBtn.title = "Insert Geometric Shapes";
    shapesFlyoutBtn.setAttribute("aria-label", "Geometric shapes dropdown");
    shapesFlyoutBtn.setAttribute("aria-haspopup", "true");
    shapesFlyoutBtn.setAttribute("aria-expanded", "false");

    const shapesPopup = document.createElement("div");
    shapesPopup.className = "onenote-palette-popup is-hidden";
    shapesPopup.setAttribute("role", "menu");
    shapesPopup.setAttribute("aria-label", "Geometric Shapes List");

    const linesTitle = document.createElement("div");
    linesTitle.className = "onenote-shapes-section-title";
    linesTitle.textContent = "Lines & Connectors";
    shapesPopup.appendChild(linesTitle);

    const linesGrid = document.createElement("div");
    linesGrid.className = "onenote-shapes-grid";

    const basicTitle = document.createElement("div");
    basicTitle.className = "onenote-shapes-section-title";
    basicTitle.textContent = "Basic Shapes";

    const basicGrid = document.createElement("div");
    basicGrid.className = "onenote-shapes-grid";

    for (const sc of SHAPE_CHOICES_CONFIG) {
      const sb = document.createElement("button");
      sb.type = "button";
      sb.className = "onenote-shape-choice-btn";
      sb.setAttribute("role", "menuitem");
      sb.setAttribute("aria-label", sc.ariaLabel);
      sb.title = sc.label;
      const shapeIcon = document.createElement("span");
      shapeIcon.className = "onenote-shape-icon";
      shapeIcon.setAttribute("aria-hidden", "true");
      setSvgContent(shapeIcon, sc.icon);
      const shapeLabel = document.createElement("span");
      shapeLabel.className = "onenote-shape-label";
      shapeLabel.textContent = sc.label;
      sb.appendChild(shapeIcon);
      sb.appendChild(shapeLabel);
      sb.onclick = (e) => {
        e.stopPropagation();
        this.activeShapeKind = sc.kind;
        this.options.renderer?.setInkOptions({
          mode: "shape",
          shapeKind: sc.kind,
          color: this.activeInkColor,
          strokeWidth: this.activeInkWidth,
        });
        this.setTool("shape");
        shapesPopup.classList.add("is-hidden");
        shapesFlyoutBtn.setAttribute("aria-expanded", "false");
      };
      if (sc.category === "lines") {
        linesGrid.appendChild(sb);
      } else {
        basicGrid.appendChild(sb);
      }
    }
    shapesPopup.appendChild(linesGrid);
    shapesPopup.appendChild(basicTitle);
    shapesPopup.appendChild(basicGrid);

    shapesFlyoutBtn.onclick = (e) => {
      e.stopPropagation();
      this.openFlyout(shapesFlyoutBtn, shapesPopup);
    };
    shapesGroup.appendChild(shapesFlyoutBtn);
    this.el.appendChild(shapesPopup);

    // Ink to Shape toggle button
    const inkToShapeBtn = document.createElement("button");
    inkToShapeBtn.type = "button";
    inkToShapeBtn.className = `onenote-ribbon-btn onenote-toggle-btn ${this.isInkToShape ? "is-active" : ""}`;
    const inkIcon = document.createElement("span");
    inkIcon.setAttribute("aria-hidden", "true");
    inkIcon.textContent = "🪄";
    const inkLabel = document.createElement("span");
    inkLabel.textContent = "Ink to Shape";
    inkToShapeBtn.appendChild(inkIcon);
    inkToShapeBtn.appendChild(inkLabel);
    inkToShapeBtn.title = "Automatically convert rough hand-drawn shapes to crisp geometric shapes";
    inkToShapeBtn.setAttribute("aria-label", "Toggle Ink to Shape conversion");
    inkToShapeBtn.setAttribute("aria-pressed", this.isInkToShape ? "true" : "false");
    inkToShapeBtn.onclick = () => {
      this.isInkToShape = !this.isInkToShape;
      inkToShapeBtn.classList.toggle("is-active", this.isInkToShape);
      inkToShapeBtn.setAttribute("aria-pressed", this.isInkToShape ? "true" : "false");
      this.options.renderer?.setInkOptions({ inkToShape: this.isInkToShape });
    };
    shapesGroup.appendChild(inkToShapeBtn);

    this.createDivider(panel);

    // 6. Ruler & Transcription Tools
    const rulerGroup = this.createGroup(panel, "Ruler");
    const rulerBtn = document.createElement("button");
    rulerBtn.type = "button";
    rulerBtn.className = "onenote-ribbon-btn onenote-toggle-btn";
    const rulerIcon = document.createElement("span");
    rulerIcon.setAttribute("aria-hidden", "true");
    rulerIcon.textContent = "📏";
    const rulerLabel = document.createElement("span");
    rulerLabel.textContent = "Ruler";
    rulerBtn.appendChild(rulerIcon);
    rulerBtn.appendChild(rulerLabel);
    rulerBtn.title = "Toggle Digital Ruler for drawing straight lines and measuring angles";
    rulerBtn.setAttribute("aria-label", "Toggle Digital Ruler");
    rulerBtn.setAttribute("aria-pressed", "false");
    rulerBtn.onclick = () => {
      const active = this.options.renderer?.toggleRuler() ?? false;
      rulerBtn.classList.toggle("is-active", active);
      rulerBtn.setAttribute("aria-pressed", active ? "true" : "false");
    };
    rulerGroup.appendChild(rulerBtn);

    this.createDivider(panel);

    // 7. Arrange (Z-Order)
    const arrangeGroup = this.createGroup(panel, "Arrange");
    const frontBtn = document.createElement("button");
    frontBtn.type = "button";
    frontBtn.className = "onenote-ribbon-btn";
    const frontIcon = document.createElement("span");
    frontIcon.setAttribute("aria-hidden", "true");
    frontIcon.textContent = "🔝";
    const frontLabel = document.createElement("span");
    frontLabel.textContent = "Bring to Front";
    frontBtn.appendChild(frontIcon);
    frontBtn.appendChild(frontLabel);
    frontBtn.title = "Bring selected object to the very front (Ctrl+Shift+])";
    frontBtn.setAttribute("aria-label", "Bring selected object to the very front");
    frontBtn.onclick = () => {
      this.options.renderer?.adjustZOrder?.("bringToFront");
    };
    arrangeGroup.appendChild(frontBtn);

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "onenote-ribbon-btn";
    const backIcon = document.createElement("span");
    backIcon.setAttribute("aria-hidden", "true");
    backIcon.textContent = "🔙";
    const backLabel = document.createElement("span");
    backLabel.textContent = "Send to Back";
    backBtn.appendChild(backIcon);
    backBtn.appendChild(backLabel);
    backBtn.title = "Send selected object to the very back (Ctrl+Shift+[)";
    backBtn.setAttribute("aria-label", "Send selected object to the very back");
    backBtn.onclick = () => {
      this.options.renderer?.adjustZOrder?.("sendToBack");
    };
    arrangeGroup.appendChild(backBtn);

    return panel;
  }

  private renderPenShelfItems(): void {
    if (!this.penShelfContainer) return;
    emptyElement(this.penShelfContainer);
    this.penShelfElements.clear();

    for (const pen of this.penShelf) {
      const penEl = document.createElement("div");
      penEl.className = "onenote-pen-item";
      const isCustom =
        pen.id.startsWith("custom-pen-") || this.penShelf.length > DEFAULT_PEN_SHELF_PRESETS.length;
      penEl.title = isCustom
        ? `${pen.name} (${pen.width}pt) • Right-click to remove`
        : `${pen.name} (${pen.width}pt)`;
      penEl.setAttribute("role", "button");
      penEl.setAttribute("aria-label", `${pen.name} (${pen.width} points)`);
      penEl.tabIndex = 0;

      const tip = document.createElement("div");
      tip.className = `onenote-pen-tip pen-type-${pen.penType}`;
      tip.style.backgroundColor = pen.noveltyEffect ? "transparent" : pen.color;

      const novDef = pen.noveltyEffect
        ? NOVELTY_INK_DEFINITIONS.find((n) => n.effect === pen.noveltyEffect)
        : null;
      if (novDef) {
        tip.style.background = novDef.gradientCss;
      }

      const body = document.createElement("div");
      body.className = "onenote-pen-body";
      body.style.borderColor = pen.color;

      penEl.appendChild(tip);
      penEl.appendChild(body);

      const activatePen = () => {
        this.selectPenPreset(pen);
        this.penShelfElements.forEach((el) => el.classList.remove("is-active"));
        penEl.classList.add("is-active");
      };

      penEl.onclick = activatePen;
      penEl.onkeydown = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activatePen();
        }
      };

      if (isCustom) {
        penEl.oncontextmenu = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          this.removeCustomPen(pen.id);
        };
      }

      this.penShelfContainer.appendChild(penEl);
      this.penShelfElements.set(pen.id, penEl);
    }

    // Authentic OneNote "+" (Add Pen) button
    const isAtLimit = this.penShelf.length >= MAX_PEN_SHELF_COUNT;
    const addPenBtn = document.createElement("button");
    addPenBtn.type = "button";
    addPenBtn.className = `onenote-add-pen-btn ${isAtLimit ? "is-disabled" : ""}`;
    addPenBtn.title = isAtLimit
      ? RIBBON_UI_STRINGS.MAX_PENS_REACHED
      : RIBBON_UI_STRINGS.ADD_PEN_TITLE;
    addPenBtn.setAttribute("aria-label", RIBBON_UI_STRINGS.ADD_PEN_ARIA);
    if (isAtLimit) {
      addPenBtn.setAttribute("aria-disabled", "true");
    }
    addPenBtn.textContent = "+";
    addPenBtn.onclick = (e) => {
      e.stopPropagation();
      if (this.penShelf.length >= MAX_PEN_SHELF_COUNT) {
        return;
      }
      this.addNewCustomPen();
    };
    this.penShelfContainer.appendChild(addPenBtn);
  }

  public addNewCustomPen(type: PenType = this.activePenType): void {
    if (this.penShelf.length >= MAX_PEN_SHELF_COUNT) return;
    const newId = "custom-pen-" + Date.now();
    const isHighlighter = type === "highlighter";
    const isPencil = type === "pencil";
    const name = isHighlighter
      ? "Custom Highlighter"
      : isPencil
        ? "Custom Pencil"
        : RIBBON_UI_STRINGS.CUSTOM_PEN_NAME;
    const defaultColor = isHighlighter ? "#fef08a" : isPencil ? "#4b5563" : this.activeInkColor;
    const defaultWidth = isHighlighter ? 16.0 : isPencil ? 1.5 : this.activeInkWidth;

    const newPen: PenPreset = {
      id: newId,
      name,
      penType: type,
      color: defaultColor,
      width: defaultWidth,
      noveltyEffect: this.activeNoveltyEffect,
    };
    this.penShelf.push(newPen);
    this.renderPenShelfItems();
    this.selectPenPreset(newPen);
    const newEl = this.penShelfElements.get(newId);
    if (newEl) {
      this.penShelfElements.forEach((el) => el.classList.remove("is-active"));
      newEl.classList.add("is-active");
    }
  }

  public removeCustomPen(penId: string): boolean {
    const idx = this.penShelf.findIndex((p) => p.id === penId);
    if (idx !== -1) {
      this.penShelf.splice(idx, 1);
      this.renderPenShelfItems();
      return true;
    }
    return false;
  }

  private selectPenPreset(pen: PenPreset): void {
    this.activePenType = pen.penType;
    this.activeInkColor = pen.color;
    this.activeInkWidth = pen.width;
    this.activeNoveltyEffect = pen.noveltyEffect;

    const novDef = pen.noveltyEffect
      ? NOVELTY_INK_DEFINITIONS.find((n) => n.effect === pen.noveltyEffect)
      : null;
    if (novDef) {
      this.activeColorIndicatorEl.style.background = novDef.gradientCss;
    } else {
      this.activeColorIndicatorEl.style.background = pen.color;
    }

    const mode =
      pen.penType === "highlighter" ? "highlighter" : pen.penType === "pencil" ? "pencil" : "pen";
    this.options.renderer?.setInkOptions({
      mode,
      penType: pen.penType,
      color: pen.color,
      strokeWidth: pen.width,
      noveltyEffect: pen.noveltyEffect,
    });
    this.setTool(mode as InteractionTool);
  }

  // --- TAB: HOME ---
  private buildHomeTab(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "onenote-ribbon-panel";

    // 1. Clipboard
    const clipGroup = this.createGroup(panel, "Clipboard");
    this.createActionBtn(
      clipGroup,
      "📋",
      "Paste",
      () => this.options.renderer?.paste(),
      "Paste (Ctrl+V)",
      "Paste from clipboard"
    );
    this.createActionBtn(
      clipGroup,
      "✂️",
      "Cut",
      () => this.options.renderer?.cutSelection(),
      "Cut (Ctrl+X)",
      "Cut selection"
    );
    this.createActionBtn(
      clipGroup,
      "📄",
      "Copy",
      () => this.options.renderer?.copySelection(),
      "Copy (Ctrl+C)",
      "Copy selection"
    );

    this.createDivider(panel);

    // 2. Basic Text Formatting (1:1 OneNote Parity via configuration)
    const textGroup = this.createGroup(panel, "Basic Text");
    const formatGrid = document.createElement("div");
    formatGrid.className = "onenote-text-format-grid";
    formatGrid.setAttribute("role", "toolbar");
    formatGrid.setAttribute("aria-label", "Text formatting options");

    for (const act of TEXT_FORMAT_ACTIONS_CONFIG) {
      if (act.isCustom && act.command === "todoTag") {
        this.createTextFormatBtn(formatGrid, act.htmlIcon, act.title, act.ariaLabel, () =>
          this.insertTodoTag()
        );
      } else {
        this.createTextFormatBtn(formatGrid, act.htmlIcon, act.title, act.ariaLabel, () => {
          document.execCommand(act.command, false, act.arg);
        });
      }
    }
    textGroup.appendChild(formatGrid);

    this.createDivider(panel);

    // 3. Text Containers
    const noteGroup = this.createGroup(panel, "Containers");
    this.createActionBtn(
      noteGroup,
      "📝",
      "Note Box",
      () => this.options.renderer?.insertNoteContainer(),
      "Insert Note Box",
      "Insert Note Container"
    );

    this.createDivider(panel);

    // 4. Canvas Quick Actions (Balanced layout without blank voids)
    const canvasGroup = this.createGroup(panel, "Canvas");
    this.createActionBtn(
      canvasGroup,
      "↶",
      "Undo",
      () => this.options.renderer?.undo(),
      "Undo (Ctrl+Z)",
      "Undo action"
    );
    this.createActionBtn(
      canvasGroup,
      "↷",
      "Redo",
      () => this.options.renderer?.redo(),
      "Redo (Ctrl+Y)",
      "Redo action"
    );
    this.createActionBtn(
      canvasGroup,
      "⛶",
      "Fit View",
      () => {
        if (this.options.renderer) {
          this.options.renderer.fitToPage({ padding: 48, align: "top-left" });
          this.updateZoomDisplay();
        }
      },
      "Fit Content",
      "Fit all content to view"
    );
    this.createActionBtn(
      canvasGroup,
      "📋",
      "Properties",
      () => this.options.onPagePropertiesClick?.(),
      "Page Properties & Metadata",
      "View and edit page properties"
    );

    return panel;
  }

  private createTextFormatBtn(
    container: HTMLElement,
    icon: string,
    title: string,
    ariaLabel: string,
    action: () => void
  ): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "onenote-ribbon-btn onenote-text-format-btn";
    btn.title = title;
    btn.setAttribute("aria-label", ariaLabel);
    const iconSpan = document.createElement("span");
    iconSpan.className = "onenote-btn-icon-symbol";
    iconSpan.setAttribute("aria-hidden", "true");
    iconSpan.textContent = icon;
    btn.appendChild(iconSpan);
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault(); // Keep focus within the active text container
      action();
    });
    container.appendChild(btn);
    return btn;
  }

  private insertTodoTag(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    const checkWrap = document.createElement("label");
    checkWrap.className = "onenote-todo-item";
    checkWrap.contentEditable = "false";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "onenote-todo-checkbox";
    checkbox.setAttribute("aria-label", "To-Do checkbox");
    checkbox.onclick = (e) => {
      e.stopPropagation();
      checkWrap.classList.toggle("is-checked", checkbox.checked);
    };

    checkWrap.appendChild(checkbox);
    range.insertNode(checkWrap);
    range.setStartAfter(checkWrap);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // --- TAB: INSERT ---
  private buildInsertTab(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "onenote-ribbon-panel";

    // Tables
    const tableGroup = this.createGroup(panel, "Tables");
    this.createActionBtn(
      tableGroup,
      "📊",
      "2x2 Table",
      () => this.options.renderer?.insertTable(2, 2),
      "Insert 2x2 Table",
      "Insert two by two table"
    );
    this.createActionBtn(
      tableGroup,
      "📊",
      "3x3 Table",
      () => this.options.renderer?.insertTable(3, 3),
      "Insert 3x3 Table",
      "Insert three by three table"
    );

    this.createDivider(panel);

    // Images & Files (Aspect-ratio preserving proportional scaling)
    const imgGroup = this.createGroup(panel, "Images & Files");
    const imgInput = document.createElement("input");
    imgInput.type = "file";
    imgInput.accept = "image/*";
    imgInput.className = "onenote-hidden-file-input";
    imgInput.setAttribute("aria-hidden", "true");
    imgInput.onchange = () => {
      const file = imgInput.files?.[0];
      if (file && this.options.renderer) {
        const objectUrl = URL.createObjectURL(file);
        const tempImg = new Image();

        tempImg.onload = () => {
          const origW = tempImg.naturalWidth || INSERT_IMAGE_LIMITS.FALLBACK_WIDTH;
          const origH = tempImg.naturalHeight || INSERT_IMAGE_LIMITS.FALLBACK_HEIGHT;
          URL.revokeObjectURL(objectUrl);

          const maxW = INSERT_IMAGE_LIMITS.DEFAULT_MAX_WIDTH;
          const maxH = INSERT_IMAGE_LIMITS.DEFAULT_MAX_HEIGHT;
          let finalW = origW;
          let finalH = origH;
          if (finalW > maxW || finalH > maxH) {
            const ratio = Math.min(maxW / finalW, maxH / finalH);
            finalW = Math.round(finalW * ratio);
            finalH = Math.round(finalH * ratio);
          }
          const assetId = IdGenerator.assetId("img_" + Date.now());
          this.options.renderer?.insertImage(assetId, file.type, finalW, finalH);
        };

        tempImg.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          const assetId = IdGenerator.assetId("img_" + Date.now());
          this.options.renderer?.insertImage(
            assetId,
            file.type,
            INSERT_IMAGE_LIMITS.FALLBACK_WIDTH,
            INSERT_IMAGE_LIMITS.FALLBACK_HEIGHT
          );
        };

        tempImg.src = objectUrl;
      }
      imgInput.value = "";
    };
    panel.appendChild(imgInput);

    this.createActionBtn(
      imgGroup,
      "🖼️",
      "Picture",
      () => imgInput.click(),
      "Insert Picture from File",
      "Insert picture"
    );

    this.createDivider(panel);

    // Links & Stamps (1:1 OneNote Parity)
    const mediaGroup = this.createGroup(panel, "Links & Stamps");
    this.createActionBtn(
      mediaGroup,
      "🔗",
      "Link",
      () => {
        if (this.options.onInsertLink) {
          this.options.onInsertLink();
        } else {
          const url = prompt("Enter Note wikilink or web URL (e.g. [[Note Name]] or https://):");
          if (url) {
            document.execCommand("createLink", false, url);
          }
        }
      },
      "Insert Link (Ctrl+K)",
      "Insert hyperlink or wikilink"
    );
    this.createActionBtn(
      mediaGroup,
      "📅",
      "Date",
      () => {
        const now = new Date();
        document.execCommand("insertText", false, now.toLocaleDateString());
      },
      "Insert Current Date",
      "Insert current date"
    );
    this.createActionBtn(
      mediaGroup,
      "🕒",
      "Time",
      () => {
        const now = new Date();
        document.execCommand(
          "insertText",
          false,
          now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        );
      },
      "Insert Current Time",
      "Insert current time"
    );

    this.createDivider(panel);

    // Sticky Notes
    const stickyGroup = this.createGroup(panel, "Sticky Notes");
    const dotsRow = document.createElement("div");
    dotsRow.className = "onenote-sticky-dots-row";
    for (const preset of RIBBON_STICKY_COLOR_PRESETS) {
      const pal = StickyNoteUtils.resolveStickyNoteColors(preset);
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "onenote-sticky-dot-btn";
      dot.style.backgroundColor = pal.background;
      dot.title = `Open ${preset} Quick Note`;
      dot.setAttribute("aria-label", `Open ${preset} quick note`);
      dot.onclick = () => {
        const activeCtx = PageContextManager.getInstance().getActivePageContext();
        const newNote = StickyNoteUtils.createDefaultStickyNote({ color: preset });
        const app =
          this.options.app ||
          (window as any)?.app ||
          (this.el.ownerDocument?.defaultView as any)?.app;
        if (app) {
          FloatingStickyNoteManager.getInstance().openPopoutWindow(app, newNote, activeCtx?.pageId);
          return;
        }
        this.options.renderer?.insertStickyNote(preset);
      };
      dotsRow.appendChild(dot);
    }
    stickyGroup.appendChild(dotsRow);

    return panel;
  }

  // --- TAB: VIEW ---
  private buildViewTab(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "onenote-ribbon-panel";

    // Page Rules from centralized configuration
    const rulesGroup = this.createGroup(panel, "Rule Lines");
    for (const rs of RULE_LINES_CONFIG) {
      this.createActionBtn(
        rulesGroup,
        rs.icon,
        rs.label,
        () => this.options.renderer?.setPageRuleLines(rs.kind),
        `Page Rule Lines: ${rs.label}`,
        rs.ariaLabel
      );
    }

    this.createDivider(panel);

    // Page Tint from constants
    const tintGroup = this.createGroup(panel, "Page Tint");
    const tintRow = document.createElement("div");
    tintRow.className = "onenote-page-tint-row";
    for (const pc of PAGE_TINT_PRESETS) {
      const sw = document.createElement("button");
      sw.type = "button";
      sw.className = "onenote-page-tint-swatch";
      sw.style.backgroundColor = pc.color;
      sw.title = `Page Tint: ${pc.label}`;
      sw.setAttribute("aria-label", `Set page background tint to ${pc.label}`);
      sw.onclick = () => this.options.renderer?.setPageBackgroundColor(pc.color);
      tintRow.appendChild(sw);
    }
    tintGroup.appendChild(tintRow);

    this.createActionBtn(
      tintGroup,
      "🔄",
      "Reset",
      () => this.options.renderer?.setPageBackgroundColor("#ffffff"),
      "Reset Page Tint to White",
      "Reset page background tint"
    );

    this.createDivider(panel);

    // Zoom & Viewport from constants
    const zoomGroup = this.createGroup(panel, "Zoom");
    this.createActionBtn(
      zoomGroup,
      "➕",
      "Zoom In",
      () => {
        if (this.options.renderer) {
          const t = this.options.renderer.getTransform();
          const next = ViewportManager.zoomAtScreenPoint(
            t,
            { x: 48, y: 48 },
            VIEWPORT_ZOOM_LIMITS.STEP_IN,
            { minScale: VIEWPORT_ZOOM_LIMITS.MIN_SCALE, maxScale: VIEWPORT_ZOOM_LIMITS.MAX_SCALE }
          );
          this.options.renderer.setViewport(next);
          this.updateZoomDisplay();
        }
      },
      "Zoom In",
      "Zoom in canvas"
    );
    this.createActionBtn(
      zoomGroup,
      "➖",
      "Zoom Out",
      () => {
        if (this.options.renderer) {
          const t = this.options.renderer.getTransform();
          const next = ViewportManager.zoomAtScreenPoint(
            t,
            { x: 48, y: 48 },
            VIEWPORT_ZOOM_LIMITS.STEP_OUT,
            { minScale: VIEWPORT_ZOOM_LIMITS.MIN_SCALE, maxScale: VIEWPORT_ZOOM_LIMITS.MAX_SCALE }
          );
          this.options.renderer.setViewport(next);
          this.updateZoomDisplay();
        }
      },
      "Zoom Out",
      "Zoom out canvas"
    );
    this.createActionBtn(
      zoomGroup,
      "1:1",
      "100%",
      () => {
        if (this.options.renderer) {
          this.options.renderer.fitToPage({ padding: 48, align: "top-left" });
          this.updateZoomDisplay();
        }
      },
      "Reset to 100%",
      "Reset zoom to 100 percent"
    );
    this.createActionBtn(
      zoomGroup,
      "⛶",
      "Fit Page",
      () => {
        if (this.options.renderer) {
          this.options.renderer.fitToPage({ padding: 48, align: "top-left" });
          this.updateZoomDisplay();
        }
      },
      "Fit Content",
      "Fit all content to view"
    );
    this.createActionBtn(
      zoomGroup,
      "🎯",
      "Selection",
      () => {
        if (this.options.renderer) {
          this.options.renderer.zoomToSelection({ padding: VIEWPORT_ZOOM_LIMITS.FIT_PADDING });
          this.updateZoomDisplay();
        }
      },
      "Zoom to Selection",
      "Zoom to selected content"
    );

    this.createDivider(panel);

    const infoGroup = this.createGroup(panel, "Page Info");
    this.createActionBtn(
      infoGroup,
      "📋",
      "Properties",
      () => this.options.onPagePropertiesClick?.(),
      "Page Properties & Metadata",
      "View and edit page properties"
    );

    return panel;
  }

  private createGroup(panel: HTMLElement, title: string): HTMLElement {
    const grp = document.createElement("div");
    grp.className = "onenote-ribbon-group";
    grp.setAttribute("role", "group");
    grp.setAttribute("aria-label", title);

    const content = document.createElement("div");
    content.className = "onenote-ribbon-group-content";
    grp.appendChild(content);

    const lbl = document.createElement("div");
    lbl.className = "onenote-ribbon-group-title";
    lbl.textContent = title;
    grp.appendChild(lbl);

    panel.appendChild(grp);
    return content;
  }

  private createDivider(panel: HTMLElement): void {
    const div = document.createElement("div");
    div.className = "onenote-ribbon-divider";
    div.setAttribute("aria-hidden", "true");
    panel.appendChild(div);
  }

  private createToolButton(
    container: HTMLElement,
    id: InteractionTool,
    icon: string,
    label: string,
    title: string
  ): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "onenote-ribbon-btn";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    const iconSpan = document.createElement("span");
    iconSpan.className = "onenote-btn-icon-symbol";
    iconSpan.setAttribute("aria-hidden", "true");
    iconSpan.textContent = icon;
    const labelSpan = document.createElement("span");
    labelSpan.className = "onenote-btn-label";
    labelSpan.textContent = label;
    btn.appendChild(iconSpan);
    btn.appendChild(labelSpan);
    btn.onclick = () => this.setTool(id);
    container.appendChild(btn);
    return btn;
  }

  private createActionBtn(
    container: HTMLElement,
    icon: string,
    label: string,
    onClick: (e: MouseEvent) => void,
    title?: string,
    ariaLabel?: string
  ): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "onenote-ribbon-btn";
    btn.title = title || label;
    btn.setAttribute("aria-label", ariaLabel || title || label);
    const iconSpan = document.createElement("span");
    iconSpan.className = "onenote-btn-icon-symbol";
    iconSpan.setAttribute("aria-hidden", "true");
    iconSpan.textContent = icon;
    const labelSpan = document.createElement("span");
    labelSpan.className = "onenote-btn-label";
    labelSpan.textContent = label;
    btn.appendChild(iconSpan);
    btn.appendChild(labelSpan);
    btn.onclick = (e: MouseEvent) => onClick(e);
    container.appendChild(btn);
    return btn;
  }
}
