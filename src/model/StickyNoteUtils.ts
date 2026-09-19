import { SpatialBounds } from "../geometry/Bounds";
import {
  CanonicalStickyNote,
  StickyNoteAnchor,
  StickyNoteBacklinks,
  StickyNoteColorPreset,
  StickyNoteGrouping,
  StickyNoteSource,
  StickyNoteSpatialMeta,
  StickyNoteTheme,
} from "./CanonicalStickyNote";
import { IdGenerator, StickyNoteId } from "./Ids";
import {
  STICKY_NOTE_METRICS,
  STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT,
} from "../constants/StickyNoteConstants";

export interface ResolvedStickyNoteColors {
  readonly background: string;
  readonly header: string;
  readonly text: string;
  readonly border: string;
  readonly shadow: string;
  readonly pinColor: string;
}

export const STICKY_NOTE_PRESET_PALETTES: Record<
  StickyNoteColorPreset,
  { light: ResolvedStickyNoteColors; dark: ResolvedStickyNoteColors }
> = {
  yellow: {
    light: {
      background: "#FFF9D2",
      header: "#FFF099",
      text: "#2D2605",
      border: "#FDE68A",
      shadow: "rgba(234, 179, 8, 0.18)",
      pinColor: "#EAB308",
    },
    dark: {
      background: "#2C2812",
      header: "#3D3718",
      text: "#FFF7AA",
      border: "#5C5220",
      shadow: "rgba(0, 0, 0, 0.4)",
      pinColor: "#FACC15",
    },
  },
  green: {
    light: {
      background: "#E4F9E0",
      header: "#C8F2C2",
      text: "#0F472A",
      border: "#A7F3A5",
      shadow: "rgba(34, 197, 94, 0.18)",
      pinColor: "#16A34A",
    },
    dark: {
      background: "#132A1C",
      header: "#1B3B27",
      text: "#DCFCE7",
      border: "#2A5A3C",
      shadow: "rgba(0, 0, 0, 0.4)",
      pinColor: "#4ADE80",
    },
  },
  pink: {
    light: {
      background: "#FEEAF4",
      header: "#FCD2E9",
      text: "#701A45",
      border: "#FBC4DE",
      shadow: "rgba(236, 72, 153, 0.18)",
      pinColor: "#DB2777",
    },
    dark: {
      background: "#2D1522",
      header: "#421D32",
      text: "#FFE4F0",
      border: "#662D4D",
      shadow: "rgba(0, 0, 0, 0.4)",
      pinColor: "#F472B6",
    },
  },
  blue: {
    light: {
      background: "#E6F4FE",
      header: "#C9E9FE",
      text: "#0C3E66",
      border: "#A5D2FC",
      shadow: "rgba(14, 165, 233, 0.18)",
      pinColor: "#0284C7",
    },
    dark: {
      background: "#102436",
      header: "#18354E",
      text: "#E0F2FE",
      border: "#275277",
      shadow: "rgba(0, 0, 0, 0.4)",
      pinColor: "#38BDF8",
    },
  },
  purple: {
    light: {
      background: "#F5EDFF",
      header: "#EDDAFF",
      text: "#491B74",
      border: "#DEC2FD",
      shadow: "rgba(168, 85, 247, 0.18)",
      pinColor: "#9333EA",
    },
    dark: {
      background: "#201530",
      header: "#301F48",
      text: "#F5E8FF",
      border: "#4B3070",
      shadow: "rgba(0, 0, 0, 0.4)",
      pinColor: "#C084FC",
    },
  },
  orange: {
    light: {
      background: "#FFF0DD",
      header: "#FEDFBE",
      text: "#6E2E0D",
      border: "#FFCCA0",
      shadow: "rgba(249, 115, 22, 0.18)",
      pinColor: "#EA580C",
    },
    dark: {
      background: "#2E180E",
      header: "#422314",
      text: "#FFECD6",
      border: "#633620",
      shadow: "rgba(0, 0, 0, 0.4)",
      pinColor: "#FB923C",
    },
  },
  teal: {
    light: {
      background: "#DCFDF7",
      header: "#A7F8E8",
      text: "#0F4742",
      border: "#73F2DD",
      shadow: "rgba(20, 184, 166, 0.18)",
      pinColor: "#0D9488",
    },
    dark: {
      background: "#0F2A28",
      header: "#163D3A",
      text: "#D1FBF5",
      border: "#235E5A",
      shadow: "rgba(0, 0, 0, 0.4)",
      pinColor: "#2DD4BF",
    },
  },
  charcoal: {
    light: {
      background: "#F6F8FA",
      header: "#E8ECF2",
      text: "#1E293B",
      border: "#D4DCE8",
      shadow: "rgba(100, 116, 139, 0.18)",
      pinColor: "#475569",
    },
    dark: {
      background: "#161C24",
      header: "#202935",
      text: "#F1F5F9",
      border: "#334154",
      shadow: "rgba(0, 0, 0, 0.5)",
      pinColor: "#94A3B8",
    },
  },
  gray: {
    light: {
      background: "#F8F9FA",
      header: "#ECEEF0",
      text: "#212529",
      border: "#DEE2E6",
      shadow: "rgba(107, 114, 128, 0.18)",
      pinColor: "#4B5563",
    },
    dark: {
      background: "#1A1D21",
      header: "#25292F",
      text: "#F8F9FA",
      border: "#3B414A",
      shadow: "rgba(0, 0, 0, 0.5)",
      pinColor: "#9CA3AF",
    },
  },
};

