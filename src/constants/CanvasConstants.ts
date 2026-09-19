import { Point, Point2D } from "../geometry/Point";
import { Rectangle } from "../geometry/Rectangle";

/**
 * Viewport camera, culling, and canvas host dimension constraints.
 */
export const CANVAS_VIEWPORT_METRICS = {
  DEFAULT_HOST_WIDTH: 1000,
  DEFAULT_HOST_HEIGHT: 800,
  FOCUS_FALLBACK_WIDTH: 800,
  FOCUS_FALLBACK_HEIGHT: 600,
  FOCUS_ZOOM_MIN: 0.8,
  FOCUS_ZOOM_MAX: 1.5,
  CULLING_PADDING: 400,
  FALLBACK_SCENE_RECT: {
    X: -2000,
    Y: -2000,
    WIDTH: 6000,
    HEIGHT: 6000,
  },
  MIN_VIEWPORT_DIMENSION: 10,
  MIN_CULLING_DIMENSION: 1,
  DEFAULT_BACKGROUND_COLOR: 0xffffff,
  DEFAULT_SCALE: 1.0,
} as const;

/**
 * HTML/DOM overlay and WebGL canvas z-index layering hierarchy.
 */
export const CANVAS_LAYER_ZINDEX = {
  WEBGL_CANVAS: "1",
  DOM_OVERLAY: "2",
  RULER: "40",
  CONTEXT_MENU: "10000",
} as const;

/**
 * Interaction thresholds, gestures, zoom factors, and keyboard step intervals.
 */
export const CANVAS_INTERACTION_METRICS = {
  WHEEL_ZOOM_IN: 1.15,
  WHEEL_ZOOM_OUT: 0.85,
  DRAG_START_THRESHOLD: 3,
  CLICK_TO_TYPE_THRESHOLD: 5,
  SHAPE_MIN_DRAG_DISTANCE: 8,
  DUPLICATE_OFFSET: 20,
  NUDGE_NORMAL_STEP: 1,
  NUDGE_SHIFT_STEP: 10,
  FOCUS_INPUT_DELAY_MS: 30,
  FOCUS_STICKY_DELAY_MS: 40,
  CONTEXT_MENU_DISMISS_DELAY_MS: 10,
} as const;

/**
 * Default metric constraints and layout properties for inserting elements onto the canvas.
 */
export const CANVAS_INSERTION_DEFAULTS = {
  DEFAULT_SPAWN_X: 120,
  DEFAULT_SPAWN_Y: 160,
  STICKY_SPAWN_X: 140,
  STICKY_SPAWN_Y: 180,
  IMAGE_WIDTH: 300,
  IMAGE_HEIGHT: 200,
  IMAGE_MIME_TYPE: "image/png" as string,
  TABLE_COLS: 2 as number,
  TABLE_ROWS: 2 as number,
  TABLE_COL_WIDTH: 140,
  TABLE_ROW_HEIGHT: 40,
  TEXT_BOX_WIDTH: 360,
  TEXT_BOX_HEIGHT: 40,
  NOTE_CONTAINER_WIDTH: 360,
  NOTE_CONTAINER_HEIGHT: 80,
  STICKY_NOTE_WIDTH: 240,
  STICKY_NOTE_HEIGHT: 200,
  STICKY_NOTE_DEFAULT_COLOR: "yellow" as string,
  MIN_STICKY_RESIZE_WIDTH: 140,
  MIN_STICKY_RESIZE_HEIGHT: 100,
  MIN_NODE_RESIZE_WIDTH: 100,
  MIN_TEXT_CONTAINER_WIDTH: 120,
} as const;

/**
 * Visual styling and bezier curve metrics for knowledge graph spatial links and anchors.
 */
export const CANVAS_SPATIAL_LINK_METRICS = {
  OUTBOUND_BASE_COLOR: 0x6366f1,
  OUTBOUND_HIGHLIGHT_COLOR: 0x4f46e5,
  INBOUND_BASE_COLOR: 0x10b981,
  INBOUND_HIGHLIGHT_COLOR: 0x059669,
  BASE_STROKE_WIDTH: 2.0,
  HIGHLIGHT_STROKE_WIDTH: 3.0,
  GLOW_EXTRA_WIDTH: 4.0,
  BASE_ALPHA: 0.75,
  HIGHLIGHT_ALPHA: 1.0,
  GLOW_ALPHA: 0.25,
  TETHER_COLOR: 0x8b5cf6,
  TETHER_HIGHLIGHT_COLOR: 0x7c3aed,
} as const;

