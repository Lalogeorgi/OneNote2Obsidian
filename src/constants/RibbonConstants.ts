import { NoveltyInkEffect, PenType, ShapeKind } from "../model/CanonicalElements";
import { StickyNoteColorPreset } from "../model/CanonicalStickyNote";

export type RibbonTabId = "home" | "insert" | "draw" | "view";

export interface RibbonTabConfig {
  readonly id: RibbonTabId;
  readonly label: string;
  readonly tooltip: string;
}

export const RIBBON_TABS_CONFIG: readonly RibbonTabConfig[] = [
  { id: "home", label: "Home", tooltip: "Home (Double-click to collapse / expand)" },
  { id: "insert", label: "Insert", tooltip: "Insert (Double-click to collapse / expand)" },
  { id: "draw", label: "Draw", tooltip: "Draw (Double-click to collapse / expand)" },
  { id: "view", label: "View", tooltip: "View (Double-click to collapse / expand)" },
];

export interface TextFormatActionConfig {
  readonly command: string;
  readonly htmlIcon: string;
  readonly title: string;
  readonly ariaLabel: string;
  readonly arg?: string;
  readonly isCustom?: boolean;
}

export const TEXT_FORMAT_ACTIONS_CONFIG: readonly TextFormatActionConfig[] = [
  {
    command: "bold",
    htmlIcon:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>',
    title: "Bold (Ctrl+B)",
    ariaLabel: "Bold",
  },
  {
    command: "italic",
    htmlIcon:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>',
    title: "Italic (Ctrl+I)",
    ariaLabel: "Italic",
  },
  {
    command: "underline",
    htmlIcon:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>',
    title: "Underline (Ctrl+U)",
    ariaLabel: "Underline",
  },
  {
    command: "strikeThrough",
    htmlIcon:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg>',
    title: "Strikethrough",
    ariaLabel: "Strikethrough",
  },
  {
    command: "insertUnorderedList",
    htmlIcon:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>',
    title: "Bulleted List",
    ariaLabel: "Bulleted List",
  },
  {
    command: "insertOrderedList",
    htmlIcon:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 10V4h1"/><path d="M3 18h3.5a1.5 1.5 0 0 0 0-3H5a1 1 0 0 1 0-2h1.5"/></svg>',
    title: "Numbered List",
    ariaLabel: "Numbered List",
  },
  {
    command: "todoTag",
    htmlIcon:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="3"/><polyline points="9 12 11.5 14.5 16 9"/></svg>',
    title: "To-Do Tag",
    ariaLabel: "To-Do Tag",
    isCustom: true,
  },
  {
    command: "hiliteColor",
    htmlIcon:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 11-6 6v3h3l6-6"/><path d="m22 7-4.5-4.5a2.12 2.12 0 0 0-3 0L10.5 6.5l7 7L21.5 9.5a2.12 2.12 0 0 0 0-3Z"/><line x1="14" y1="21" x2="20" y2="21"/></svg>',
    title: "Highlight",
    ariaLabel: "Highlight",
    arg: "#FEF08A",
  },
];

export interface ShapeChoiceConfig {
  readonly kind: ShapeKind;
  readonly icon: string;
  readonly label: string;
  readonly ariaLabel: string;
  readonly category: "lines" | "basic" | "graph";
}

