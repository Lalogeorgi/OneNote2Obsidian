import { StickyNoteColorPreset } from "../model/CanonicalStickyNote";

/**
 * Authoritative, centralized list of all Sticky Note color presets.
 */
export const STICKY_NOTE_COLOR_PRESETS: readonly StickyNoteColorPreset[] = [
  "yellow",
  "green",
  "pink",
  "blue",
  "purple",
  "orange",
  "teal",
  "charcoal",
  "gray",
] as const;

/**
 * Authoritative, centralized list of opacity presets for quick selection chips.
 */
export interface OpacityPreset {
  readonly label: string;
  readonly val: number;
}

export const OPACITY_PRESETS: readonly OpacityPreset[] = [
  { label: "100%", val: 1.0 },
  { label: "85%", val: 0.85 },
  { label: "60%", val: 0.6 },
  { label: "40%", val: 0.4 },
  { label: "20%", val: 0.2 },
] as const;

/**
 * Metric constraints and default measurements for Sticky Notes and Floating Windows.
 */
export const STICKY_NOTE_METRICS = {
  DEFAULT_WIDTH: 240,
  DEFAULT_HEIGHT: 200,
  MIN_WIDTH: 160,
  MIN_HEIGHT: 120,
  SIBLING_OFFSET_X: 24,
  SIBLING_OFFSET_Y: 24,
  CORNER_RADIUS: 8,
  HEADER_HEIGHT: 32,
  BOTTOM_TOOLBAR_HEIGHT: 32,
  SAVE_DEBOUNCE_MS: 300,
} as const;

export const VIEW_TYPE_STICKY_NOTE = "onenote-sticky-note-view";

/**
 * Metric constraints and default measurements for Floating Sticky Note Windows.
 */
export const FLOATING_WINDOW_METRICS = {
  MIN_WIDTH: 180,
  MIN_HEIGHT: 120,
  DEFAULT_WIDTH: 260,
  DEFAULT_HEIGHT: 220,
  DEFAULT_OFFSET_RIGHT: 360,
  DEFAULT_OFFSET_TOP: 80,
  VIEWPORT_MARGIN: 10,
  MAGNETIC_SNAP_THRESHOLD: 16,
  BASE_Z_INDEX: 1000,
  PINNED_Z_INDEX: 999999,
  SAVE_DEBOUNCE_MS: 350,
  TASKBAR_BOTTOM_MARGIN: 60,
  MIN_VISIBLE_EDGE_PX: 48,
  SCREEN_DRAG_MARGIN: -120,
} as const;

/**
 * Centralized Unicode and Emoji Glyphs for Sticky Notes UI.
 */
export const STICKY_NOTE_ICONS = {
  PLUS: "+",
  GRAB_DOTS: "⋮⋮",
  COLOR_PALETTE: "🎨",
  OPACITY: "◐",
  MENU_DOTS: "…",
  DOCK: "⤵",
  MINIMIZE: "—",
  CLOSE: "✕",
  PIN: "📌",
  LINK: "🔗",
  ANCHOR: "⚓",
  HUB_LIST: "📋",
  POPOUT: "↗",
  POPOUT_WINDOW: "↗",
  DUPLICATE: "⧉",
  DELETE: "🗑️",
  CHECKLIST: "☑",
  IMAGE: "📷",
  BOLD: "B",
  ITALIC: "I",
  UNDERLINE: "U",
  STRIKE: "S",
  BULLET: "•",
} as const;

/**
 * Polished, high-fidelity vector SVG icons for Sticky Notes UI.
 * Designed with Microsoft Fluent precision, crisp rounded strokes, and styling-agnostic currentColor.
 */
