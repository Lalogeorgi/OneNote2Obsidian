import { Point2D } from "./Point";
import { Rect2D } from "./Rectangle";
import { AffineMatrix2D, ViewportTransform } from "./Transform";

export interface ViewportFitOptions {
  readonly padding?: number;
  readonly minScale?: number;
  readonly maxScale?: number;
  readonly align?: "center" | "top-left";
}

export class ViewportManager {
  public static readonly DEFAULT_MIN_SCALE = 0.05;
  public static readonly DEFAULT_MAX_SCALE = 5.0;

  /**
   * Calculates the ViewportTransform to position a target rectangle aligned to the top-left of the viewport.
   * Keeps scale at 1.0 (100% zoom) unless the content width exceeds the available viewport width.
   */
  public static calculateTopLeftToBounds(
    targetBounds: Rect2D,
    viewportWidth: number,
    _viewportHeight: number,
    options: ViewportFitOptions = {}
  ): ViewportTransform {
    const padding = options.padding ?? 0;
    const minScale = options.minScale ?? this.DEFAULT_MIN_SCALE;
    const maxScale = options.maxScale ?? this.DEFAULT_MAX_SCALE;

    const availableWidth = Math.max(10, viewportWidth - padding * 2);
    let scale = 1.0;
    if (targetBounds.width > 0 && targetBounds.width * scale > availableWidth) {
      scale = Math.max(minScale, availableWidth / targetBounds.width);
    }
    scale = Math.min(maxScale, Math.max(minScale, scale));

    const x = padding - targetBounds.x * scale;
    const y = padding - targetBounds.y * scale;

    return this.clampTopLeftAnchor({ x, y, scale });
  }

  /**
   * Clamps viewport transform to ensure content cannot be scrolled upper than y = 0
   * or left of x = 0 (authentic Microsoft OneNote page origin and boundary).
   */
  public static clampTopLeftAnchor(
    transform: ViewportTransform,
    _targetBounds?: Rect2D,
    _viewportWidth?: number,
    _viewportHeight?: number,
    _options: ViewportFitOptions = {}
  ): ViewportTransform {
    return {
      ...transform,
      x: Math.min(0, transform.x),
      y: Math.min(0, transform.y),
    };
  }

  /**
   * Calculates the ViewportTransform to fit a target rectangle cleanly within viewport dimensions.
   */
  public static calculateFitToBounds(
    targetBounds: Rect2D,
    viewportWidth: number,
    viewportHeight: number,
    options: ViewportFitOptions = {}
  ): ViewportTransform {
    const align = options.align ?? "top-left";
    if (align === "top-left") {
      return this.calculateTopLeftToBounds(targetBounds, viewportWidth, viewportHeight, options);
    }

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

  /**
   * Applies an exact incremental 2-point affine pinch-zoom and pan transformation.
   * Anchors content under the two touch points without drift or rubber-banding.
   */
  public static pinchTransform(
    current: ViewportTransform,
    lastCenter: Point2D,
    currentCenter: Point2D,
    currentDist: number,
    lastDist: number,
    options: ViewportFitOptions = {}
  ): ViewportTransform {
    if (lastDist <= 0 || currentDist <= 0) {
      // Pure pan fallback
      const dx = currentCenter.x - lastCenter.x;
      const dy = currentCenter.y - lastCenter.y;
      return this.panBy(current, dx, dy);
    }

    const minScale = options.minScale ?? this.DEFAULT_MIN_SCALE;
    const maxScale = options.maxScale ?? this.DEFAULT_MAX_SCALE;

    const pinchRatio = currentDist / lastDist;
    const targetScale = Math.min(maxScale, Math.max(minScale, current.scale * pinchRatio));
    const effectiveScale = targetScale / current.scale;

    // Exact incremental affine 2-point anchor translation:
    const x = currentCenter.x - (lastCenter.x - current.x) * effectiveScale;
    const y = currentCenter.y - (lastCenter.y - current.y) * effectiveScale;

    return {
      x,
      y,
      scale: targetScale,
      rotation: current.rotation,
    };
  }
}