export const SHAPE_CHOICES_CONFIG: readonly ShapeChoiceConfig[] = [
  // Lines & Arrows
  {
    kind: "line",
    icon: "╱",
    label: "Line",
    ariaLabel: "Draw straight line shape",
    category: "lines",
  },
  { kind: "arrow", icon: "➔", label: "Arrow", ariaLabel: "Draw arrow shape", category: "lines" },
  {
    kind: "double_arrow",
    icon: "⬄",
    label: "Double Arrow",
    ariaLabel: "Draw double arrow shape",
    category: "lines",
  },
  {
    kind: "coordinate_system",
    icon: "┼",
    label: "Graph Axes",
    ariaLabel: "Draw coordinate axes shape",
    category: "lines",
  },

  // Basic Shapes
  {
    kind: "rectangle",
    icon: "▭",
    label: "Rectangle",
    ariaLabel: "Draw rectangle shape",
    category: "basic",
  },
  {
    kind: "rounded_rectangle",
    icon: "▢",
    label: "Rounded Rectangle",
    ariaLabel: "Draw rounded rectangle shape",
    category: "basic",
  },
  {
    kind: "ellipse",
    icon: "◯",
    label: "Oval / Circle",
    ariaLabel: "Draw ellipse or circle shape",
    category: "basic",
  },
  {
    kind: "triangle",
    icon: "△",
    label: "Triangle",
    ariaLabel: "Draw triangle shape",
    category: "basic",
  },
  {
    kind: "right_triangle",
    icon: "◺",
    label: "Right Triangle",
    ariaLabel: "Draw right triangle shape",
    category: "basic",
  },
  {
    kind: "diamond",
    icon: "◇",
    label: "Diamond",
    ariaLabel: "Draw diamond shape",
    category: "basic",
  },
  {
    kind: "star",
    icon: "★",
    label: "5-Point Star",
    ariaLabel: "Draw 5-point star shape",
    category: "basic",
  },
];

export interface EraserModeConfig {
  readonly mode: "stroke" | "point_small" | "point_medium" | "point_large";
  readonly label: string;
  readonly ariaLabel: string;
  readonly radius: number;
}

export interface RuleLineOptionConfig {
  readonly kind: "none" | "standard-ruled" | "small-grid";
  readonly label: string;
  readonly icon: string;
  readonly ariaLabel: string;
}

export const RULE_LINES_CONFIG: readonly RuleLineOptionConfig[] = [
  { kind: "none", label: "None", icon: "⬜", ariaLabel: "No rule lines" },
  { kind: "standard-ruled", label: "Ruled", icon: "≡", ariaLabel: "Ruled notebook lines" },
  { kind: "small-grid", label: "Grid", icon: "▦", ariaLabel: "Small grid lines" },
];

export const MAX_PEN_SHELF_COUNT = 10;

export const RIBBON_UI_STRINGS = {
  TOOLBAR_ARIA: "Canvas Toolbar",
  TABLIST_ARIA: "Ribbon Navigation Tabs",
  LEFT_CONTROLS_ARIA: "Quick Access and Workspace Brand",
  RIGHT_CONTROLS_ARIA: "Canvas View and Ribbon State Controls",
  CANVAS_ICON_TITLE: "Canvas",
  CANVAS_ICON_ARIA: "Canvas Workspace",
  UNDO_TITLE: "Undo (Ctrl+Z)",
  UNDO_ARIA: "Undo last spatial action",
  REDO_TITLE: "Redo (Ctrl+Y)",
  REDO_ARIA: "Redo last undone action",
  COLLAPSE_TITLE: "Collapse / Expand Ribbon",
  COLLAPSE_ARIA: "Collapse or expand ribbon toolbar",
  ZOOM_RESET_TITLE: "Reset Zoom to 100%",
  ZOOM_RESET_ARIA: "Reset canvas zoom to 100 percent",
  CUSTOM_PEN_NAME: "Custom Pen",
  ADD_PEN_TITLE: "Add Pen or Highlighter to Favorites Shelf",
  ADD_PEN_ARIA: "Add custom pen to shelf",
  STANDARD_COLORS_TITLE: "Standard Colors",
  NOVELTY_INKS_TITLE: "Special Effects & Novelty Inks",
  THICKNESS_TITLE: "Thickness",
  MAX_PENS_REACHED: "Maximum pens reached on shelf (10). Right-click any custom pen to remove it.",
  ADD_PEN_MENU_TITLE: "Add to Pen Shelf",
  ADD_PEN_OPTION_PEN: "Pen (Gel)",
  ADD_PEN_OPTION_HIGHLIGHTER: "Highlighter",
  ADD_PEN_OPTION_PENCIL: "Pencil",
  REMOVE_PEN_TITLE: "Remove from favorites shelf",
} as const;

