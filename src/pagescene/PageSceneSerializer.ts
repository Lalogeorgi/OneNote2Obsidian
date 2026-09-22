import { DiagnosticCode } from "../diagnostics/DiagnosticTypes";
import { logger } from "../diagnostics/Logger";
import { Rectangle } from "../geometry/Rectangle";
import { CanonicalStickyNote } from "../model/CanonicalStickyNote";
import { StickyNoteUtils } from "../model/StickyNoteUtils";
import {
  PageScene,
  PageSceneNode,
  SceneAnnotationNode,
  SceneGroupNode,
  SceneImageNode,
  SceneStickyNoteNode,
} from "./PageScene";
import { SceneBuilder } from "./SceneBuilder";
import { CanonicalSpatialGroup } from "../model/CanonicalSpatialGroup";
import { CanonicalSpatialAnnotation } from "../model/CanonicalAnnotation";

export interface SerializedOneCanvas {
  $schema: string;
  version: number;
  metadata: {
    pageId: string;
    title: string;
    migratedFromVersion?: number;
  };
  canvas: {
    backgroundColor: string;
    ruleLines?: {
      kind: string;
      color: string;
      spacing: number;
      marginX?: number;
    };
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  nodes: SerializedSceneNode[];
  groups?: CanonicalSpatialGroup[];
  annotations?: CanonicalSpatialAnnotation[];
}

export interface SerializedSceneNode {
  id: string;
  layer: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  visible: boolean;
  opacity?: number;
  rotation?: number;
  element: unknown;
  renderedHtml?: string;
  assetId?: string;
  mimeType?: string;
  fileName?: string;
  title?: string;
  color?: string;
  headerColor?: string;
  textColor?: string;
  borderColor?: string;
  isPinned?: boolean;
  isFolded?: boolean;
  anchor?: unknown;
  grouping?: unknown;
  memberIds?: readonly string[];
  semanticKind?: string;
  content?: string;
  style?: unknown;
}

export class PageSceneSerializer {
  public static readonly CURRENT_SCHEMA_VERSION = 1;
  public static readonly SCHEMA_URI =
    "https://raw.githubusercontent.com/Lalogeorgi/OneNote2Obsidian/main/spec/v1/schema.json";

  /**
   * Deterministically serialize a PageScene to a JSON string with versioned schema.
   */
  public static serialize(scene: PageScene, indent = 2): string {
    const rawNodes: SerializedSceneNode[] = scene.nodes.map((n) => {
      const isSticky = n.layer === "stickyNotes";
      const stickyNode = isSticky ? (n as SceneStickyNoteNode) : undefined;
      const isGroup = n.layer === "spatialGroups";
      const groupNode = isGroup ? (n as SceneGroupNode) : undefined;
      const isAnnot = n.layer === "annotations";
      const annotNode = isAnnot ? (n as SceneAnnotationNode) : undefined;
      const opacity =
        typeof n.opacity === "number" ? StickyNoteUtils.clampOpacity(n.opacity) : undefined;

      return {
        id: n.id,
        layer: n.layer,
        x: Number(n.bounds.x.toFixed(2)),
        y: Number(n.bounds.y.toFixed(2)),
        width: Number(n.bounds.width.toFixed(2)),
        height: Number(n.bounds.height.toFixed(2)),
        zIndex: n.zIndex,
        visible: n.visible,
        opacity,
        rotation: n.rotation,
        element: (n as { element?: unknown }).element,
        renderedHtml: (n as { renderedHtml?: string }).renderedHtml,
        assetId: (n as { assetId?: string }).assetId,
        mimeType: (n as { mimeType?: string }).mimeType,
        fileName: (n as { fileName?: string }).fileName,
        title: stickyNode?.title || groupNode?.title,
        color: stickyNode?.color,
        headerColor: stickyNode?.headerColor,
        textColor: stickyNode?.textColor,
        borderColor: stickyNode?.borderColor,
        isPinned: stickyNode?.isPinned,
        isFolded: stickyNode?.isFolded,
        anchor: stickyNode?.anchor,
        grouping: (stickyNode?.element as any)?.grouping,
        memberIds: groupNode?.memberIds,
        semanticKind: annotNode?.semanticKind,
        content: annotNode?.content,
        style: groupNode?.style || annotNode?.style,
      };
    });

    // Sort nodes deterministically by zIndex and ID
    rawNodes.sort((a, b) => {
      if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
      return a.id.localeCompare(b.id);
    });

    const doc: SerializedOneCanvas = {
      $schema: PageSceneSerializer.SCHEMA_URI,
      version: PageSceneSerializer.CURRENT_SCHEMA_VERSION,
      metadata: {
        pageId: scene.pageId,
        title: scene.title,
      },
      canvas: {
        backgroundColor: scene.canvasStyle.backgroundColor || "#FFFFFF",
        ruleLines: scene.canvasStyle.ruleLines
          ? {
              kind: scene.canvasStyle.ruleLines.kind,
              color: scene.canvasStyle.ruleLines.color,
              spacing: scene.canvasStyle.ruleLines.spacing,
              marginX: scene.canvasStyle.ruleLines.marginX,
            }
          : undefined,
        bounds: {
          x: scene.canvasBounds.x,
          y: scene.canvasBounds.y,
          width: scene.canvasBounds.width,
          height: scene.canvasBounds.height,
        },
      },
      nodes: rawNodes,
      groups: scene.groups,
      annotations: scene.annotations,
    };

    return JSON.stringify(doc, PageSceneSerializer.deterministicReplacer, indent);
  }

