import { SpatialBounds } from "../geometry/Bounds";
import { RegisteredPageContext } from "../context/PageContextManager";
import { ObjectId, PageId } from "../model/Ids";
import { StickyNoteUtils } from "../model/StickyNoteUtils";
import {
  PageScene,
  PageSceneNode,
  SceneStickyNoteNode,
  SceneOutlineNode,
} from "../pagescene/PageScene";
import { KnowledgeObjectUtils, ParsedWikilink } from "./KnowledgeObject";
import { KnowledgeObjectManager } from "./KnowledgeObjectManager";

export type SpatialLinkDirection = "outbound" | "inbound" | "bidirectional";

export type SpatialLinkTargetType =
  "stickyNote" | "outline" | "file" | "heading" | "block" | "external";

export interface SpatialLink {
  readonly id: string;
  readonly sourceNodeId: ObjectId;
  readonly sourcePageId: PageId;
  readonly sourceType: "stickyNote" | "outline" | "image" | "table" | "shape";
  readonly sourceTitle?: string;
  readonly sourceBounds?: SpatialBounds;

  readonly targetType: SpatialLinkTargetType;
  readonly targetRaw: string;
  readonly targetNodeId?: ObjectId; // Defined when target exists on the same canvas
  readonly targetPageId?: PageId;
  readonly targetFile?: string;
  readonly targetSubpath?: string;
  readonly targetAlias?: string;
  readonly targetBounds?: SpatialBounds; // Defined when target is on same canvas

  readonly direction: SpatialLinkDirection;
  readonly label: string;
  readonly isIntraPage: boolean; // True if both source and target are on active canvas
}

export interface NodeSpatialLinks {
  readonly nodeId: ObjectId;
  readonly outbound: readonly SpatialLink[];
  readonly inbound: readonly SpatialLink[];
  readonly all: readonly SpatialLink[];
  readonly totalCount: number;
}

export interface ResolvedSceneLinks {
  readonly links: readonly SpatialLink[];
  readonly intraPageLinks: readonly SpatialLink[];
  readonly interPageLinks: readonly SpatialLink[];
  readonly linksByNodeId: ReadonlyMap<ObjectId, NodeSpatialLinks>;
}

export class SpatialLinkGraph {
  /**
   * Resolves all spatial links and backlinks for the active PageScene.
   */
  public static resolveSceneLinks(
    scene: PageScene,
    context?: RegisteredPageContext
  ): ResolvedSceneLinks {
    const links: SpatialLink[] = [];
    const nodeMap = new Map<ObjectId, PageSceneNode>();
    const titleToNodeMap = new Map<string, PageSceneNode>();
    const blockAnchorToNodeMap = new Map<string, PageSceneNode>();

    // 1. Build lookup tables for all nodes on the active canvas
    for (const node of scene.nodes) {
      nodeMap.set(node.id, node);

      if (node.layer === "stickyNotes") {
        const sticky = node as SceneStickyNoteNode;
        if (sticky.title) {
          titleToNodeMap.set(sticky.title.trim().toLowerCase(), node);
        }
        blockAnchorToNodeMap.set(`^${sticky.id}`, node);
        blockAnchorToNodeMap.set(sticky.id, node);
      } else if (node.layer === "text") {
        const outline = node as SceneOutlineNode;
        blockAnchorToNodeMap.set(`^${outline.id}`, node);
        blockAnchorToNodeMap.set(outline.id, node);
      }
    }

    const currentPageTitle = (context?.pageTitle || scene.title || "").trim().toLowerCase();
    const currentMarkdownPath = (context?.markdownPath || "").trim().toLowerCase();

    // 2. Scan each canvas node for Outbound Wikilinks & Block References
    for (const node of scene.nodes) {
      let content = "";
      let title: string | undefined;

      if (node.layer === "stickyNotes") {
        const sticky = node as SceneStickyNoteNode;
        content = sticky.text || sticky.element?.content || "";
        title = sticky.title || sticky.element?.title;
      } else if (node.layer === "text") {
        const outline = node as SceneOutlineNode;
        content = outline.renderedHtml || "";
      }

      if (!content) continue;

      const rawWikilinks = StickyNoteUtils.extractWikilinks(content);
      for (const raw of rawWikilinks) {
        const parsed = KnowledgeObjectUtils.parseWikilink(raw);
        const link = this.resolveOutboundLink(
          node,
          title,
          scene.pageId,
          raw,
          parsed,
          nodeMap,
          titleToNodeMap,
          blockAnchorToNodeMap,
          currentPageTitle,
          currentMarkdownPath
        );
        links.push(link);
      }
    }

    // 3. Query KnowledgeObjectManager for Inbound Backlinks from the vault
    const knowledgeManager = KnowledgeObjectManager.getInstance();
    for (const node of scene.nodes) {
      if (node.layer === "stickyNotes") {
        const sticky = node as SceneStickyNoteNode;
        // Check if any notes in the vault link to this note by block anchor or page
        const backlinkNotes = knowledgeManager.getBacklinksForTarget(sticky.id);
        const backlinkNotesByTitle = sticky.title
          ? knowledgeManager.getBacklinksForTarget(sticky.title)
          : [];

        const combinedBacklinks = new Set([...backlinkNotes, ...backlinkNotesByTitle]);
        for (const blNote of combinedBacklinks) {
          // Avoid duplicating intra-page links that we already captured as outbound
          if (blNote.pageId === scene.pageId && nodeMap.has(blNote.id as any)) {
            continue;
          }

          const linkId = `in_${blNote.id}_${sticky.id}`;
          links.push({
            id: linkId,
            sourceNodeId: blNote.id as any,
            sourcePageId: blNote.pageId,
            sourceType: "stickyNote",
            sourceTitle: blNote.title,
            targetType: "stickyNote",
            targetRaw: `[[${blNote.pageTitle}]]`,
            targetNodeId: sticky.id,
            targetPageId: scene.pageId,
            targetFile: blNote.markdownPath,
            targetBounds: sticky.bounds,
            direction: "inbound",
            label: blNote.title || blNote.pageTitle,
            isIntraPage: false,
          });
        }
      }
    }

    // 4. Index links by node ID
    const linksByNodeId = new Map<ObjectId, NodeSpatialLinks>();
    const intraPageLinks: SpatialLink[] = [];
    const interPageLinks: SpatialLink[] = [];

    for (const link of links) {
      if (link.isIntraPage) {
        intraPageLinks.push(link);
      } else {
        interPageLinks.push(link);
      }

      // Add to source node
      this.addLinkToNodeIndex(linksByNodeId, link.sourceNodeId, link, "outbound");

      // Add to target node if on active canvas
      if (link.targetNodeId && nodeMap.has(link.targetNodeId)) {
        this.addLinkToNodeIndex(linksByNodeId, link.targetNodeId, link, "inbound");
      }
    }

    return {
      links,
      intraPageLinks,
      interPageLinks,
      linksByNodeId,
    };
  }