export const RIBBON_SVG_ICONS = {
  CANVAS_BADGE: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  UNDO: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
  REDO: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  CHEVRON_UP: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>`,
  CHEVRON_DOWN: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`,
  SELECT: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>`,
  LASSO: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 22a5 5 0 0 1-2-4"/><path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1"/><path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>`,
  PAN: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
  ERASER: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`,
  SHAPES: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.3 10a4 4 0 1 0-5.6-5.6 4 4 0 0 0 5.6 5.6z"/><rect width="6" height="6" x="15" y="14" rx="1"/><path d="m14 4 4 7H10z"/></svg>`,
  INK_TO_SHAPE: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/><path d="m5 2 5 5"/><path d="M2 5l5 5"/></svg>`,
  RULER: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 7.82-3.55-3.55a2 2 0 0 0-2.83 0L2.55 17.08a2 2 0 0 0 0 2.83l3.54 3.54a2 2 0 0 0 2.83 0l12.81-12.8a2 2 0 0 0 0-2.83Z"/><path d="m7.5 10.5 2 2"/><path d="m10.5 7.5 2 2"/><path d="m13.5 4.5 2 2"/></svg>`,
  BRING_FRONT: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  SEND_BACK: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="2"/><path d="M8 20h12c1.1 0 2-.9 2-2V8"/></svg>`,
  NOTE_BOX: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  COPY: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  PASTE: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`,
  CUT: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>`,
  FIT_VIEW: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`,
  PROPERTIES: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  TABLE: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>`,
  IMAGE: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  ATTACHMENT: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
  STICKY: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/></svg>`,
  LINK: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  DATE: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  TIME: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  RULES: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  PALETTE: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>`,
  ZOOM_IN: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
  ZOOM_OUT: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
  ZOOM_RESET: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9 12h6"/></svg>`,
  SELECTION: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
} as const;

export interface PenPreset {
  id: string;
  name: string;
  penType: PenType;
  color: string;
  width: number;
  noveltyEffect?: NoveltyInkEffect;
}

export interface NoveltyInkDef {
  effect: NoveltyInkEffect;
  label: string;
  gradientCss: string;
  stops: Array<{ offset: string; color: string }>;
}

export interface ThicknessPreset {
  width: number;
  label: string;
}

export interface PageTintPreset {
  color: string;
  label: string;
}

/**
 * 8 Curated Authentic Microsoft OneNote Favorite Pens for the Pen Shelf.
 */
export const DEFAULT_PEN_SHELF_PRESETS: readonly PenPreset[] = [
  { id: "pen-black", name: "0.5mm Black Pen", penType: "gel", color: "#000000", width: 2.0 },
  { id: "pen-blue", name: "0.7mm Blue Pen", penType: "ballpoint", color: "#1e40af", width: 2.0 },
  { id: "pen-red", name: "0.5mm Red Pen", penType: "gel", color: "#dc2626", width: 2.0 },
  { id: "pen-green", name: "0.7mm Green Pen", penType: "gel", color: "#16a34a", width: 2.0 },
  { id: "pen-pencil", name: "0.5mm Pencil", penType: "pencil", color: "#4b5563", width: 1.5 },
  {
    id: "high-yellow",
    name: "Yellow Highlighter",
    penType: "highlighter",
    color: "#fef08a",
    width: 16.0,
  },
  {
    id: "high-cyan",
    name: "Cyan Highlighter",
    penType: "highlighter",
    color: "#67e8f9",
    width: 16.0,
  },
  {
    id: "nov-rainbow",
    name: "Rainbow Pen",
    penType: "gel",
    color: "#ef4444",
    width: 3.5,
    noveltyEffect: "rainbow",
  },
];

/**
 * 24 Classic OneNote Standard Palette Colors.
 */