  /**
   * Deserialize a JSON string into a valid PageScene, applying schema migrations if needed.
   */
  public static deserialize(json: string): PageScene {
    let rawDoc: any;
    try {
      rawDoc = JSON.parse(json);
    } catch (err) {
      logger.error(
        DiagnosticCode.PARSER_CORRUPT_CHUNK,
        "Failed to parse .onecanvas.json sidecar: malformed JSON",
        { error: String(err) }
      );
      throw new Error("Invalid .onecanvas.json format: corrupted JSON content");
    }

    const doc = PageSceneSerializer.migrate(rawDoc);

    const nodes: PageSceneNode[] = doc.nodes.map((n) => {
      const aabb = Rectangle.create(n.x, n.y, n.width, n.height);
      const bounds = {
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        zIndex: n.zIndex,
        rotation: n.rotation,
      };

      if (n.layer === "stickyNotes" || (n.element as any)?.type === "stickyNote") {
        const canonicalSticky: CanonicalStickyNote = StickyNoteUtils.normalizeStickyNote({
          ...(typeof n.element === "object" && n.element !== null ? n.element : {}),
          id: n.id,
          bounds,
          title: n.title,
          opacity: n.opacity,
          isPinned: n.isPinned,
          isFolded: n.isFolded,
        });

        const colors = StickyNoteUtils.resolveStickyNoteColors(
          n.color || canonicalSticky.color,
          canonicalSticky.theme
        );

        const renderedHtml =
          n.renderedHtml || SceneBuilder.renderStickyNoteHtml(canonicalSticky, colors);

        const stickyNode: SceneStickyNoteNode = {
          id: canonicalSticky.id,
          layer: "stickyNotes",
          bounds,
          aabb,
          zIndex: n.zIndex,
          visible: n.visible !== false,
          opacity: canonicalSticky.opacity,
          rotation: n.rotation,
          element: canonicalSticky,
          title: canonicalSticky.title,
          text: canonicalSticky.content,
          renderedHtml,
          color: colors.background,
          headerColor: n.headerColor || colors.header,
          textColor: n.textColor || colors.text,
          borderColor: n.borderColor || colors.border,
          isPinned: canonicalSticky.spatialMeta?.isPinned,
          isFolded: canonicalSticky.spatialMeta?.isFolded,
          anchor: canonicalSticky.anchor || (n.anchor as any),
        };

        return stickyNode;
      }

      if (n.layer === "spatialGroups") {
        const groupNode: SceneGroupNode = {
          id: n.id as PageSceneNode["id"],
          layer: "spatialGroups",
          bounds,
          aabb,
          zIndex: n.zIndex,
          visible: n.visible !== false,
          opacity: n.opacity,
          rotation: n.rotation,
          element: (n.element as any) || {
            type: "spatialGroup",
            id: n.id,
            title: n.title || "Group",
            bounds,
            memberIds: n.memberIds || [],
            groupRole: "frame",
            style: n.style,
            createdTime: Date.now(),
            modifiedTime: Date.now(),
          },
          title: n.title || "Group",
          memberIds: (n.memberIds || []) as any,
          style: n.style as any,
        };
        return groupNode;
      }

      if (n.layer === "annotations") {
        const annotNode: SceneAnnotationNode = {
          id: n.id as PageSceneNode["id"],
          layer: "annotations",
          bounds,
          aabb,
          zIndex: n.zIndex,
          visible: n.visible !== false,
          opacity: n.opacity,
          rotation: n.rotation,
          element: (n.element as any) || {
            type: "annotation",
            id: n.id,
            semanticKind: n.semanticKind || "commentary",
            target: { targetType: "region", regionBounds: bounds },
            content: n.content || "",
            style: n.style,
            createdTime: Date.now(),
            modifiedTime: Date.now(),
          },
          semanticKind: (n.semanticKind as any) || "commentary",
          content: n.content || "",
          style: n.style as any,
        };
        return annotNode;
      }

      if (n.layer === "images") {
        const imageElement = (n.element as any) || {
          type: "image",
          id: n.id,
          bounds,
          assetId: n.assetId,
          mimeType: n.mimeType || "image/png",
        };
        const imageNode: SceneImageNode = {
          id: n.id as PageSceneNode["id"],
          layer: "images",
          bounds,
          aabb,
          zIndex: n.zIndex,
          visible: n.visible !== false,
          opacity: n.opacity,
          rotation: n.rotation,
          element: imageElement,
          assetId: n.assetId as any,
          mimeType: n.mimeType,
        };
        return imageNode;
      }

      const base = {
        id: n.id as PageSceneNode["id"],
        layer: n.layer as PageSceneNode["layer"],
        bounds,
        aabb,
        zIndex: n.zIndex,
        visible: n.visible !== false,
        opacity: n.opacity,
        rotation: n.rotation,
        element: n.element as PageSceneNode["element"],
        renderedHtml: n.renderedHtml,
        assetId: n.assetId as PageSceneNode extends { assetId: infer A } ? A : never,
        mimeType: n.mimeType,
        fileName: n.fileName,
      };

      return base as unknown as PageSceneNode;
    });

    return {
      pageId: doc.metadata.pageId as PageScene["pageId"],
      title: doc.metadata.title || "Untitled Page",
      canvasBounds: new Rectangle(
        doc.canvas.bounds.x || 0,
        doc.canvas.bounds.y || 0,
        doc.canvas.bounds.width || 1200,
        doc.canvas.bounds.height || 1600
      ),
      canvasStyle: {
        backgroundColor: doc.canvas.backgroundColor || "#FFFFFF",
        ruleLines: doc.canvas.ruleLines as PageScene["canvasStyle"]["ruleLines"],
      },
      nodes,
      groups: doc.groups,
      annotations: doc.annotations,
      version: doc.version,
    };
  }

