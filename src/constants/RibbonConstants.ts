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
  { command: "bold", htmlIcon: "<b>B</b>", title: "Bold (Ctrl+B)", ariaLabel: "Bold" },
  { command: "italic", htmlIcon: "<i>I</i>", title: "Italic (Ctrl+I)", ariaLabel: "Italic" },
  {
    command: "underline",
    htmlIcon: "<u>U</u>",
    title: "Underline (Ctrl+U)",
    ariaLabel: "Underline",
  },
  {
    command: "strikeThrough",
    htmlIcon: "<s>S</s>",
    title: "Strikethrough",
    ariaLabel: "Strikethrough",
  },
  {
    command: "insertUnorderedList",
    htmlIcon: "•",
    title: "Bulleted List",
    ariaLabel: "Bulleted List",
  },
  {
    command: "insertOrderedList",
    htmlIcon: "1.",
    title: "Numbered List",
    ariaLabel: "Numbered List",
  },
  { command: "todoTag", htmlIcon: "☑", title: "To-Do Tag", ariaLabel: "To-Do Tag", isCustom: true },
  {
    command: "hiliteColor",
    htmlIcon: "🖍️",
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
