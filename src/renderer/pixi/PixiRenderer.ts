import { Application } from "pixi.js";
import { DiagnosticCode } from "../../diagnostics/DiagnosticTypes";
import { logger } from "../../diagnostics/Logger";
import { Point, Point2D } from "../../geometry/Point";
import { Rectangle } from "../../geometry/Rectangle";
import { AffineMatrix2D, ViewportTransform } from "../../geometry/Transform";
import { ViewportFitOptions, ViewportManager } from "../../geometry/ViewportManager";
import { ObjectId } from "../../model/Ids";
import { PageScene, PageSceneNode } from "../../pagescene/PageScene";
import { SpatialIndex } from "../../pagescene/SpatialIndex";
import { HitTestResult, IRenderer, RendererOptions, RendererStats } from "../IRenderer";
import { InteractionTool, SpatialInteractionController } from "../interaction/SpatialInteractionController";
import { RendererInstrumentation } from "./Instrumentation";
import { ResourceTracker } from "./ResourceTracker";
import { SceneGraphHierarchy } from "./SceneGraphHierarchy";
import { SceneSynchronizer } from "./SceneSynchronizer";

export class PixiRenderer implements IRenderer {
  private app: Application | null = null;
  private hierarchy: SceneGraphHierarchy | null = null;
  private synchronizer: SceneSynchronizer | null = null;
  private interaction: SpatialInteractionController | null = null;
  private spatialIndex = new SpatialIndex();
  private instrumentation = new RendererInstrumentation();
  private resources = new ResourceTracker();

  private hostElement: HTMLElement | null = null;
  private domOverlay: HTMLElement | null = null;
  private currentScene: PageScene | null = null;
  private transform: ViewportTransform = { x: 0, y: 0, scale: 1.0 };
  private isDestroyed = false;
  private enableCulling = true;
  private currentlyVisibleNodeIds = new Set<ObjectId>();

  // Event callbacks
  public onSelectionChange?: (nodes: PageSceneNode[]) => void;
  public onViewportChange?: (transform: ViewportTransform) => void;
  public onCursorSceneMove?: (scenePoint: Point2D) => void;
  public onSceneMutate?: () => void;

  public getActiveScene(): PageScene | null {
    return this.currentScene;
  }

  public getHostElement(): HTMLElement | null {
    return this.hostElement;
  }

  public getTransform(): ViewportTransform {
    return { ...this.transform };
  }

  public getSpatialIndex(): SpatialIndex {
    return this.spatialIndex;
  }

