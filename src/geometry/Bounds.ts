import { Rectangle, Rect2D } from "./Rectangle";

/**
 * Spatial Bounds with explicit rotation and z-order stacking layer.
 */
export interface SpatialBounds extends Rect2D {
  readonly rotation?: number; // In degrees (0 - 360)
  readonly zIndex: number;    // Global stacking order index
}

/**
 * Standard OneNote 2.5D coordinate scale conversions.
 * OneNote native units:
 * - Half-points: 1/144th inch
 * - Points (pt): 1/72th inch
 * - Twips: 1/1440th inch
 *
 * Target canonical system:
 * - 96 DPI CSS Logical Pixels
 */
export class CoordinateMath {
  public static readonly POINTS_TO_CSS_96DPI = 96 / 72; // 1.3333333333333333
  public static readonly HALF_POINTS_TO_CSS_96DPI = 96 / 144; // 0.6666666666666666
  public static readonly TWIPS_TO_CSS_96DPI = 96 / 1440; // 0.06666666666666667

  public static pointsToPixels(points: number): number {
    return points * CoordinateMath.POINTS_TO_CSS_96DPI;
  }

  public static pixelsToPoints(pixels: number): number {
    return pixels / CoordinateMath.POINTS_TO_CSS_96DPI;
  }

  public static halfPointsToPixels(halfPoints: number): number {
    return halfPoints * CoordinateMath.HALF_POINTS_TO_CSS_96DPI;
  }

  public static twipsToPixels(twips: number): number {
    return twips * CoordinateMath.TWIPS_TO_CSS_96DPI;
  }

  public static normalizeBounds(
    xPt: number,
    yPt: number,
    widthPt: number,
    heightPt: number,
    zIndex = 0
  ): SpatialBounds {
    return {
      x: CoordinateMath.pointsToPixels(xPt),
      y: CoordinateMath.pointsToPixels(yPt),
      width: CoordinateMath.pointsToPixels(widthPt),
      height: CoordinateMath.pointsToPixels(heightPt),
      zIndex,
    };
  }

  public static boundsToRectangle(bounds: SpatialBounds): Rectangle {
    return new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height);
  }
}