export const STICKY_NOTE_SVG_ICONS = {
  PLUS: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
  GRAB_DOTS: `<svg width="10" height="14" viewBox="0 0 16 24" fill="currentColor"><circle cx="5" cy="5" r="1.8"/><circle cx="11" cy="5" r="1.8"/><circle cx="5" cy="12" r="1.8"/><circle cx="11" cy="12" r="1.8"/><circle cx="5" cy="19" r="1.8"/><circle cx="11" cy="19" r="1.8"/></svg>`,
  COLOR_PALETTE: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10a1.5 1.5 0 0 0 1.5-1.5c0-.4-.16-.78-.44-1.06-.27-.27-.44-.65-.44-1.06 0-.83.67-1.5 1.5-1.5h1.88C18.88 16.88 22 13.76 22 9.88 22 5.53 17.52 2 12 2z"/><circle cx="7.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="10.5" cy="6.5" r="1.2" fill="currentColor"/><circle cx="14.5" cy="6.5" r="1.2" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1.2" fill="currentColor"/></svg>`,
  OPACITY: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>`,
  MENU_DOTS: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`,
  DOCK: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>`,
  POPOUT: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  POPOUT_WINDOW: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><polyline points="14 7 18 7 18 11"/><line x1="12" y1="13" x2="18" y2="7"/></svg>`,
  MINIMIZE: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  CLOSE: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  PIN: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V5h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v5.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z"/></svg>`,
  LINK: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  ANCHOR: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>`,
  HUB_LIST: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
  DUPLICATE: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="13" height="13" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  DELETE: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  CHECKLIST: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  IMAGE: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  BULLET: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.8" fill="currentColor"/><circle cx="4" cy="12" r="1.8" fill="currentColor"/><circle cx="4" cy="18" r="1.8" fill="currentColor"/></svg>`,
  BOLD: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>`,
  ITALIC: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>`,
  UNDERLINE: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v7a6 6 0 0 0 12 0V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>`,
  STRIKE: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg>`,
} as const;

/**
 * Centralized UI text strings, tooltips, placeholders, and notification messages.
 */
export const STICKY_NOTE_STRINGS = {
  TITLE_PLACEHOLDER: "Title (optional)",
  BODY_PLACEHOLDER: "Take a note...",
  POPOUT_HINT: "↗ Click to Focus Quick Note",
  POPOUT_WINDOW_TOOLTIP: "Open in Independent Desktop Window (Drag Anywhere on Screen)",
  POPOUT_WINDOW_HINT: "↗ Open in Native Desktop Window",
  NEW_NOTE_TOOLTIP: "New note (Ctrl+N)",
  MENU_TOOLTIP: "Notes menu (...)",
  CLOSE_TOOLTIP: "Close note",
  DELETE_TOOLTIP: "Delete note",
  COLOR_TOOLTIP: "Change Color",
  OPACITY_TOOLTIP: "Adjust Opacity",
  DOCK_TOOLTIP: "Dock Back to Canvas Page",
  POPOUT_TOOLTIP: "Pop Out as Floating Quick Note",
  NOTES_HUB_TOOLTIP: "Open Sticky Notes Hub (Ctrl+H)",
  MINIMIZE_TOOLTIP: "Minimize / Expand",
  PIN_TOOLTIP: "Pin Note",
  UNPIN_TOOLTIP: "Unpin Note",
  PIN_FRONT_TOOLTIP: "Pin in front (Always on top)",
  UNPIN_FRONT_TOOLTIP: "Unpin from front",
  NOTES_LIST_TOOLTIP: "Notes list (Ctrl+H)",
  CLICK_TO_OPEN_HINT: "Click to open quick note",
  BACKLINKS_TOOLTIP: "View Spatial Backlinks & Connections",
  ANCHOR_TOOLTIP: "Spatial Anchor",
  HUB_TITLE: "Sticky Notes",
  HUB_SEARCH_PLACEHOLDER: "Search notes...",
  HUB_NEW_NOTE_BTN: "+ New Note",
  HUB_ALL_FILTER: "All",
  HUB_NO_SEARCH_MATCHES: "No notes matching your search.",
  HUB_EMPTY_STATE: "No sticky notes yet. Click '+ New Note' to create one.",
  HUB_EMPTY_NOTE_EXCERPT: "(Empty note)",
  UNTITLED_NOTE: "Untitled",
  DELETED_NOTICE: "Sticky note deleted",
  TRANSPARENCY_HEADER: "Transparency",
  OPACITY_HEADER: "Opacity",
  DUPLICATE_TOOLTIP: "Duplicate note (Ctrl+D)",
} as const;

