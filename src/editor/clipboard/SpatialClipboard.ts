import { Point2D } from "../../geometry/Point";
import { Rectangle } from "../../geometry/Rectangle";
import { CanonicalElement } from "../../model/CanonicalElements";
import { IdGenerator } from "../../model/Ids";
import { PageScene, PageSceneNode } from "../../pagescene/PageScene";
import { DeleteNodesCommand, InsertElementCommand } from "../commands/EditorCommands";
import { HistoryManager } from "../HistoryManager";

export interface SerializedClipItem {
  layer: PageSceneNode["layer"];
  bounds: PageSceneNode["bounds"];
  zIndex: number;
  element: CanonicalElement;
}

export class SpatialClipboard {
  private static clipboard: SerializedClipItem[] = [];

  public static copy(nodes: readonly PageSceneNode[]): void {
    this.clipboard = nodes.map((n) => ({
      layer: n.layer,
      bounds: { ...n.bounds },
      zIndex: n.zIndex,
      element: JSON.parse(JSON.stringify(n.element)),
    }));
  }

  public static cut(
    scene: PageScene,
    nodes: readonly PageSceneNode[],
    history: HistoryManager,
    onMutate?: () => void
  ): void {
    this.copy(nodes);
    const cmd = new DeleteNodesCommand(
      scene,
      nodes.map((n) => n.id),
      onMutate
    );
    history.execute(cmd);
  }

  public static paste(
    scene: PageScene,
    targetPt?: Point2D,
    history?: HistoryManager,
    onMutate?: () => void
  ): PageSceneNode[] {
    if (this.clipboard.length === 0) return [];

    // Calculate source bounds to compute delta offset
    let minX = Infinity;
    let minY = Infinity;
    for (const item of this.clipboard) {
      minX = Math.min(minX, item.bounds.x);
      minY = Math.min(minY, item.bounds.y);
    }

    const offsetX = targetPt ? targetPt.x - minX : 20;
    const offsetY = targetPt ? targetPt.y - minY : 20;

    const pastedNodes: PageSceneNode[] = [];

    for (const item of this.clipboard) {
      const newId = IdGenerator.objectId(`${item.layer}_paste`);
      const newBounds = {
        ...item.bounds,
        x: targetPt ? item.bounds.x + offsetX : item.bounds.x + 20,
        y: targetPt ? item.bounds.y + offsetY : item.bounds.y + 20,
        zIndex: item.zIndex + 1,
      };

      const clonedElement = JSON.parse(JSON.stringify(item.element));
      clonedElement.id = newId;
      clonedElement.bounds = newBounds;

      const newNode = {
        ...item,
        id: newId,
        layer: item.layer,
        bounds: newBounds,
        aabb: Rectangle.create(newBounds.x, newBounds.y, newBounds.width, newBounds.height),
        zIndex: newBounds.zIndex,
        visible: true,
        element: clonedElement,
      } as PageSceneNode;

      if (history) {
        history.execute(new InsertElementCommand(scene, newNode, onMutate));
      } else {
        scene.nodes.push(newNode);
        onMutate?.();
      }

      pastedNodes.push(newNode);
    }

    return pastedNodes;
  }

  public static hasContent(): boolean {
    return this.clipboard.length > 0;
  }

  public static clear(): void {
    this.clipboard = [];
  }
}