  private static resolveOutboundLink(
    sourceNode: PageSceneNode,
    sourceTitle: string | undefined,
    pageId: PageId,
    raw: string,
    parsed: ParsedWikilink,
    nodeMap: Map<ObjectId, PageSceneNode>,
    titleToNodeMap: Map<string, PageSceneNode>,
    blockAnchorToNodeMap: Map<string, PageSceneNode>,
    currentPageTitle: string,
    currentMarkdownPath: string
  ): SpatialLink {
    const targetFileLower = parsed.targetFile.toLowerCase();
    const isCurrentPage =
      !parsed.targetFile ||
      targetFileLower === currentPageTitle ||
      targetFileLower === currentMarkdownPath ||
      targetFileLower === currentMarkdownPath.replace(/\.md$/, "");

    let targetNode: PageSceneNode | undefined;
    let targetType: SpatialLinkTargetType = "file";

    if (isCurrentPage && parsed.subpath) {
      // Subpath on current page (e.g. [[#^sn_xyz]] or [[#Heading]])
      const cleanSubpath = parsed.subpath.replace(/^#/, "");
      targetNode = blockAnchorToNodeMap.get(cleanSubpath);
      targetType = cleanSubpath.startsWith("^") ? "block" : "heading";
    } else if (!isCurrentPage) {
      // Check if target is another Sticky Note on the same canvas referenced by title
      targetNode = titleToNodeMap.get(targetFileLower);
      if (targetNode) {
        targetType = "stickyNote";
      }
    }

    const isIntraPage = !!(targetNode && nodeMap.has(targetNode.id));
    const linkId = `out_${sourceNode.id}_${targetNode?.id || parsed.targetFile}`;
    const label = parsed.alias || parsed.raw;

    return {
      id: linkId,
      sourceNodeId: sourceNode.id,
      sourcePageId: pageId,
      sourceType: sourceNode.layer === "stickyNotes" ? "stickyNote" : "outline",
      sourceTitle,
      sourceBounds: sourceNode.bounds,
      targetType: isIntraPage
        ? targetType === "block" || targetType === "heading"
          ? targetType
          : targetNode!.layer === "stickyNotes"
            ? "stickyNote"
            : "outline"
        : targetType,
      targetRaw: raw,
      targetNodeId: targetNode?.id,
      targetPageId: isIntraPage ? pageId : undefined,
      targetFile: parsed.targetFile,
      targetSubpath: parsed.subpath,
      targetAlias: parsed.alias,
      targetBounds: targetNode?.bounds,
      direction: "outbound",
      label,
      isIntraPage,
    };
  }

  private static addLinkToNodeIndex(
    index: Map<ObjectId, NodeSpatialLinks>,
    nodeId: ObjectId,
    link: SpatialLink,
    role: "inbound" | "outbound"
  ): void {
    const existing = index.get(nodeId);
    const outbound = existing ? [...existing.outbound] : [];
    const inbound = existing ? [...existing.inbound] : [];

    if (role === "outbound") {
      if (!outbound.some((l) => l.id === link.id)) {
        outbound.push(link);
      }
    } else {
      if (!inbound.some((l) => l.id === link.id)) {
        inbound.push(link);
      }
    }

    const all = [...outbound, ...inbound];
    index.set(nodeId, {
      nodeId,
      outbound,
      inbound,
      all,
      totalCount: all.length,
    });
  }
}