export const ONENOTE_STANDARD_PALETTE: readonly string[] = [
  "#000000",
  "#4B5563",
  "#9CA3AF",
  "#FFFFFF",
  "#1E40AF",
  "#3B82F6",
  "#60A5FA",
  "#93C5FD",
  "#16A34A",
  "#22C55E",
  "#4ADE80",
  "#86EFAC",
  "#DC2626",
  "#EF4444",
  "#F87171",
  "#FCA5A5",
  "#D97706",
  "#F59E0B",
  "#FBBF24",
  "#FEF08A",
  "#9333EA",
  "#A855F7",
  "#C084FC",
  "#E9D5FF",
];

/**
 * 6 Signature OneNote Novelty Inks with CSS gradients and SVG stop values.
 */
export const NOVELTY_INK_DEFINITIONS: readonly NoveltyInkDef[] = [
  {
    effect: "rainbow",
    label: "Rainbow",
    gradientCss: "linear-gradient(135deg, #ef4444, #eab308, #22c55e, #3b82f6, #a855f7)",
    stops: [
      { offset: "0%", color: "#ef4444" },
      { offset: "25%", color: "#eab308" },
      { offset: "50%", color: "#22c55e" },
      { offset: "75%", color: "#3b82f6" },
      { offset: "100%", color: "#a855f7" },
    ],
  },
  {
    effect: "galaxy",
    label: "Galaxy",
    gradientCss: "linear-gradient(135deg, #1e1b4b, #6366f1, #d946ef, #0284c7)",
    stops: [
      { offset: "0%", color: "#1e1b4b" },
      { offset: "35%", color: "#6366f1" },
      { offset: "70%", color: "#d946ef" },
      { offset: "100%", color: "#0284c7" },
    ],
  },
  {
    effect: "gold",
    label: "Gold",
    gradientCss: "linear-gradient(135deg, #b45309, #fef08a, #d97706)",
    stops: [
      { offset: "0%", color: "#b45309" },
      { offset: "50%", color: "#fef08a" },
      { offset: "100%", color: "#d97706" },
    ],
  },
  {
    effect: "silver",
    label: "Silver",
    gradientCss: "linear-gradient(135deg, #9ca3af, #f3f4f6, #6b7280)",
    stops: [
      { offset: "0%", color: "#9ca3af" },
      { offset: "50%", color: "#f3f4f6" },
      { offset: "100%", color: "#6b7280" },
    ],
  },
  {
    effect: "lava",
    label: "Lava",
    gradientCss: "linear-gradient(135deg, #b91c1c, #ea580c, #f59e0b)",
    stops: [
      { offset: "0%", color: "#b91c1c" },
      { offset: "50%", color: "#ea580c" },
      { offset: "100%", color: "#f59e0b" },
    ],
  },
  {
    effect: "ocean",
    label: "Ocean",
    gradientCss: "linear-gradient(135deg, #0e7490, #06b6d4, #38bdf8)",
    stops: [
      { offset: "0%", color: "#0e7490" },
      { offset: "50%", color: "#06b6d4" },
      { offset: "100%", color: "#38bdf8" },
    ],
  },
  {
    effect: "rose_gold",
    label: "Rose Gold",
    gradientCss: "linear-gradient(135deg, #9d174d, #fbcfe8, #be185d)",
    stops: [
      { offset: "0%", color: "#9d174d" },
      { offset: "50%", color: "#fbcfe8" },
      { offset: "100%", color: "#be185d" },
    ],
  },
];

/**
 * Standard OneNote Stroke Thickness Steps.
 */
export const INK_THICKNESS_PRESETS: readonly ThicknessPreset[] = [
  { width: 0.5, label: "0.5mm" },
  { width: 1.0, label: "1mm" },
  { width: 2.0, label: "2mm" },
  { width: 3.5, label: "3.5mm" },
  { width: 6.0, label: "6mm" },
  { width: 12.0, label: "12mm" },
  { width: 16.0, label: "16mm" },
];

/**
 * Eraser radii in pixels.
 */
export const ERASER_METRICS = {
  STROKE_RADIUS: 14,
  POINT_SMALL_RADIUS: 6,
  POINT_MEDIUM_RADIUS: 14,
  POINT_LARGE_RADIUS: 26,
} as const;

