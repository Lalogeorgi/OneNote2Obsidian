import { Point, Point2D } from "../geometry/Point";
import { Rectangle } from "../geometry/Rectangle";
import { ObjectId } from "../model/Ids";
import {
  AnchorFallbackBehavior,
  AnchorKind,
  AnchorStatus,
  AnchorTargetType,
  StickyNoteAnchor,
} from "../model/CanonicalStickyNote";
import { StickyNoteUtils } from "../model/StickyNoteUtils";
import {
  PageScene,
  PageSceneNode,
  SceneStickyNoteNode,
  SceneOutlineNode,
  SceneImageNode,
  SceneTableNode,
  SceneShapeNode,
} from "../pagescene/PageScene";
import { RegisteredPageContext } from "../context/PageContextManager";
import { KnowledgeObjectManager } from "./KnowledgeObjectManager";

export interface ResolvedSpatialAnchor {
  readonly nodeId: ObjectId;
  readonly anchor: StickyNoteAnchor;
  readonly status: AnchorStatus;
  readonly isIntraPage: boolean;
  readonly targetNode?: PageSceneNode;
  readonly targetTitle?: string;
  readonly expectedPosition: Point2D;
  readonly currentPosition: Point2D;
  readonly reason?: string;
}

export class SpatialAnchorManager {
  /**
   * Resolves the current status and spatial targets for an anchored Sticky Note.
   */
  public static resolveAnchor(
    note: SceneStickyNoteNode,
    scene: PageScene,
    _context?: RegisteredPageContext
  ): ResolvedSpatialAnchor | null {
    const anchor = note.anchor || note.element?.anchor;
    if (!anchor) return null;

    const currentPosition = new Point(note.bounds.x, note.bounds.y);

    // 1. If anchor has no targetId, it's unresolved
    if (!anchor.targetId && !anchor.sourceFile) {
      return {
        nodeId: note.id,
        anchor: { ...anchor, status: "unresolved" },
        status: "unresolved",
        isIntraPage: false,
        expectedPosition: currentPosition,
        currentPosition,
        reason: "Anchor has no specified target ID or file.",
      };
    }

    // 2. Search for the target on the active canvas
    let targetNode: PageSceneNode | undefined;
    if (anchor.targetId) {
      targetNode = scene.nodes.find((n) => n.id === anchor.targetId);

      // Also check by block anchor ID or paragraph ID inside outlines
      if (!targetNode && anchor.targetId.startsWith("^")) {
        const cleanBlockId = anchor.targetId.substring(1);
        targetNode = scene.nodes.find((n) => n.id === cleanBlockId);
      }
    }

    if (targetNode) {
      const expectedPosition = new Point(
        targetNode.bounds.x + anchor.offsetX,
        targetNode.bounds.y + anchor.offsetY
      );

      const targetTitle = this.resolveTargetNodeTitle(targetNode);

      const resolvedAnchor: StickyNoteAnchor = {
        ...anchor,
        status: "resolved",
        lastKnownTargetBounds: targetNode.bounds,
      };

      return {
        nodeId: note.id,
        anchor: resolvedAnchor,
        status: "resolved",
        isIntraPage: true,
        targetNode,
        targetTitle,
        expectedPosition,
        currentPosition,
      };
    }

    // 3. Target is not on active canvas. Check if it references an inter-page vault file/block
    if (anchor.sourceFile || anchor.targetPath) {
      const targetFile = anchor.sourceFile || "";
      const knowledgeManager = KnowledgeObjectManager.getInstance();
      const vaultNotes = knowledgeManager.getNotesForFile(targetFile);

      if (vaultNotes.length > 0) {
        return {
          nodeId: note.id,
          anchor: { ...anchor, status: "resolved" },
          status: "resolved",
          isIntraPage: false,
          targetTitle: targetFile,
          expectedPosition: currentPosition,
          currentPosition,
        };
      }
    }

    // 4. Target was deleted or not found: Mark as broken without deleting the note!
    const brokenAnchor: StickyNoteAnchor = {
      ...anchor,
      status: "broken",
    };

    return {
      nodeId: note.id,
      anchor: brokenAnchor,
      status: "broken",
      isIntraPage: false,
      expectedPosition: currentPosition,
      currentPosition,
      reason: `Target object [${anchor.targetId || anchor.sourceFile}] was not found or has been deleted.`,
    };
  }

  /**
   * Spatially anchors a Sticky Note to a target canvas node.
   */
  public static createAnchorForNote(
    note: SceneStickyNoteNode,
    targetNode: PageSceneNode,
    kind: AnchorKind = "attached",
    options: {
      sourceFile?: string;
      targetPath?: string;
      fallbackBehavior?: AnchorFallbackBehavior;
    } = {}
  ): StickyNoteAnchor {
    const offsetX = note.bounds.x - targetNode.bounds.x;
    const offsetY = note.bounds.y - targetNode.bounds.y;

    const targetType = this.resolveTargetTypeFromNode(targetNode);

    const anchor = StickyNoteUtils.createAnchor(
      targetType,
      targetNode.id,
      { x: offsetX, y: offsetY },
      {
        sourceFile: options.sourceFile,
        targetPath: options.targetPath,
        anchorKind: kind,
        fallbackBehavior: options.fallbackBehavior ?? "retain-last-position",
        status: "resolved",
        lastKnownTargetBounds: targetNode.bounds,
      }
    );

    (note as any).anchor = anchor;
    if (note.element) {
      (note.element as any).anchor = anchor;
    }

    return anchor;
  }