export class StickyNoteUtils {
  public static readonly DEFAULT_WIDTH = STICKY_NOTE_METRICS.DEFAULT_WIDTH;
  public static readonly DEFAULT_HEIGHT = STICKY_NOTE_METRICS.DEFAULT_HEIGHT;
  public static readonly DEFAULT_COLOR: StickyNoteColorPreset = "yellow";
  public static readonly DEFAULT_OPACITY = 1.0;

  /**
   * Clamps and sanitizes an opacity value strictly to the range [0.0, 1.0].
   */
  public static clampOpacity(val: unknown, fallback = StickyNoteUtils.DEFAULT_OPACITY): number {
    if (typeof val !== "number" || !Number.isFinite(val)) {
      return fallback;
    }
    const clamped = Math.max(0.0, Math.min(1.0, val));
    return Number(clamped.toFixed(4));
  }

  /**
   * Factory function to create a fully initialized, type-safe CanonicalStickyNote.
   */
  public static createDefaultStickyNote(
    overrides: Partial<CanonicalStickyNote> = {}
  ): CanonicalStickyNote {
    const now = Date.now();
    const id = (overrides.id as StickyNoteId) || IdGenerator.stickyNoteId();

    const bounds: SpatialBounds = {
      x: overrides.bounds?.x ?? STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.DEFAULT_INITIAL_X,
      y: overrides.bounds?.y ?? STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.DEFAULT_INITIAL_Y,
      width: overrides.bounds?.width ?? StickyNoteUtils.DEFAULT_WIDTH,
      height: overrides.bounds?.height ?? StickyNoteUtils.DEFAULT_HEIGHT,
      rotation: overrides.bounds?.rotation ?? 0,
      zIndex: overrides.bounds?.zIndex ?? STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.DEFAULT_Z_INDEX,
    };

    const content = overrides.content ?? "";
    const color = overrides.color ?? StickyNoteUtils.DEFAULT_COLOR;
    const opacity = StickyNoteUtils.clampOpacity(overrides.opacity);

    const backlinks: StickyNoteBacklinks = {
      wikilinks: overrides.backlinks?.wikilinks ?? StickyNoteUtils.extractWikilinks(content),
      blockReferences:
        overrides.backlinks?.blockReferences ?? StickyNoteUtils.extractBlockReferences(content),
      inboundLinks: overrides.backlinks?.inboundLinks ?? [],
      outboundLinks: overrides.backlinks?.outboundLinks ?? [],
    };

    return {
      type: "stickyNote",
      id,
      bounds,
      title: overrides.title,
      content,
      paragraphs: overrides.paragraphs,
      color,
      theme: overrides.theme,
      opacity,
      createdTime: overrides.createdTime ?? now,
      modifiedTime: overrides.modifiedTime ?? now,
      author: overrides.author,
      source: overrides.source ?? { origin: "created" },
      spatialMeta: overrides.spatialMeta ?? {
        isPinned: false,
        isFolded: false,
        autoResize: false,
        minWidth: STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.SPATIAL_MIN_WIDTH,
        minHeight: STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.SPATIAL_MIN_HEIGHT,
      },
      anchor: overrides.anchor,
      grouping: overrides.grouping,
      backlinks,
      metadata: overrides.metadata ? { ...overrides.metadata } : {},
    };
  }