export const ERASER_MODES_CONFIG: readonly EraserModeConfig[] = [
  {
    mode: "stroke",
    label: `Stroke Eraser (${ERASER_METRICS.STROKE_RADIUS}px)`,
    ariaLabel: "Stroke eraser",
    radius: ERASER_METRICS.STROKE_RADIUS,
  },
  {
    mode: "point_small",
    label: `Small Point Eraser (${ERASER_METRICS.POINT_SMALL_RADIUS}px)`,
    ariaLabel: "Small point eraser",
    radius: ERASER_METRICS.POINT_SMALL_RADIUS,
  },
  {
    mode: "point_medium",
    label: `Medium Point Eraser (${ERASER_METRICS.POINT_MEDIUM_RADIUS}px)`,
    ariaLabel: "Medium point eraser",
    radius: ERASER_METRICS.POINT_MEDIUM_RADIUS,
  },
  {
    mode: "point_large",
    label: `Large Point Eraser (${ERASER_METRICS.POINT_LARGE_RADIUS}px)`,
    ariaLabel: "Large point eraser",
    radius: ERASER_METRICS.POINT_LARGE_RADIUS,
  },
];

/**
 * Heuristic thresholds for automatic Ink-to-Shape recognition.
 */
export const INK_TO_SHAPE_THRESHOLDS = {
  MIN_POINTS: 8,
  MIN_DIMENSION: 15,
  LINE_STRAIGHTNESS: 0.88,
  CLOSED_DIST_THRESHOLD: 28,
  CLOSED_MAX_DIM_RATIO: 0.28,
  CLOSED_PATH_RATIO: 0.22,
  ELLIPSE_COEF_VAR_MAX: 0.22,
  CORNER_DEFLECTION_DEG: 45,
  MIN_POINTS_FOR_CORNER: 12,
  TRIANGLE_CORNERS: 3,
  RECTANGLE_CORNERS: 4,
} as const;

/**
 * On-canvas Digital Ruler visual and interaction metrics.
 */
export const DIGITAL_RULER_METRICS = {
  WIDTH: 460,
  HEIGHT: 64,
  SNAP_THRESHOLD: 20,
  DIAL_SIZE: 44,
  MAJOR_TICK_PX: 50,
  MINOR_TICK_PX: 10,
} as const;

/**
 * Authentic OneNote Page Background Tints.
 */
export const PAGE_TINT_PRESETS: readonly PageTintPreset[] = [
  { color: "#FFFFFF", label: "White" },
  { color: "#FFFDF0", label: "Cream" },
  { color: "#F0FFF4", label: "Mint" },
  { color: "#FFF5F5", label: "Rose" },
  { color: "#1E1E1E", label: "Dark" },
];

/**
 * Page Rule and Grid line defaults.
 */
export const PAGE_RULE_DEFAULTS = {
  RULED_SPACING: 28,
  GRID_SPACING: 24,
  MARGIN_X: 96,
  LINE_COLOR: "#D0D0D0",
  MARGIN_COLOR: "#F87171",
} as const;

/**
 * Canvas Camera Viewport Limits.
 */
export const VIEWPORT_ZOOM_LIMITS = {
  MIN_SCALE: 0.2,
  MAX_SCALE: 3.0,
  STEP_IN: 1.2,
  STEP_OUT: 0.8,
  RESET_X: 60,
  RESET_Y: 60,
  RESET_SCALE: 1.0,
  FIT_PADDING: 60,
} as const;

/**
 * Image insertion constraints to preserve natural aspect ratios.
 */
export const INSERT_IMAGE_LIMITS = {
  DEFAULT_MAX_WIDTH: 600,
  DEFAULT_MAX_HEIGHT: 500,
  FALLBACK_WIDTH: 320,
  FALLBACK_HEIGHT: 240,
} as const;

/**
 * Canonical Sticky Note Colors in Ribbon order.
 */
export const RIBBON_STICKY_COLOR_PRESETS: readonly StickyNoteColorPreset[] = [
  "yellow",
  "green",
  "pink",
  "blue",
  "purple",
  "orange",
  "teal",
  "charcoal",
  "gray",
];