  /**
   * Automatically moves all Sticky Notes anchored to a moved target node in O(1) time.
   */
  public static updateAnchoredNotesOnTargetMove(
    scene: PageScene,
    targetNodeId: ObjectId,
    deltaX: number,
    deltaY: number
  ): SceneStickyNoteNode[] {
    if (deltaX === 0 && deltaY === 0) return [];

    const affectedNotes: SceneStickyNoteNode[] = [];

    for (const node of scene.nodes) {
      if (node.layer !== "stickyNotes") continue;
      const sticky = node as SceneStickyNoteNode;
      const anchor = sticky.anchor || sticky.element?.anchor;

      if (anchor && anchor.targetId === targetNodeId && anchor.status !== "broken") {
        const newX = sticky.bounds.x + deltaX;
        const newY = sticky.bounds.y + deltaY;

        sticky.bounds = {
          ...sticky.bounds,
          x: newX,
          y: newY,
        };
        sticky.aabb = Rectangle.create(newX, newY, sticky.bounds.width, sticky.bounds.height);

        if (sticky.element) {
          (sticky.element as any).bounds = sticky.bounds;
        }

        affectedNotes.push(sticky);
      }
    }

    return affectedNotes;
  }

  /**
   * Updates relative spatial offset when an anchored Sticky Note is moved independently.
   */
  public static updateAnchorOffsetOnNoteMove(
    note: SceneStickyNoteNode,
    targetNode: PageSceneNode
  ): StickyNoteAnchor {
    const anchor = note.anchor || note.element?.anchor;
    if (!anchor) {
      return this.createAnchorForNote(note, targetNode);
    }

    const offsetX = note.bounds.x - targetNode.bounds.x;
    const offsetY = note.bounds.y - targetNode.bounds.y;

    const updatedAnchor: StickyNoteAnchor = {
      ...anchor,
      offsetX,
      offsetY,
      status: "resolved",
      lastKnownTargetBounds: targetNode.bounds,
    };

    (note as any).anchor = updatedAnchor;
    if (note.element) {
      (note.element as any).anchor = updatedAnchor;
    }

    return updatedAnchor;
  }

  /**
   * Repairs or retargets a broken anchor to a new target node.
   */
  public static repairAnchor(
    note: SceneStickyNoteNode,
    newTargetNode: PageSceneNode,
    kind: AnchorKind = "attached"
  ): StickyNoteAnchor {
    return this.createAnchorForNote(note, newTargetNode, kind);
  }

  /**
   * Removes spatial anchoring, restoring the Sticky Note as a free-floating card.
   */
  public static removeAnchor(note: SceneStickyNoteNode): void {
    (note as any).anchor = undefined;
    if (note.element) {
      (note.element as any).anchor = undefined;
    }
  }

  /**
   * Discovers candidate canvas nodes near a given Sticky Note for intuitive snapping/anchoring.
   */
  public static findNearbyAnchorTargets(
    note: SceneStickyNoteNode,
    scene: PageScene,
    maxDistance = 200
  ): PageSceneNode[] {
    const noteCenter = new Point(
      note.bounds.x + note.bounds.width / 2,
      note.bounds.y + note.bounds.height / 2
    );

    const candidates: Array<{ node: PageSceneNode; dist: number }> = [];

    for (const other of scene.nodes) {
      if (other.id === note.id || other.layer === "stickyNotes") continue;

      const otherCenter = new Point(
        other.bounds.x + other.bounds.width / 2,
        other.bounds.y + other.bounds.height / 2
      );

      const dist = Math.sqrt(
        (noteCenter.x - otherCenter.x) ** 2 + (noteCenter.y - otherCenter.y) ** 2
      );

      if (dist <= maxDistance) {
        candidates.push({ node: other, dist });
      }
    }

    candidates.sort((a, b) => a.dist - b.dist);
    return candidates.map((c) => c.node);
  }

  private static resolveTargetTypeFromNode(node: PageSceneNode): AnchorTargetType {
    switch (node.layer) {
      case "text":
        return "outline";
      case "images":
        return "image";
      case "tables":
        return "table";
      case "shapes":
        return "shape";
      case "attachments":
        return "element";
      default:
        return "element";
    }
  }

  private static resolveTargetNodeTitle(node: PageSceneNode): string {
    switch (node.layer) {
      case "text": {
        const outline = node as SceneOutlineNode;
        const firstLine = outline.renderedHtml.replace(/<[^>]+>/g, "").split("\n")[0] || "";
        return firstLine.substring(0, 30) || `Outline Block (${node.id.substring(0, 8)})`;
      }
      case "images": {
        const img = node as SceneImageNode;
        return `Image (${img.assetId || node.id.substring(0, 8)})`;
      }
      case "tables": {
        const tbl = node as SceneTableNode;
        const rows = tbl.element?.rows?.length ?? 0;
        const cols = tbl.element?.columns?.length ?? 0;
        return `Table (${rows}x${cols})`;
      }
      case "shapes": {
        const shape = node as SceneShapeNode;
        return `Shape (${shape.element.shapeKind})`;
      }
      case "stickyNotes": {
        const sticky = node as SceneStickyNoteNode;
        return sticky.title || `Note (${sticky.id.substring(0, 8)})`;
      }
      default:
        return `Element (${node.id.substring(0, 8)})`;
    }
  }
}