  /**
   * Migrate legacy or versioned sidecar payload to CURRENT_SCHEMA_VERSION.
   */
  public static migrate(raw: any): SerializedOneCanvas {
    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid sidecar document: root must be an object");
    }

    const version = typeof raw.version === "number" ? raw.version : 0;

    if (version > PageSceneSerializer.CURRENT_SCHEMA_VERSION) {
      logger.warn(
        DiagnosticCode.GENERAL_INFO,
        `Sidecar schema version ${version} is newer than current ${PageSceneSerializer.CURRENT_SCHEMA_VERSION}. Attempting forward-compatible load.`,
        { version }
      );
    }

    // Migration Pipeline: v0 -> v1
    if (version < 1) {
      return PageSceneSerializer.migrateV0ToV1(raw);
    }

    // Ensure metadata & canvas structure are intact
    return {
      $schema: raw.$schema || PageSceneSerializer.SCHEMA_URI,
      version: raw.version || PageSceneSerializer.CURRENT_SCHEMA_VERSION,
      metadata: {
        pageId: raw.metadata?.pageId || "page_unknown",
        title: raw.metadata?.title || "Untitled Page",
        migratedFromVersion: raw.metadata?.migratedFromVersion,
      },
      canvas: {
        backgroundColor: raw.canvas?.backgroundColor || "#FFFFFF",
        ruleLines: raw.canvas?.ruleLines,
        bounds: {
          x: raw.canvas?.bounds?.x ?? 0,
          y: raw.canvas?.bounds?.y ?? 0,
          width: raw.canvas?.bounds?.width ?? 1200,
          height: raw.canvas?.bounds?.height ?? 1600,
        },
      },
      nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    };
  }

  private static migrateV0ToV1(v0: any): SerializedOneCanvas {
    const rawNodes: any[] = Array.isArray(v0.nodes) ? v0.nodes : [];
    const nodes: SerializedSceneNode[] = rawNodes.map((n, idx) => ({
      id: n.id || `node_v0_${idx}`,
      layer: n.layer || "text",
      x: n.x ?? n.bounds?.x ?? 0,
      y: n.y ?? n.bounds?.y ?? 0,
      width: n.width ?? n.bounds?.width ?? 200,
      height: n.height ?? n.bounds?.height ?? 100,
      zIndex: n.zIndex ?? idx,
      visible: n.visible !== false,
      opacity: n.opacity,
      rotation: n.rotation,
      element: n.element,
      renderedHtml: n.renderedHtml,
      assetId: n.assetId,
      mimeType: n.mimeType,
      fileName: n.fileName,
      title: n.title,
      color: n.color,
      headerColor: n.headerColor,
      textColor: n.textColor,
      borderColor: n.borderColor,
      isPinned: n.isPinned,
      isFolded: n.isFolded,
    }));

    return {
      $schema: PageSceneSerializer.SCHEMA_URI,
      version: 1,
      metadata: {
        pageId: v0.metadata?.pageId || v0.pageId || "page_v0_migrated",
        title: v0.metadata?.title || v0.title || "Migrated Page",
        migratedFromVersion: 0,
      },
      canvas: {
        backgroundColor: v0.canvas?.backgroundColor || v0.backgroundColor || "#FFFFFF",
        ruleLines: v0.canvas?.ruleLines,
        bounds: {
          x: v0.canvas?.bounds?.x ?? 0,
          y: v0.canvas?.bounds?.y ?? 0,
          width: v0.canvas?.bounds?.width ?? 1200,
          height: v0.canvas?.bounds?.height ?? 1600,
        },
      },
      nodes,
    };
  }

  private static deterministicReplacer(_key: string, value: unknown): unknown {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
      const result: Record<string, unknown> = {};
      for (const k of sortedKeys) {
        result[k] = (value as Record<string, unknown>)[k];
      }
      return result;
    }
    return value;
  }
}