  /**
   * Type guard to check if an arbitrary object satisfies the CanonicalStickyNote contract.
   */
  public static isValidStickyNote(obj: unknown): obj is CanonicalStickyNote {
    if (!obj || typeof obj !== "object") return false;
    const candidate = obj as Record<string, unknown>;

    return (
      candidate.type === "stickyNote" &&
      typeof candidate.id === "string" &&
      candidate.id.length > 0 &&
      typeof candidate.bounds === "object" &&
      candidate.bounds !== null &&
      typeof (candidate.bounds as Record<string, unknown>).x === "number" &&
      typeof (candidate.bounds as Record<string, unknown>).y === "number" &&
      typeof (candidate.bounds as Record<string, unknown>).width === "number" &&
      typeof (candidate.bounds as Record<string, unknown>).height === "number" &&
      typeof candidate.content === "string" &&
      typeof candidate.opacity === "number" &&
      candidate.opacity >= 0.0 &&
      candidate.opacity <= 1.0 &&
      typeof candidate.createdTime === "number" &&
      typeof candidate.modifiedTime === "number"
    );
  }

  /**
   * Normalizes raw or legacy data into a guaranteed valid CanonicalStickyNote.
   * Safe defaults are applied for missing, malformed, or out-of-range properties.
   */
  public static normalizeStickyNote(raw: unknown): CanonicalStickyNote {
    if (!raw || typeof raw !== "object") {
      return StickyNoteUtils.createDefaultStickyNote();
    }

    const data = raw as Record<string, any>;
    const now = Date.now();

    const rawId = typeof data.id === "string" && data.id ? data.id : undefined;
    const id = IdGenerator.stickyNoteId(rawId);

    const boundsData = typeof data.bounds === "object" && data.bounds ? data.bounds : {};
    const x =
      typeof data.x === "number"
        ? data.x
        : typeof boundsData.x === "number"
          ? boundsData.x
          : STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.DEFAULT_INITIAL_X;
    const y =
      typeof data.y === "number"
        ? data.y
        : typeof boundsData.y === "number"
          ? boundsData.y
          : STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.DEFAULT_INITIAL_Y;
    const width =
      typeof data.width === "number" && data.width > 0
        ? data.width
        : typeof boundsData.width === "number" && boundsData.width > 0
          ? boundsData.width
          : StickyNoteUtils.DEFAULT_WIDTH;
    const height =
      typeof data.height === "number" && data.height > 0
        ? data.height
        : typeof boundsData.height === "number" && boundsData.height > 0
          ? boundsData.height
          : StickyNoteUtils.DEFAULT_HEIGHT;
    const zIndex =
      typeof data.zIndex === "number"
        ? data.zIndex
        : typeof boundsData.zIndex === "number"
          ? boundsData.zIndex
          : STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.DEFAULT_Z_INDEX;
    const rotation =
      typeof data.rotation === "number"
        ? data.rotation
        : typeof boundsData.rotation === "number"
          ? boundsData.rotation
          : 0;

    const bounds: SpatialBounds = { x, y, width, height, zIndex, rotation };

    const content =
      typeof data.content === "string"
        ? data.content
        : typeof data.text === "string"
          ? data.text
          : "";

    const title =
      typeof data.title === "string" && data.title.trim() ? data.title.trim() : undefined;

    const rawColor =
      typeof data.color === "string" && data.color
        ? data.color.toLowerCase()
        : StickyNoteUtils.DEFAULT_COLOR;
    const color =
      rawColor in STICKY_NOTE_PRESET_PALETTES || /^#[0-9a-fA-F]{3,8}$/.test(rawColor)
        ? rawColor
        : StickyNoteUtils.DEFAULT_COLOR;

    const opacity = StickyNoteUtils.clampOpacity(data.opacity);

    const createdTime =
      typeof data.createdTime === "number" && data.createdTime > 0 ? data.createdTime : now;
    const modifiedTime =
      typeof data.modifiedTime === "number" && data.modifiedTime > 0
        ? data.modifiedTime
        : createdTime;

    const theme: StickyNoteTheme | undefined =
      typeof data.theme === "object" && data.theme !== null
        ? {
            variant: data.theme.variant,
            cornerStyle: data.theme.cornerStyle,
            pinStyle: data.theme.pinStyle,
            borderStyle: data.theme.borderStyle,
            customHeaderColor: data.theme.customHeaderColor,
            customTextColor: data.theme.customTextColor,
          }
        : undefined;

    const spatialMeta: StickyNoteSpatialMeta = {
      isPinned: Boolean(data.spatialMeta?.isPinned ?? data.isPinned),
      isFolded: Boolean(data.spatialMeta?.isFolded ?? data.isFolded),
      autoResize: Boolean(data.spatialMeta?.autoResize ?? data.autoResize),
      minWidth:
        typeof data.spatialMeta?.minWidth === "number"
          ? data.spatialMeta.minWidth
          : STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.SPATIAL_MIN_WIDTH,
      minHeight:
        typeof data.spatialMeta?.minHeight === "number"
          ? data.spatialMeta.minHeight
          : STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.SPATIAL_MIN_HEIGHT,
      isPoppedOut: Boolean(data.spatialMeta?.isPoppedOut ?? data.isPoppedOut),
      floatingBounds:
        typeof data.spatialMeta?.floatingBounds === "object" &&
        data.spatialMeta.floatingBounds !== null
          ? { ...data.spatialMeta.floatingBounds }
          : undefined,
    };

    const anchor: StickyNoteAnchor | undefined =
      typeof data.anchor === "object" && data.anchor !== null
        ? {
            version: data.anchor.version ?? 1,
            targetType: data.anchor.targetType || "canvas",
            targetId: data.anchor.targetId,
            sourceFile: data.anchor.sourceFile,
            targetPath: data.anchor.targetPath,
            offsetX: data.anchor.offsetX ?? 0,
            offsetY: data.anchor.offsetY ?? 0,
            anchorKind: data.anchor.anchorKind ?? "attached",
            fallbackBehavior: data.anchor.fallbackBehavior ?? "retain-last-position",
            status: data.anchor.status ?? "resolved",
            lastKnownTargetBounds: data.anchor.lastKnownTargetBounds,
          }
        : undefined;

    const grouping: StickyNoteGrouping | undefined =
      typeof data.grouping === "object" && data.grouping !== null && data.grouping.groupId
        ? {
            groupId: String(data.grouping.groupId),
            groupRole: data.grouping.groupRole,
            groupOrder: data.grouping.groupOrder,
            zStack: data.grouping.zStack,
          }
        : undefined;

    const wikilinks = Array.isArray(data.backlinks?.wikilinks)
      ? data.backlinks.wikilinks
      : StickyNoteUtils.extractWikilinks(content);
    const blockReferences = Array.isArray(data.backlinks?.blockReferences)
      ? data.backlinks.blockReferences
      : StickyNoteUtils.extractBlockReferences(content);

    const backlinks: StickyNoteBacklinks = {
      wikilinks,
      blockReferences,
      inboundLinks: Array.isArray(data.backlinks?.inboundLinks) ? data.backlinks.inboundLinks : [],
      outboundLinks: Array.isArray(data.backlinks?.outboundLinks)
        ? data.backlinks.outboundLinks
        : [],
    };

    const source: StickyNoteSource = {
      origin: data.source?.origin || "created",
      sourceGuid: data.source?.sourceGuid || data.sourceGuid,
      sourcePageId: data.source?.sourcePageId,
      originalAuthor: data.source?.originalAuthor || data.author,
    };

    const metadata =
      typeof data.metadata === "object" && data.metadata !== null ? { ...data.metadata } : {};

    return {
      type: "stickyNote",
      id,
      bounds,
      title,
      content,
      paragraphs: Array.isArray(data.paragraphs) ? data.paragraphs : undefined,
      color,
      theme,
      opacity,
      createdTime,
      modifiedTime,
      author: typeof data.author === "string" ? data.author : undefined,
      source,
      spatialMeta,
      anchor,
      grouping,
      backlinks,
      metadata,
    };
  }

