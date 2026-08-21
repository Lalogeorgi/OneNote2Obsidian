import { Point2D } from "../geometry/Point";
import { ViewportTransform } from "../geometry/Transform";
import { PageScene, PageSceneNode } from "../pagescene/PageScene";

export interface RendererOptions {
  readonly devicePixelRatio?: number;
  readonly antialias?: boolean;
  readonly enableDomOverlay?: boolean;
  readonly preference?: "webgl" | "webgpu";
  readonly maxVramBytes?: number;
}

export interface RendererStats {
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly visibleNodeCount: number;
  readonly totalNodeCount: number;
  readonly culledNodeCount?: number;
  readonly textureCount: number;
  readonly estimatedVramBytes?: number;
  readonly isContextLost: boolean;
  readonly syncDurationMs?: number;
  readonly hitTestLatencyMs?: number;
}

export interface HitTestResult {
  readonly node: PageSceneNode;
  readonly localPoint: Point2D;
}

/**
 * Universal decoupled Renderer abstraction.
 * PixiJS (or any alternative future renderer) implements this interface.
 * The domain model and ingestion logic have ZERO dependency on concrete PixiJS types.
 */
export interface IRenderer {
  /**
   * Initialize canvas element, WebGL/WebGPU context, and mount into host DOM element.
   */
  initialize(hostElement: HTMLElement, options?: RendererOptions): Promise<void>;

  /**
   * Update or set the active PageScene to be rendered.
   */
  renderScene(scene: PageScene): void;

  /**
   * Update viewport camera position, zoom scale, and rotation.
   */
  setViewport(transform: ViewportTransform): void;

  /**
   * Resize canvas backing buffer and recalculate resolution.
   */
  resize(width: number, height: number): void;

  /**
   * Convert Screen/DOM pixel coordinates to PageScene logical coordinates.
   */
  screenToScene(screenPoint: Point2D): Point2D;

  /**
   * Convert PageScene logical coordinates to Screen/DOM pixel coordinates.
   */
  sceneToScreen(scenePoint: Point2D): Point2D;

  /**
   * Perform spatial hit-test against scene elements at given scene coordinates.
   */
  hitTest(scenePoint: Point2D): HitTestResult | null;

  /**
   * Obtain active rendering and performance instrumentation statistics.
   */
  getStats(): RendererStats;

  /**
   * Destroy renderer, dispose GPU textures/buffers, unmount canvas, and release listeners.
   */
  destroy(): void;
}
