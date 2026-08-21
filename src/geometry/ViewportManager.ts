import { Point2D } from "./Point";
import { Rect2D } from "./Rectangle";
import { AffineMatrix2D, ViewportTransform } from "./Transform";

export interface ViewportFitOptions {
  readonly padding?: number;
  readonly minScale?: number;
  readonly maxScale?: number;
}

export class ViewportManager {
  public static readonly DEFAULT_MIN_SCALE = 0.05;
  public static readonly DEFAULT_MAX_SCALE = 5.0;

  /**
   * Calculates the ViewportTransform to fit a target rectangle cleanly within viewport dimensions.
   */
  public static calculateFitToBounds(
    targetBounds: Rect2D,
    viewportWidth: number,
    viewportHeight: number,
    options: ViewportFitOptions = {}
  ): ViewportTransform {
    const padding = options.padding ?? 40;
    const minScale = options.minScale ?? this.DEFAULT_MIN_SCALE;
    const maxScale = options.maxScale ?? this.DEFAULT_MAX_SCALE;

    const availableWidth = Math.max(10, viewportWidth - padding * 2);
    const availableHeight = Math.max(10, viewportHeight - padding * 2);

    const scaleX = availableWidth / (targetBounds.width || 1);
    const scaleY = availableHeight / (targetBounds.height || 1);
    const rawScale = Math.min(scaleX, scaleY);
    const scale = Math.min(maxScale, Math.max(minScale, rawScale));

    // Center the target in the viewport
    const contentWidth = targetBounds.width * scale;
    const contentHeight = targetBounds.height * scale;

    const x = (viewportWidth - contentWidth) / 2 - targetBounds.x * scale;
    const y = (viewportHeight - contentHeight) / 2 - targetBounds.y * scale;

    return { x, y, scale };
  }

  /**
   * Zooms in/out anchored at a specific screen point (e.g. mouse cursor or pinch center).
   */
  public static zoomAtScreenPoint(
    current: ViewportTransform,
    screenPoint: Point2D,
    scaleFactor: number,
    options: ViewportFitOptions = {}
  ): ViewportTransform {
    const minScale = options.minScale ?? this.DEFAULT_MIN_SCALE;
    const maxScale = options.maxScale ?? this.DEFAULT_MAX_SCALE;

    const newScale = Math.min(maxScale, Math.max(minScale, current.scale * scaleFactor));
    if (newScale === current.scale) {
      return current;
    }

    // Convert screen point to scene point before zoom
    const matrix = AffineMatrix2D.fromViewport(current);
    const scenePoint = matrix.screenToScene(screenPoint);

    // After zoom, anchor point must remain at the same screen point:
    // screenX = scenePoint.x * newScale + newX => newX = screenX - scenePoint.x * newScale
    const x = screenPoint.x - scenePoint.x * newScale;
    const y = screenPoint.y - scenePoint.y * newScale;

    return {
      x,
      y,
      scale: newScale,
      rotation: current.rotation,
    };
  }

  /**
   * Pans the viewport by pixel delta.
   */
  public static panBy(
    current: ViewportTransform,
    deltaX: number,
    deltaY: number
  ): ViewportTransform {
    return {
      x: current.x + deltaX,
      y: current.y + deltaY,
      scale: current.scale,
      rotation: current.rotation,
    };
  }
}