  /**
   * Resolves visual color values (background, header, text, border, pin) for rendering.
   */
  public static resolveStickyNoteColors(
    colorOrHex: string,
    theme?: StickyNoteTheme,
    isDarkMode = false
  ): ResolvedStickyNoteColors {
    const lower = colorOrHex.toLowerCase() as StickyNoteColorPreset;
    const mode =
      theme?.variant === "dark"
        ? "dark"
        : theme?.variant === "light"
          ? "light"
          : isDarkMode
            ? "dark"
            : "light";

    if (lower in STICKY_NOTE_PRESET_PALETTES) {
      const preset = STICKY_NOTE_PRESET_PALETTES[lower][mode];
      return {
        background: preset.background,
        header: theme?.customHeaderColor || preset.header,
        text: theme?.customTextColor || preset.text,
        border: preset.border,
        shadow: preset.shadow,
        pinColor: preset.pinColor,
      };
    }

    // Custom Hex Color fallback
    const isCustomHex = /^#[0-9a-fA-F]{3,8}$/.test(colorOrHex);
    const bg = isCustomHex ? colorOrHex : "#FFF9C4";

    return {
      background: bg,
      header: theme?.customHeaderColor || bg,
      text: theme?.customTextColor || (mode === "dark" ? "#F8FAFC" : "#1E293B"),
      border: bg,
      shadow: "rgba(0, 0, 0, 0.15)",
      pinColor: "#EAB308",
    };
  }