  public async initialize(
    hostElement: HTMLElement,
    options: RendererOptions = {}
  ): Promise<void> {
    this.hostElement = hostElement;

    try {
      this.app = new Application();
      const dpr = options.devicePixelRatio ?? (typeof window !== "undefined" ? window.devicePixelRatio : 1) ?? 1;

      await this.app.init({
        preference: options.preference ?? "webgl",
        autoDensity: true,
        resolution: dpr,
        antialias: options.antialias !== false,
        backgroundAlpha: 0,
        width: hostElement.clientWidth || 1000,
        height: hostElement.clientHeight || 800,
      });

      // Style and mount WebGL canvas
      const canvas = this.app.canvas;
      canvas.className = "onenote-canvas-host";
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.zIndex = "1";
      hostElement.appendChild(canvas);

      // Create and mount DOM Overlay if enabled
      if (options.enableDomOverlay !== false) {
        this.domOverlay = document.createElement("div");
        this.domOverlay.className = "onenote-dom-overlay";
        this.domOverlay.style.position = "absolute";
        this.domOverlay.style.top = "0";
        this.domOverlay.style.left = "0";
        this.domOverlay.style.width = "100%";
        this.domOverlay.style.height = "100%";
        this.domOverlay.style.zIndex = "2";
        this.domOverlay.style.pointerEvents = "none";
        this.domOverlay.style.transformOrigin = "0 0";
        hostElement.appendChild(this.domOverlay);
      }

      // Build Pixi scene graph layers and incremental synchronizer
      this.hierarchy = new SceneGraphHierarchy();
      this.app.stage.addChild(this.hierarchy.rootContainer);
      this.synchronizer = new SceneSynchronizer(this.hierarchy, this.domOverlay, this.resources);

      // Initialize pointer and gesture interaction controller
      this.interaction = new SpatialInteractionController(
        hostElement,
        this.hierarchy,
        this.spatialIndex,
        () => this.transform,
        (screenPt) => this.screenToScene(screenPt),
        {
          onViewportChange: (nextTransform) => {
            this.setViewport(nextTransform);
            if (this.onViewportChange) this.onViewportChange(nextTransform);
          },
          onSelectionChange: (selectedNodes) => {
            if (this.synchronizer) {
              this.synchronizer.setSelectedNodes(selectedNodes);
            }
            if (this.onSelectionChange) this.onSelectionChange(selectedNodes);
          },
          onHoverChange: (hoveredNode) => {
            if (this.synchronizer) {
              this.synchronizer.setHoveredNode(hoveredNode);
            }
          },
          onCursorSceneMove: (scenePoint) => {
            if (this.onCursorSceneMove) this.onCursorSceneMove(scenePoint);
          },
          onSceneMutate: () => {
            if (this.currentScene && this.synchronizer) {
              this.synchronizer.sync(this.currentScene);
              this.applyFrustumCulling();
            }
            if (this.onSceneMutate) this.onSceneMutate();
          },
        },
        this.synchronizer
      );

      logger.info(
        DiagnosticCode.GENERAL_INFO,
        "PixiJS v8 Renderer initialized successfully",
        {
          resolution: this.app.renderer.resolution,
          preference: options.preference ?? "webgl",
        }
      );
    } catch (err) {
      logger.error(
        DiagnosticCode.RENDERER_INITIALIZATION_FAILED,
        "Failed to initialize PixiJS v8 renderer",
        undefined,
        err as Error
      );
      throw err;
    }
  }

  public setTool(tool: InteractionTool): void {
    if (this.interaction) {
      this.interaction.setTool(tool);
    }
  }

  public getTool(): InteractionTool {
    return this.interaction ? this.interaction.getTool() : "select";
  }

  public getSelectedNodeIds(): ReadonlySet<ObjectId> {
    return this.interaction ? this.interaction.getSelectedNodeIds() : new Set();
  }

  public selectNodes(nodes: PageSceneNode[]): void {
    if (this.interaction) {
      this.interaction.selectNodes(nodes);
    }
  }

  public clearSelection(): void {
    if (this.interaction) {
      this.interaction.clearSelection();
    }
  }

  /**
   * Incrementally renders or updates a PageScene.
   */
  public renderScene(scene: PageScene): void {
    if (this.isDestroyed || !this.hierarchy || !this.synchronizer) return;

    const startTime = this.instrumentation.beginFrame();
    const syncStart = performance.now();

    this.currentScene = scene;
    this.currentlyVisibleNodeIds.clear();
    this.spatialIndex.load(scene.nodes);
    if (this.interaction) {
      this.interaction.setScene(scene);
    }

    // Synchronize display objects incrementally
    this.synchronizer.sync(scene);

    this.instrumentation.syncDurationMs = performance.now() - syncStart;
    this.instrumentation.totalNodeCount = scene.nodes.length;
    this.instrumentation.visibleNodeCount = scene.nodes.filter((n) => n.visible).length;
    this.instrumentation.textureCount = this.resources.textureCount;
    this.instrumentation.culledNodeCount = 0;

    // Apply frustum culling if enabled
    this.applyFrustumCulling();

    this.instrumentation.endFrame(startTime);
  }

  public undo(): boolean {
    return this.interaction ? this.interaction.undo() : false;
  }