/**
 * Visual rendering and stroke metrics for spatial ink drawings and highlighters.
 */
export const CANVAS_INK_METRICS = {
  TRANSPARENT_HIT_ALPHA: 0.001,
  MIN_BOUNDS_DIMENSION: 1,
  BATCH_MIN_WIDTH: 1,
  HIGHLIGHTER_ALPHA: 0.7,
  PEN_ALPHA: 1.0,
  PENCIL_STROKE_OPACITY: "0.8",
  PENCIL_DASHARRAY: "2 1.5",
  DEFAULT_HIGHLIGHTER_COLOR: "#ffcc33",
  DEFAULT_PEN_COLOR: "#000000",
  DEFAULT_STROKE_WIDTH: 2,
  DEFAULT_HIGHLIGHTER_WIDTH: 8,
} as const;

export type ContextMenuActionId =
  | "bringToFront"
  | "bringForward"
  | "sendBackward"
  | "sendToBack"
  | "cut"
  | "copy"
  | "paste"
  | "duplicate"
  | "delete";

export interface ContextMenuActionItem {
  readonly type: "action";
  readonly action: ContextMenuActionId;
  readonly icon: string;
  readonly label: string;
  readonly shortcut: string;
}

export interface ContextMenuSeparatorItem {
  readonly type: "separator";
}

export type ContextMenuItem = ContextMenuActionItem | ContextMenuSeparatorItem;

/**
 * Context menu definitions for canvas selection and empty workspace clicks.
 */
export const CANVAS_CONTEXT_MENU_CONFIG = {
  SELECTION_ITEMS: [
    {
      type: "action",
      action: "bringToFront",
      icon: "🔝",
      label: "Bring to Front",
      shortcut: "Ctrl+Shift+]",
    },
    {
      type: "action",
      action: "bringForward",
      icon: "🔼",
      label: "Bring Forward",
      shortcut: "Ctrl+]",
    },
    {
      type: "action",
      action: "sendBackward",
      icon: "🔽",
      label: "Send Backward",
      shortcut: "Ctrl+[",
    },
    {
      type: "action",
      action: "sendToBack",
      icon: "🔙",
      label: "Send to Back",
      shortcut: "Ctrl+Shift+[",
    },
    { type: "separator" },
    { type: "action", action: "cut", icon: "✂️", label: "Cut", shortcut: "Ctrl+X" },
    { type: "action", action: "copy", icon: "📋", label: "Copy", shortcut: "Ctrl+C" },
    { type: "action", action: "paste", icon: "📄", label: "Paste", shortcut: "Ctrl+V" },
    { type: "action", action: "duplicate", icon: "🔁", label: "Duplicate", shortcut: "Ctrl+D" },
    { type: "separator" },
    { type: "action", action: "delete", icon: "🗑️", label: "Delete", shortcut: "Del" },
  ] as readonly ContextMenuItem[],

  EMPTY_CANVAS_ITEMS: [
    { type: "action", action: "paste", icon: "📄", label: "Paste", shortcut: "Ctrl+V" },
  ] as readonly ContextMenuItem[],
} as const;

/**
 * Canonical cursor styles mapped to interaction tools.
 */
export const CANVAS_CURSORS = {
  pan: "grab",
  panning: "grabbing",
  pen: "crosshair",
  pencil: "crosshair",
  highlighter: "crosshair",
  shape: "crosshair",
  eraser: "cell",
  lasso: "crosshair",
  ruler: "pointer",
  default: "default",
} as const;

/**
 * Helpers to generate fallback geometry using typed constants.
 */
export function createFallbackSceneRect(): Rectangle {
  return Rectangle.create(
    CANVAS_VIEWPORT_METRICS.FALLBACK_SCENE_RECT.X,
    CANVAS_VIEWPORT_METRICS.FALLBACK_SCENE_RECT.Y,
    CANVAS_VIEWPORT_METRICS.FALLBACK_SCENE_RECT.WIDTH,
    CANVAS_VIEWPORT_METRICS.FALLBACK_SCENE_RECT.HEIGHT
  );
}

export function createDefaultSpawnPoint(): Point2D {
  return new Point(
    CANVAS_INSERTION_DEFAULTS.DEFAULT_SPAWN_X,
    CANVAS_INSERTION_DEFAULTS.DEFAULT_SPAWN_Y
  );
}

export function createStickySpawnPoint(): Point2D {
  return new Point(
    CANVAS_INSERTION_DEFAULTS.STICKY_SPAWN_X,
    CANVAS_INSERTION_DEFAULTS.STICKY_SPAWN_Y
  );
}