/**
 * Accessibility strings and ARIA labels.
 */
export const STICKY_NOTE_ACCESSIBILITY_STRINGS = {
  DRAG_HANDLE: "Drag handle",
  DRAG_TOOLTIP: "Drag to move sticky note",
  FLOATING_NOTE_TITLE: "Floating note title",
  STICKY_NOTE_TITLE: "Sticky note title",
  DOCK_TO_CANVAS: "Dock back to canvas page (Ctrl+Enter)",
  POPOUT_WINDOW: "Open sticky note in independent desktop window",
  MINIMIZE_NOTE: "Minimize note (Escape)",
  CLOSE_FLOATING_NOTE: "Close floating note",
  DELETE_NOTE: "Delete note",
  PIN_NOTE: "Pin note",
  UNPIN_NOTE: "Unpin note",
  PIN_IN_FRONT: "Pin sticky note in front (Always on top)",
  UNPIN_FROM_FRONT: "Unpin sticky note from front",
  OPEN_NOTES_LIST: "Open Sticky Notes list (Ctrl+H)",
  CHANGE_COLOR: "Change note background color",
  ADJUST_OPACITY: "Adjust note opacity",
  SPATIAL_BACKLINKS: "Spatial backlinks and connections",
  SPATIAL_ANCHOR: "Spatial anchor attachment",
  COLOR_PRESET_PREFIX: "Color preset ",
  FILTER_PRESET_PREFIX: "Filter ",
  SET_OPACITY_PREFIX: "Set opacity to ",
} as const;

/**
 * Bottom Text Formatting Toolbar definitions.
 */
export interface StickyNoteFormatToolDefinition {
  readonly id: "bold" | "italic" | "underline" | "strike" | "bullet" | "checklist" | "image";
  readonly label: string;
  readonly svgIcon?: string;
  readonly title: string;
  readonly command?: string;
  readonly kind: "execCommand" | "checklist" | "image";
}

export const STICKY_NOTE_FORMAT_TOOLS: readonly StickyNoteFormatToolDefinition[] = [
  {
    id: "bold",
    label: `<b>${STICKY_NOTE_ICONS.BOLD}</b>`,
    svgIcon: STICKY_NOTE_SVG_ICONS.BOLD,
    title: "Bold (Ctrl+B)",
    command: "bold",
    kind: "execCommand",
  },
  {
    id: "italic",
    label: `<i>${STICKY_NOTE_ICONS.ITALIC}</i>`,
    svgIcon: STICKY_NOTE_SVG_ICONS.ITALIC,
    title: "Italic (Ctrl+I)",
    command: "italic",
    kind: "execCommand",
  },
  {
    id: "underline",
    label: `<u>${STICKY_NOTE_ICONS.UNDERLINE}</u>`,
    svgIcon: STICKY_NOTE_SVG_ICONS.UNDERLINE,
    title: "Underline (Ctrl+U)",
    command: "underline",
    kind: "execCommand",
  },
  {
    id: "strike",
    label: `<s>${STICKY_NOTE_ICONS.STRIKE}</s>`,
    svgIcon: STICKY_NOTE_SVG_ICONS.STRIKE,
    title: "Strikethrough (Ctrl+T)",
    command: "strikeThrough",
    kind: "execCommand",
  },
  {
    id: "bullet",
    label: STICKY_NOTE_SVG_ICONS.BULLET,
    svgIcon: STICKY_NOTE_SVG_ICONS.BULLET,
    title: "Toggle bullet list (Ctrl+Shift+L)",
    command: "insertUnorderedList",
    kind: "execCommand",
  },
  {
    id: "checklist",
    label: STICKY_NOTE_SVG_ICONS.CHECKLIST,
    svgIcon: STICKY_NOTE_SVG_ICONS.CHECKLIST,
    title: "Toggle checklist item",
    kind: "checklist",
  },
  {
    id: "image",
    label: STICKY_NOTE_SVG_ICONS.IMAGE,
    svgIcon: STICKY_NOTE_SVG_ICONS.IMAGE,
    title: "Insert picture / image",
    kind: "image",
  },
] as const;

/**
 * Standard Popover Menu Action Definitions.
 */