  public redo(): boolean {
    return this.interaction ? this.interaction.redo() : false;
  }

  public deleteSelection(): void {
    this.interaction?.deleteSelection();
  }

  public duplicateSelection(): void {
    this.interaction?.duplicateSelection();
  }

  public copySelection(): void {
    this.interaction?.copySelection();
  }

  public cutSelection(): void {
    this.interaction?.cutSelection();
  }

  public paste(): void {
    this.interaction?.paste();
  }

  public adjustZOrder(action: import("../../editor/commands/EditorCommands").ZOrderAction): void {
    this.interaction?.adjustZOrder(action);
  }

  public setInkOptions(options: Partial<import("../../editor/ink/InkDrawingController").InkToolOptions>): void {
    this.interaction?.setInkOptions(options);
  }

  public setViewport(transform: ViewportTransform): void {
    this.transform = { ...transform };
    if (this.hierarchy) {
      this.hierarchy.updateViewport(transform);
    }

    // Synchronize DOM Overlay CSS transform
    if (this.domOverlay) {
      const matrix = AffineMatrix2D.fromViewport(transform);
      this.domOverlay.style.transform = matrix.toCSS();
    }

    this.applyFrustumCulling();
  }

  /**
   * Fit the viewport camera to center the entire page.
   */
  public fitToPage(options: ViewportFitOptions = {}): void {
    if (!this.currentScene || !this.hostElement) return;

    const width = this.hostElement.clientWidth || 1000;
    const height = this.hostElement.clientHeight || 800;

    const newTransform = ViewportManager.calculateFitToBounds(
      this.currentScene.canvasBounds,
      width,
      height,
      options
    );

    this.setViewport(newTransform);
    if (this.onViewportChange) this.onViewportChange(newTransform);
  }

  /**
   * Fit the viewport camera to center the currently selected nodes.
   */
  public zoomToSelection(options: ViewportFitOptions = {}): void {
    if (!this.currentScene || !this.hostElement || !this.interaction) return;

    const selectedIds = this.interaction.getSelectedNodeIds();
    if (selectedIds.size === 0) {
      this.fitToPage(options);
      return;
    }

    const selectedNodes = this.currentScene.nodes.filter((n) => selectedIds.has(n.id));
    if (selectedNodes.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const n of selectedNodes) {
      minX = Math.min(minX, n.bounds.x);
      minY = Math.min(minY, n.bounds.y);
      maxX = Math.max(maxX, n.bounds.x + n.bounds.width);
      maxY = Math.max(maxY, n.bounds.y + n.bounds.height);
    }

    const selectionBounds = new Rectangle(minX, minY, maxX - minX, maxY - minY);
    const width = this.hostElement.clientWidth || 1000;
    const height = this.hostElement.clientHeight || 800;

    const newTransform = ViewportManager.calculateFitToBounds(
      selectionBounds,
      width,
      height,
      options
    );

    this.setViewport(newTransform);
    if (this.onViewportChange) this.onViewportChange(newTransform);
  }

  /**
   * Zoom the viewport anchored at a screen point.
   */
  public zoomAt(screenPoint: Point2D, scaleFactor: number, options: ViewportFitOptions = {}): void {
    const newTransform = ViewportManager.zoomAtScreenPoint(
      this.transform,
      screenPoint,
      scaleFactor,
      options
    );
    this.setViewport(newTransform);
    if (this.onViewportChange) this.onViewportChange(newTransform);
  }

  /**
   * Pan the viewport by screen pixels.
   */
  public pan(deltaX: number, deltaY: number): void {
    const newTransform = ViewportManager.panBy(this.transform, deltaX, deltaY);
    this.setViewport(newTransform);
    if (this.onViewportChange) this.onViewportChange(newTransform);
  }

  public resize(width: number, height: number): void {
    if (this.app && this.app.renderer) {
      this.app.renderer.resize(width, height);
    }
    this.applyFrustumCulling();
  }

