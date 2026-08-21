import { SpatialBounds } from "../../geometry/Bounds";
import { Rectangle } from "../../geometry/Rectangle";
import { CanonicalOutline, CanonicalParagraph } from "../../model/CanonicalElements";
import { IdGenerator, ObjectId } from "../../model/Ids";
import { PageScene, PageSceneNode } from "../../pagescene/PageScene";
import { IEditorCommand } from "./IEditorCommand";

export class MoveNodesCommand implements IEditorCommand {
  public readonly id = `cmd_move_${Date.now()}_${Math.random()}`;
  public readonly timestamp = Date.now();
  public readonly description: string;

  constructor(
    private scene: PageScene,
    private nodeIds: readonly ObjectId[],
    private deltaX: number,
    private deltaY: number,
    private onMutate?: () => void
  ) {
    this.description = `Move ${nodeIds.length} object${nodeIds.length === 1 ? "" : "s"}`;
  }

  public execute(): void {
    for (const id of this.nodeIds) {
      const node = this.scene.nodes.find((n) => n.id === id);
      if (node) {
        node.bounds = {
          ...node.bounds,
          x: node.bounds.x + this.deltaX,
          y: node.bounds.y + this.deltaY,
        };
        node.aabb = Rectangle.create(
          node.bounds.x,
          node.bounds.y,
          node.bounds.width,
          node.bounds.height
        );
      }
    }
    this.onMutate?.();
  }

  public undo(): void {
    for (const id of this.nodeIds) {
      const node = this.scene.nodes.find((n) => n.id === id);
      if (node) {
        node.bounds = {
          ...node.bounds,
          x: node.bounds.x - this.deltaX,
          y: node.bounds.y - this.deltaY,
        };
        node.aabb = Rectangle.create(
          node.bounds.x,
          node.bounds.y,
          node.bounds.width,
          node.bounds.height
        );
      }
    }
    this.onMutate?.();
  }
}

export class ResizeNodeCommand implements IEditorCommand {
  public readonly id = `cmd_resize_${Date.now()}_${Math.random()}`;
  public readonly timestamp = Date.now();
  public readonly description: string;

  constructor(
    private scene: PageScene,
    private nodeId: ObjectId,
    private oldBounds: SpatialBounds,
    private newBounds: SpatialBounds,
    private onMutate?: () => void
  ) {
    this.description = `Resize object ${nodeId}`;
  }

  public execute(): void {
    const node = this.scene.nodes.find((n) => n.id === this.nodeId);
    if (node) {
      node.bounds = { ...this.newBounds };
      node.aabb = Rectangle.create(
        this.newBounds.x,
        this.newBounds.y,
        this.newBounds.width,
        this.newBounds.height
      );
      this.onMutate?.();
    }
  }

  public undo(): void {
    const node = this.scene.nodes.find((n) => n.id === this.nodeId);
    if (node) {
      node.bounds = { ...this.oldBounds };
      node.aabb = Rectangle.create(
        this.oldBounds.x,
        this.oldBounds.y,
        this.oldBounds.width,
        this.oldBounds.height
      );
      this.onMutate?.();
    }
  }
}

export class DeleteNodesCommand implements IEditorCommand {
  public readonly id = `cmd_delete_${Date.now()}_${Math.random()}`;
  public readonly timestamp = Date.now();
  public readonly description: string;
  private removedNodes: PageSceneNode[] = [];

  constructor(
    private scene: PageScene,
    private nodeIds: readonly ObjectId[],
    private onMutate?: () => void
  ) {
    this.description = `Delete ${nodeIds.length} object${nodeIds.length === 1 ? "" : "s"}`;
  }

  public execute(): void {
    const idsSet = new Set(this.nodeIds);
    this.removedNodes = this.scene.nodes.filter((n) => idsSet.has(n.id));
    this.scene.nodes = this.scene.nodes.filter((n) => !idsSet.has(n.id));
    this.onMutate?.();
  }

  public undo(): void {
    this.scene.nodes.push(...this.removedNodes);
    // Maintain zIndex sort order
    this.scene.nodes.sort((a, b) => a.zIndex - b.zIndex);
    this.onMutate?.();
  }
}

export class InsertElementCommand implements IEditorCommand {
  public readonly id = `cmd_insert_${Date.now()}_${Math.random()}`;
  public readonly timestamp = Date.now();
  public readonly description: string;

  constructor(
    private scene: PageScene,
    private newNode: PageSceneNode,
    private onMutate?: () => void
  ) {
    this.description = `Insert ${newNode.layer} object`;
  }

  public execute(): void {
    this.scene.nodes.push(this.newNode);
    this.scene.nodes.sort((a, b) => a.zIndex - b.zIndex);
    this.onMutate?.();
  }

  public undo(): void {
    this.scene.nodes = this.scene.nodes.filter((n) => n.id !== this.newNode.id);
    this.onMutate?.();
  }
}