export interface StickyNoteMenuActionDefinition {
  readonly id: "hub" | "dock" | "popout" | "popout_window" | "duplicate" | "delete";
  readonly icon: string;
  readonly svgIcon?: string;
  readonly label: string;
  readonly isDanger?: boolean;
}

export const STICKY_NOTE_MENU_ACTIONS: readonly StickyNoteMenuActionDefinition[] = [
  {
    id: "hub",
    icon: STICKY_NOTE_ICONS.HUB_LIST,
    svgIcon: STICKY_NOTE_SVG_ICONS.HUB_LIST,
    label: "Notes list (Ctrl+H)",
  },
  {
    id: "dock",
    icon: STICKY_NOTE_ICONS.DOCK,
    svgIcon: STICKY_NOTE_SVG_ICONS.DOCK,
    label: "Dock to canvas (Ctrl+Enter)",
  },
  {
    id: "popout",
    icon: STICKY_NOTE_ICONS.POPOUT,
    svgIcon: STICKY_NOTE_SVG_ICONS.POPOUT,
    label: "Pop out quick note",
  },
  {
    id: "popout_window",
    icon: STICKY_NOTE_ICONS.POPOUT_WINDOW,
    svgIcon: STICKY_NOTE_SVG_ICONS.POPOUT_WINDOW,
    label: "Open in desktop window",
  },
  {
    id: "duplicate",
    icon: STICKY_NOTE_ICONS.DUPLICATE,
    svgIcon: STICKY_NOTE_SVG_ICONS.DUPLICATE,
    label: "Duplicate note (Ctrl+D)",
  },
  {
    id: "delete",
    icon: STICKY_NOTE_ICONS.DELETE,
    svgIcon: STICKY_NOTE_SVG_ICONS.DELETE,
    label: "Delete note",
    isDanger: true,
  },
] as const;

/**
 * Unified Typography and Layout styles for Sticky Notes rendering.
 */
export const STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT = {
  HEADER_FONT_WEIGHT: "600",
  HEADER_FONT_SIZE: "13px",
  HEADER_MARGIN_BOTTOM: "6px",
  HEADER_BORDER_BOTTOM: "1px solid rgba(0,0,0,0.06)",
  HEADER_PADDING_BOTTOM: "3px",
  PIN_FONT_SIZE: "11px",
  PIN_OPACITY: 0.8,
  BODY_LINE_MIN_HEIGHT: "1.2em",
  BODY_LINE_MARGIN_BOTTOM: "2px",
  CONTENT_FONT_SIZE: "13px",
  CONTENT_LINE_HEIGHT: "1.4",
  DEFAULT_INITIAL_X: 100,
  DEFAULT_INITIAL_Y: 100,
  DEFAULT_Z_INDEX: 10,
  SPATIAL_MIN_WIDTH: 120,
  SPATIAL_MIN_HEIGHT: 80,
  FLOATING_TASKBAR_BOTTOM_MARGIN: 60,
  OPACITY_SLIDER_MIN: "0.20",
  OPACITY_SLIDER_MAX: "1.0",
  OPACITY_SLIDER_STEP: "0.05",
  MIN_OPACITY: 0.2,
  DEFAULT_BACKDROP_BLUR: "blur(12px)",
  BACKDROP_BLUR_PX: 12,
  IMAGE_INPUT_ACCEPT: "image/*",
  IMAGE_ALT_TEXT: "Sticky Note Image",
} as const;

/**
 * Default canvas styling and ink tool metrics.
 */
export const CANVAS_STYLE_DEFAULTS = {
  DEFAULT_INK_COLOR: "#000000",
  DEFAULT_INK_WIDTH: 3,
  DARK_MODE_BACKGROUND: "#1E1E1E",
  DARK_MODE_RULE_COLOR: "#374151",
  LIGHT_MODE_BACKGROUND: "#FFFFFF",
  LIGHT_MODE_RULE_COLOR: "#E5E7EB",
} as const;

/**
 * Popover placement offsets relative to the sticky note header.
 */
export const POPOVER_OFFSETS = {
  TOP_PX: 32,
  RIGHT_PX: 8,
} as const;