  public screenToScene(screenPoint: Point2D): Point2D {
    const matrix = AffineMatrix2D.fromViewport(this.transform);
    return matrix.screenToScene(screenPoint);
  }

  public sceneToScreen(scenePoint: Point2D): Point2D {
    const matrix = AffineMatrix2D.fromViewport(this.transform);
    return matrix.sceneToScreen(scenePoint);
  }

  public hitTest(scenePoint: Point2D): HitTestResult | null {
    const start = performance.now();
    const node = this.spatialIndex.hitTest(scenePoint);
    this.instrumentation.hitTestLatencyMs = performance.now() - start;

    if (!node) return null;

    const localPoint = new Point(
      scenePoint.x - node.bounds.x,
      scenePoint.y - node.bounds.y
    );
    return { node, localPoint };
  }

  private applyFrustumCulling(): void {
    if (!this.enableCulling || !this.currentScene || !this.synchronizer || !this.hostElement) return;

    const width = this.hostElement.clientWidth || 1000;
    const height = this.hostElement.clientHeight || 800;

    // Calculate viewport bounding box in scene coordinates
    const topLeft = this.screenToScene(new Point(0, 0));
    const bottomRight = this.screenToScene(new Point(width, height));

    const viewportSceneRect = Rectangle.create(
      topLeft.x,
      topLeft.y,
      Math.max(1, bottomRight.x - topLeft.x),
      Math.max(1, bottomRight.y - topLeft.y)
    );

    const visibleNodes = this.spatialIndex.search(viewportSceneRect);
    const newVisibleNodeIds = new Set<ObjectId>();
    for (let i = 0; i < visibleNodes.length; i++) {
      newVisibleNodeIds.add(visibleNodes[i]!.id);
    }

    // Toggle newly entering nodes ON
    for (const id of newVisibleNodeIds) {
      if (!this.currentlyVisibleNodeIds.has(id)) {
        const displayObj = this.synchronizer.getDisplayObject(id);
        if (displayObj) displayObj.renderable = true;
      }
    }

    // Toggle newly exiting nodes OFF
    for (const id of this.currentlyVisibleNodeIds) {
      if (!newVisibleNodeIds.has(id)) {
        const displayObj = this.synchronizer.getDisplayObject(id);
        if (displayObj) displayObj.renderable = false;
      }
    }

    this.currentlyVisibleNodeIds = newVisibleNodeIds;
    this.instrumentation.visibleNodeCount = newVisibleNodeIds.size;
    this.instrumentation.culledNodeCount = Math.max(0, this.currentScene.nodes.length - newVisibleNodeIds.size);
  }

  public getStats(): RendererStats {
    return this.instrumentation.getStats();
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // 1. Unbind interaction controller
    if (this.interaction) {
      this.interaction.unbind();
      this.interaction = null;
    }

    // 2. Release resource tracker & textures
    this.resources.disposeAll();

    // 3. Destroy scene synchronizer & display objects
    if (this.synchronizer) {
      this.synchronizer.clear();
      this.synchronizer = null;
    }

    // 4. Destroy scene graph hierarchy
    if (this.hierarchy) {
      this.hierarchy.destroy();
      this.hierarchy = null;
    }

    // 5. Destroy Pixi application
    if (this.app) {
      try {
        this.app.destroy(true, {
          children: true,
          texture: true,
          textureSource: true,
        });
      } catch (err) {
        console.error("Error during Pixi application destroy:", err);
      }
      this.app = null;
    }

    // 6. Remove DOM overlay and canvas
    if (this.domOverlay && this.domOverlay.parentElement) {
      this.domOverlay.parentElement.removeChild(this.domOverlay);
      this.domOverlay = null;
    }

    this.spatialIndex.clear();
    this.currentScene = null;
    this.hostElement = null;

    logger.info(DiagnosticCode.GENERAL_INFO, "PixiRenderer destroyed and resources released");
  }
}