export type ZOrderAction = "bringToFront" | "sendToBack" | "bringForward" | "sendBackward";

export class ZOrderCommand implements IEditorCommand {
  public readonly id = `cmd_zorder_${Date.now()}_${Math.random()}`;
  public readonly timestamp = Date.now();
  public readonly description: string;
  private previousZIndexes = new Map<ObjectId, number>();

  constructor(
    private scene: PageScene,
    private nodeIds: readonly ObjectId[],
    private action: ZOrderAction,
    private onMutate?: () => void
  ) {
    this.description = `Z-Order: ${action}`;
  }

  public execute(): void {
    this.previousZIndexes.clear();
    for (const n of this.scene.nodes) {
      this.previousZIndexes.set(n.id, n.zIndex);
    }

    const idsSet = new Set(this.nodeIds);
    const maxZ = Math.max(...this.scene.nodes.map((n) => n.zIndex), 0);
    const minZ = Math.min(...this.scene.nodes.map((n) => n.zIndex), 0);

    for (const node of this.scene.nodes) {
      if (idsSet.has(node.id)) {
        switch (this.action) {
          case "bringToFront":
            node.zIndex = maxZ + 1;
            break;
          case "sendToBack":
            node.zIndex = Math.max(0, minZ - 1);
            break;
          case "bringForward":
            node.zIndex += 1;
            break;
          case "sendBackward":
            node.zIndex = Math.max(0, node.zIndex - 1);
            break;
        }
        node.bounds = { ...node.bounds, zIndex: node.zIndex };
      }
    }

    this.scene.nodes.sort((a, b) => a.zIndex - b.zIndex);
    this.onMutate?.();
  }

  public undo(): void {
    for (const node of this.scene.nodes) {
      const prev = this.previousZIndexes.get(node.id);
      if (prev !== undefined) {
        node.zIndex = prev;
        node.bounds = { ...node.bounds, zIndex: prev };
      }
    }
    this.scene.nodes.sort((a, b) => a.zIndex - b.zIndex);
    this.onMutate?.();
  }
}

export class EditTextCommand implements IEditorCommand {
  public readonly id = `cmd_edit_text_${Date.now()}_${Math.random()}`;
  public readonly timestamp = Date.now();
  public readonly description = "Edit Text Outline";

  constructor(
    private outlineNode: PageSceneNode,
    private oldParagraphs: readonly CanonicalParagraph[],
    private newParagraphs: readonly CanonicalParagraph[],
    private onMutate?: () => void
  ) {}

  public execute(): void {
    const el = this.outlineNode.element as CanonicalOutline;
    if (el && el.type === "outline") {
      (el as any).paragraphs = [...this.newParagraphs];
      this.onMutate?.();
    }
  }

  public undo(): void {
    const el = this.outlineNode.element as CanonicalOutline;
    if (el && el.type === "outline") {
      (el as any).paragraphs = [...this.oldParagraphs];
      this.onMutate?.();
    }
  }
}

export class DuplicateNodesCommand implements IEditorCommand {
  public readonly id = `cmd_dup_${Date.now()}_${Math.random()}`;
  public readonly timestamp = Date.now();
  public readonly description: string;
  public readonly duplicatedNodes: PageSceneNode[] = [];

  constructor(
    private scene: PageScene,
    sourceNodeIds: readonly ObjectId[],
    private offset = 20,
    private onMutate?: () => void
  ) {
    this.description = `Duplicate ${sourceNodeIds.length} object${sourceNodeIds.length === 1 ? "" : "s"}`;
    const idsSet = new Set(sourceNodeIds);

    for (const node of this.scene.nodes) {
      if (idsSet.has(node.id)) {
        const newId = IdGenerator.objectId(`${node.layer}_dup`);
        const newBounds: SpatialBounds = {
          x: node.bounds.x + this.offset,
          y: node.bounds.y + this.offset,
          width: node.bounds.width,
          height: node.bounds.height,
          zIndex: node.zIndex + 1,
        };

        const clonedElement = JSON.parse(JSON.stringify(node.element));
        clonedElement.id = newId;
        clonedElement.bounds = newBounds;

        const clonedNode = {
          ...node,
          id: newId,
          bounds: newBounds,
          aabb: Rectangle.create(newBounds.x, newBounds.y, newBounds.width, newBounds.height),
          zIndex: newBounds.zIndex,
          element: clonedElement,
        } as PageSceneNode;
        this.duplicatedNodes.push(clonedNode);
      }
    }
  }

  public execute(): void {
    this.scene.nodes.push(...this.duplicatedNodes);
    this.scene.nodes.sort((a, b) => a.zIndex - b.zIndex);
    this.onMutate?.();
  }

  public undo(): void {
    const dupIds = new Set(this.duplicatedNodes.map((n) => n.id));
    this.scene.nodes = this.scene.nodes.filter((n) => !dupIds.has(n.id));
    this.onMutate?.();
  }
}