  /**
   * Extracts Obsidian [[Wikilinks]] from text content.
   */
  public static extractWikilinks(text: string): string[] {
    if (!text) return [];
    const matches = text.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g);
    if (!matches) return [];
    return matches.map((m) => m.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0]!.trim());
  }

  /**
   * Extracts Obsidian ^block-references from text content.
   */
  public static extractBlockReferences(text: string): string[] {
    if (!text) return [];
    const matches = text.match(/\^([a-zA-Z0-9_-]+)/g);
    if (!matches) return [];
    return matches.map((m) => m.substring(1).trim());
  }

  /**
   * Deep clones a sticky note, optionally updating position or assigning a fresh ID.
   */
  public static cloneStickyNote(
    source: CanonicalStickyNote,
    options: { newId?: boolean; deltaX?: number; deltaY?: number } = {}
  ): CanonicalStickyNote {
    const id = options.newId ? IdGenerator.stickyNoteId() : source.id;
    const dx = options.deltaX ?? 0;
    const dy = options.deltaY ?? 0;

    return {
      ...source,
      id,
      bounds: {
        ...source.bounds,
        x: source.bounds.x + dx,
        y: source.bounds.y + dy,
      },
      source: {
        ...source.source,
        origin: "created",
      },
      createdTime: Date.now(),
      modifiedTime: Date.now(),
      metadata: { ...source.metadata },
    };
  }

  /**
   * Constructs a validated StickyNoteAnchor object.
   */
  public static createAnchor(
    targetType: import("./CanonicalStickyNote").AnchorTargetType,
    targetId: string,
    offset: { x: number; y: number },
    options: {
      sourceFile?: string;
      targetPath?: string;
      anchorKind?: import("./CanonicalStickyNote").AnchorKind;
      fallbackBehavior?: import("./CanonicalStickyNote").AnchorFallbackBehavior;
      status?: import("./CanonicalStickyNote").AnchorStatus;
      lastKnownTargetBounds?: SpatialBounds;
    } = {}
  ): StickyNoteAnchor {
    return {
      version: 1,
      targetType,
      targetId,
      sourceFile: options.sourceFile,
      targetPath: options.targetPath,
      offsetX: offset.x,
      offsetY: offset.y,
      anchorKind: options.anchorKind ?? "attached",
      fallbackBehavior: options.fallbackBehavior ?? "retain-last-position",
      status: options.status ?? "resolved",
      lastKnownTargetBounds: options.lastKnownTargetBounds,
    };
  }
}
