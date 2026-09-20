import { SpatialBounds } from "../../geometry/Bounds";
import { Point, Point2D } from "../../geometry/Point";
import { PageSceneNode } from "../../pagescene/PageScene";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export interface HandleDescriptor {
  readonly handle: ResizeHandle;
  readonly position: Point2D;
  readonly cursor: string;
}

export class TransformGizmo {
  public static readonly HANDLE_RADIUS = 6;

  /**
   * Calculates the collective bounding box enclosing all selected nodes.
   */
  public static getSelectionBounds(nodes: readonly PageSceneNode[]): SpatialBounds | null {
    if (nodes.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = 0;

    for (const node of nodes) {
      const b = node.bounds;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
      maxZ = Math.max(maxZ, b.zIndex);
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      zIndex: maxZ,
    };
  }

  /**
   * Returns the 8 interactive resize handles for a bounding box.
   */
  public static getHandles(bounds: SpatialBounds): HandleDescriptor[] {
    const { x, y, width: w, height: h } = bounds;
    return [
      { handle: "nw", position: new Point(x, y), cursor: "nwse-resize" },
      { handle: "n", position: new Point(x + w / 2, y), cursor: "ns-resize" },
      { handle: "ne", position: new Point(x + w, y), cursor: "nesw-resize" },
      { handle: "e", position: new Point(x + w, y + h / 2), cursor: "ew-resize" },
      { handle: "se", position: new Point(x + w, y + h), cursor: "nwse-resize" },
      { handle: "s", position: new Point(x + w / 2, y + h), cursor: "ns-resize" },
      { handle: "sw", position: new Point(x, y + h), cursor: "nesw-resize" },
      { handle: "w", position: new Point(x, y + h / 2), cursor: "ew-resize" },
    ];
  }

  /**
   * Hit-tests resize handles at scene coordinates.
   */
  public static hitTestHandles(
    scenePt: Point2D,
    bounds: SpatialBounds,
    handleTolerance = 8
  ): HandleDescriptor | null {
    const handles = this.getHandles(bounds);

    for (const h of handles) {
      const dist = Math.hypot(scenePt.x - h.position.x, scenePt.y - h.position.y);
      if (dist <= handleTolerance) {
        return h;
      }
    }

    return null;
  }

  /**
   * Computes new transformed bounds given a dragged handle and delta.
   */
  public static computeResizedBounds(
    originalBounds: SpatialBounds,
    handle: ResizeHandle,
    deltaX: number,
    deltaY: number,
    lockAspectRatio = false,
    minSize = 20
  ): SpatialBounds {
    let { x, y, width, height } = originalBounds;
    const { zIndex } = originalBounds;
    const initialAspect = width / Math.max(1, height);

    switch (handle) {
      case "se":
        width = Math.max(minSize, originalBounds.width + deltaX);
        height = lockAspectRatio
          ? width / initialAspect
          : Math.max(minSize, originalBounds.height + deltaY);
        break;

      case "e":
        width = Math.max(minSize, originalBounds.width + deltaX);
        if (lockAspectRatio) height = width / initialAspect;
        break;

      case "s":
        height = Math.max(minSize, originalBounds.height + deltaY);
        if (lockAspectRatio) width = height * initialAspect;
        break;

      case "nw":
        width = Math.max(minSize, originalBounds.width - deltaX);
        height = lockAspectRatio
          ? width / initialAspect
          : Math.max(minSize, originalBounds.height - deltaY);
        x = originalBounds.x + (originalBounds.width - width);
        y = originalBounds.y + (originalBounds.height - height);
        break;

      case "n":
        height = Math.max(minSize, originalBounds.height - deltaY);
        if (lockAspectRatio) width = height * initialAspect;
        y = originalBounds.y + (originalBounds.height - height);
        break;

      case "w":
        width = Math.max(minSize, originalBounds.width - deltaX);
        if (lockAspectRatio) height = width / initialAspect;
        x = originalBounds.x + (originalBounds.width - width);
        break;

      case "ne":
        width = Math.max(minSize, originalBounds.width + deltaX);
        height = lockAspectRatio
          ? width / initialAspect
          : Math.max(minSize, originalBounds.height - deltaY);
        y = originalBounds.y + (originalBounds.height - height);
        break;

      case "sw":
        width = Math.max(minSize, originalBounds.width - deltaX);
        height = lockAspectRatio
          ? width / initialAspect
          : Math.max(minSize, originalBounds.height + deltaY);
        x = originalBounds.x + (originalBounds.width - width);
        break;
    }

    return { x, y, width, height, zIndex };
  }
}
