import { Application } from "pixi.js";
import { DiagnosticCode } from "../../diagnostics/DiagnosticTypes";
import { logger } from "../../diagnostics/Logger";
import { Point, Point2D } from "../../geometry/Point";
import { Rectangle } from "../../geometry/Rectangle";
import { AffineMatrix2D, ViewportTransform } from "../../geometry/Transform";
import { ViewportFitOptions, ViewportManager } from "../../geometry/ViewportManager";
import { AssetId, IdGenerator, ObjectId } from "../../model/Ids";
import {
  PageScene,
  PageSceneNode,
  SceneStickyNoteNode,
  SceneAttachmentNode,
} from "../../pagescene/PageScene";
import { SceneBuilder } from "../../pagescene/SceneBuilder";
import { SpatialIndex } from "../../pagescene/SpatialIndex";
import { HitTestResult, IRenderer, RendererOptions, RendererStats } from "../IRenderer";
import {
  InteractionTool,
  SpatialInteractionController,
} from "../interaction/SpatialInteractionController";
import { SpatialBounds } from "../../geometry/Bounds";
import { PageContextManager } from "../../context/PageContextManager";
import { SpatialLinkGraph } from "../../knowledge/SpatialLinkGraph";
import { SpatialAnchorManager, ResolvedSpatialAnchor } from "../../knowledge/SpatialAnchorManager";
import { SpatialLinkCurveMode, SpatialLinkRenderer } from "./SpatialLinkRenderer";
import { RendererInstrumentation } from "./Instrumentation";
import { ResourceTracker } from "./ResourceTracker";
import { SceneGraphHierarchy } from "./SceneGraphHierarchy";
import { SceneSynchronizer } from "./SceneSynchronizer";
import { PAGE_RULE_DEFAULTS } from "../../constants/RibbonConstants";
import {
  CANVAS_VIEWPORT_METRICS,
  CANVAS_INSERTION_DEFAULTS,
  createFallbackSceneRect,
} from "../../constants/CanvasConstants";

export class PixiRenderer implements IRenderer {
  private app: Application | null = null;
  private hierarchy: SceneGraphHierarchy | null = null;
  private synchronizer: SceneSynchronizer | null = null;
  private linkRenderer: SpatialLinkRenderer | null = null;
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
  public onTitleChange?: (newTitle: string) => void;
  public onSceneMutate?: () => void;
  public onStickyNotePopout?: (node: SceneStickyNoteNode) => void;
  public onStickyNoteCreateSibling?: (node: SceneStickyNoteNode) => void;
  public onStickyNoteOpenHub?: () => void;
  public onStickyNoteDelete?: (node: SceneStickyNoteNode) => void;
  public onStickyNoteStyleChange?: (
    node: SceneStickyNoteNode,
    style: { color?: string; opacity?: number }
  ) => void;
  public onStickyNotePinToggle?: (node: SceneStickyNoteNode) => void;
  public onStickyNoteTitleChange?: (node: SceneStickyNoteNode, title: string) => void;
  public onAttachmentClick?: (node: SceneAttachmentNode) => void;

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

  public async initialize(hostElement: HTMLElement, options: RendererOptions = {}): Promise<void> {
    this.hostElement = hostElement;

    try {
      this.app = new Application();
      const dpr =
        options.devicePixelRatio ??
        (typeof window !== "undefined" ? window.devicePixelRatio : 1) ??
        1;

      await this.app.init({
        preference: options.preference ?? "webgl",
        autoDensity: true,
        resolution: dpr,
        antialias: options.antialias !== false,
        backgroundAlpha: 1,
        backgroundColor: CANVAS_VIEWPORT_METRICS.DEFAULT_BACKGROUND_COLOR,
        width: hostElement.clientWidth || CANVAS_VIEWPORT_METRICS.DEFAULT_HOST_WIDTH,
        height: hostElement.clientHeight || CANVAS_VIEWPORT_METRICS.DEFAULT_HOST_HEIGHT,
      });

      // Style and mount WebGL canvas
      const canvas = this.app.canvas;
      canvas.className = "onenote-canvas-host";
      hostElement.appendChild(canvas);

      // Create and mount DOM Overlay if enabled
      if (options.enableDomOverlay !== false) {
        this.domOverlay = document.createElement("div");
        this.domOverlay.className = "onenote-dom-overlay";
        hostElement.appendChild(this.domOverlay);
      }

      // Build Pixi scene graph layers and incremental synchronizer
      this.hierarchy = new SceneGraphHierarchy();
      this.app.stage.addChild(this.hierarchy.rootContainer);
      this.synchronizer = new SceneSynchronizer(this.hierarchy, this.domOverlay, this.resources);
      this.linkRenderer = new SpatialLinkRenderer(this.hierarchy);

      this.synchronizer.onFocusNode = (nodeId) => {
        this.focusNode(nodeId);
      };

      this.synchronizer.onNodeHoverStateChange = (nodeId) => {
        this.linkRenderer?.setHoveredNode(nodeId);
      };

      this.synchronizer.onNodeBoundsLiveUpdate = (nodeId, bounds) => {
        this.linkRenderer?.updateNodeBounds(nodeId, bounds);
      };

      this.synchronizer.onTitleChange = (newTitle: string) => {
        if (this.currentScene) {
          (this.currentScene as any).title = newTitle;
        }
        if (this.onTitleChange) {
          this.onTitleChange(newTitle);
        }
      };

      this.synchronizer.onStickyNotePopout = (node) => {
        if (this.onStickyNotePopout) {
          this.onStickyNotePopout(node);
        }
      };

      this.synchronizer.onStickyNoteCreateSibling = (node) => {
        if (this.onStickyNoteCreateSibling) {
          this.onStickyNoteCreateSibling(node);
        }
      };

      this.synchronizer.onStickyNoteOpenHub = () => {
        if (this.onStickyNoteOpenHub) {
          this.onStickyNoteOpenHub();
        }
      };

      this.synchronizer.onStickyNoteDelete = (node) => {
        if (this.onStickyNoteDelete) {
          this.onStickyNoteDelete(node);
        }
      };

      this.synchronizer.onStickyNoteStyleChange = (node, style) => {
        if (this.onStickyNoteStyleChange) {
          this.onStickyNoteStyleChange(node, style);
        }
      };

      this.synchronizer.onStickyNotePinToggle = (node) => {
        if (this.onStickyNotePinToggle) {
          this.onStickyNotePinToggle(node);
        }
      };

      this.synchronizer.onStickyNoteTitleChange = (node, title) => {
        if (this.onStickyNoteTitleChange) {
          this.onStickyNoteTitleChange(node, title);
        }
      };

      this.synchronizer.onStickyNoteAnchorChange = (node, anchor) => {
        (node as any).anchor = anchor;
        if (node.element) {
          (node.element as any).anchor = anchor;
        }
        if (this.currentScene) {
          this.renderScene(this.currentScene);
        }
        if (this.onSceneMutate) this.onSceneMutate();
      };

      this.synchronizer.onTextNodeChange = (node, newText) => {
        if (this.currentScene) {
          const lines = newText.split("\n");
          (node.element as any).paragraphs = lines.map((line) => ({
            id: IdGenerator.objectId("p"),
            indentLevel: 0,
            runs: [{ text: line }],
          }));
          (node as any).renderedHtml = SceneBuilder.renderOutlineHtml(node.element);
          if (this.onSceneMutate) this.onSceneMutate();
        }
      };

      this.synchronizer.onOutlineChange = (node, updatedOutline) => {
        if (this.currentScene) {
          (node as any).element = updatedOutline;
          (node as any).renderedHtml = SceneBuilder.renderOutlineHtml(updatedOutline);
          if (this.onSceneMutate) this.onSceneMutate();
        }
      };

      this.synchronizer.onTableChange = (node, updatedTable) => {
        if (this.currentScene) {
          (node as any).element = updatedTable;
          if (this.onSceneMutate) this.onSceneMutate();
        }
      };

      this.synchronizer.onAttachmentClick = (node) => {
        if (this.onAttachmentClick) {
          this.onAttachmentClick(node);
        }
      };

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
          },
          onSelectionChange: (selectedNodes) => {
            if (this.synchronizer) {
              this.synchronizer.setSelectedNodes(selectedNodes);
            }
            if (this.linkRenderer) {
              this.linkRenderer.setSelectedNodes(selectedNodes.map((n) => n.id));
            }
            if (this.onSelectionChange) this.onSelectionChange(selectedNodes);
          },
          onHoverChange: (hoveredNode) => {
            if (this.synchronizer) {
              this.synchronizer.setHoveredNode(hoveredNode);
            }
            if (this.linkRenderer) {
              this.linkRenderer.setHoveredNode(hoveredNode ? hoveredNode.id : null);
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

      logger.info(DiagnosticCode.GENERAL_INFO, "PixiJS v8 Renderer initialized successfully", {
        resolution: this.app.renderer.resolution,
        preference: options.preference ?? "webgl",
      });
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

  public setAssetResolver(resolver: (assetId: string) => string | undefined): void {
    if (this.synchronizer) {
      this.synchronizer.assetUrlResolver = resolver;
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
   * Focuses, selects, and smoothly centers the viewport on a specific node by ID.
   */
  public focusNode(nodeId: ObjectId, options: { zoom?: number; padding?: number } = {}): boolean {
    if (!this.currentScene || !this.hierarchy || !this.interaction) return false;
    const node = this.currentScene.nodes.find((n) => n.id === nodeId);
    if (!node) return false;

    // 1. Select the node
    this.interaction.selectNodes([node]);

    // 2. Center viewport on node bounds
    const b = node.bounds;
    const centerX = b.x + b.width / 2;
    const centerY = b.y + b.height / 2;

    const hostWidth = this.hostElement?.clientWidth || CANVAS_VIEWPORT_METRICS.FOCUS_FALLBACK_WIDTH;
    const hostHeight =
      this.hostElement?.clientHeight || CANVAS_VIEWPORT_METRICS.FOCUS_FALLBACK_HEIGHT;

    const currentScale = this.transform.scale;
    const scale =
      options.zoom ??
      Math.min(
        CANVAS_VIEWPORT_METRICS.FOCUS_ZOOM_MAX,
        Math.max(CANVAS_VIEWPORT_METRICS.FOCUS_ZOOM_MIN, currentScale)
      );

    const targetX = hostWidth / 2 - centerX * scale;
    const targetY = hostHeight / 2 - centerY * scale;

    this.setViewport({ x: targetX, y: targetY, scale });
    return true;
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

    // Synchronize display objects incrementally with visible bounds
    if (this.app?.renderer && (this.app.renderer as any).background) {
      const bgColor =
        parseInt(scene.canvasStyle.backgroundColor.replace("#", ""), 16) ||
        CANVAS_VIEWPORT_METRICS.DEFAULT_BACKGROUND_COLOR;
      (this.app.renderer as any).background.color = bgColor;
    }
    this.synchronizer.sync(scene, this.getVisibleSceneBounds());

    // Resolve Spatial Backlinks & Connections
    const activeCtx = PageContextManager.getInstance().getActivePageContext() || undefined;
    const resolvedLinks = SpatialLinkGraph.resolveSceneLinks(scene, activeCtx);
    this.synchronizer.setResolvedLinks(resolvedLinks);

    const boundsMap = new Map<ObjectId, SpatialBounds>();
    for (const n of scene.nodes) {
      boundsMap.set(n.id, n.bounds);
    }
    this.linkRenderer?.setLinks(resolvedLinks, boundsMap);

    // Resolve Spatial Anchors
    const anchorsMap = new Map<ObjectId, ResolvedSpatialAnchor>();
    for (const n of scene.nodes) {
      if (n.layer === "stickyNotes") {
        const sticky = n as SceneStickyNoteNode;
        if (sticky.anchor || sticky.element?.anchor) {
          const resolved = SpatialAnchorManager.resolveAnchor(sticky, scene, activeCtx);
          if (resolved) {
            anchorsMap.set(sticky.id, resolved);
          }
        }
      }
    }
    this.linkRenderer?.setAnchoredNodes(anchorsMap);

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

  public groupSelection(title?: string): void {
    this.interaction?.groupSelectedNodes(title);
  }

  public ungroupSelection(): void {
    this.interaction?.ungroupSelectedGroups();
  }

  public adjustZOrder(action: import("../../editor/commands/EditorCommands").ZOrderAction): void {
    this.interaction?.adjustZOrder(action);
  }

  public setInkOptions(
    options: Partial<import("../../editor/ink/InkDrawingController").InkToolOptions>
  ): void {
    this.interaction?.setInkOptions(options);
  }

  public toggleRuler(visible?: boolean): boolean {
    return this.synchronizer?.toggleRuler(visible) ?? false;
  }

  public isRulerActive(): boolean {
    return this.synchronizer?.isRulerActive() ?? false;
  }

  public insertImage(
    assetId: AssetId,
    mimeType: string = CANVAS_INSERTION_DEFAULTS.IMAGE_MIME_TYPE,
    width: number = CANVAS_INSERTION_DEFAULTS.IMAGE_WIDTH,
    height: number = CANVAS_INSERTION_DEFAULTS.IMAGE_HEIGHT,
    targetPt?: Point2D
  ): void {
    this.interaction?.insertImage(assetId, mimeType, width, height, targetPt);
  }

  public insertTable(
    cols: number = CANVAS_INSERTION_DEFAULTS.TABLE_COLS,
    rows: number = CANVAS_INSERTION_DEFAULTS.TABLE_ROWS,
    targetPt?: Point2D
  ): void {
    this.interaction?.insertTable(cols, rows, targetPt);
  }

  public insertTimestamp(targetPt?: Point2D): void {
    this.interaction?.insertTimestamp(targetPt);
  }

  public insertNoteContainer(initialText = "", targetPt?: Point2D): void {
    this.interaction?.insertNoteContainer(initialText, targetPt);
  }

  public insertStickyNote(
    colorPreset:
      import("../../model/CanonicalStickyNote").StickyNoteColorPreset | string = "yellow",
    opacity = 1.0,
    targetPt?: Point2D
  ): import("../../pagescene/PageScene").SceneStickyNoteNode | null {
    return this.interaction?.insertStickyNote(colorPreset, opacity, targetPt) ?? null;
  }

  public setPageBackgroundColor(hexColor: string): void {
    if (this.currentScene) {
      (this.currentScene.canvasStyle as any).backgroundColor = hexColor;
      if (this.synchronizer) {
        this.synchronizer.renderBackground(this.currentScene, this.getVisibleSceneBounds());
      }
      if (this.onSceneMutate) {
        this.onSceneMutate();
      }
    }
  }

  public setPageRuleLines(
    kind: "none" | "narrow-ruled" | "standard-ruled" | "wide-ruled" | "small-grid" | "large-grid"
  ): void {
    if (this.currentScene) {
      const spacing = kind.includes("grid")
        ? PAGE_RULE_DEFAULTS.GRID_SPACING
        : PAGE_RULE_DEFAULTS.RULED_SPACING;
      (this.currentScene.canvasStyle as any).ruleLines = {
        kind,
        color: PAGE_RULE_DEFAULTS.LINE_COLOR,
        spacing,
        marginX: kind.includes("ruled") ? PAGE_RULE_DEFAULTS.MARGIN_X : undefined,
      };
      if (this.synchronizer) {
        this.synchronizer.renderBackground(this.currentScene, this.getVisibleSceneBounds());
      }
      if (this.onSceneMutate) {
        this.onSceneMutate();
      }
    }
  }

  public set onWikilinkClick(callback: ((linkText: string) => void) | undefined) {
    if (this.synchronizer) {
      this.synchronizer.onWikilinkClick = callback;
    }
  }

  public setLinkCurveMode(mode: SpatialLinkCurveMode): void {
    this.linkRenderer?.setMode(mode);
  }

  public getLinkCurveMode(): SpatialLinkCurveMode {
    return this.linkRenderer?.getMode() ?? "hover";
  }

  public updateNodeBounds(nodeId: ObjectId, bounds: SpatialBounds): void {
    this.linkRenderer?.updateNodeBounds(nodeId, bounds);
  }

  public getVisibleSceneBounds(): Rectangle {
    if (!this.hostElement) return createFallbackSceneRect();
    const width = this.hostElement.clientWidth || CANVAS_VIEWPORT_METRICS.DEFAULT_HOST_WIDTH;
    const height = this.hostElement.clientHeight || CANVAS_VIEWPORT_METRICS.DEFAULT_HOST_HEIGHT;
    const tl = this.screenToScene(new Point(0, 0));
    const br = this.screenToScene(new Point(width, height));
    const pad = CANVAS_VIEWPORT_METRICS.CULLING_PADDING; // padding so lines/paper don't clip during smooth pan
    return Rectangle.create(
      tl.x - pad,
      tl.y - pad,
      Math.max(CANVAS_VIEWPORT_METRICS.MIN_VIEWPORT_DIMENSION, br.x - tl.x + pad * 2),
      Math.max(CANVAS_VIEWPORT_METRICS.MIN_VIEWPORT_DIMENSION, br.y - tl.y + pad * 2)
    );
  }

  public setViewport(transform: ViewportTransform): void {
    const clamped = ViewportManager.clampTopLeftAnchor(transform);
    this.transform = { ...clamped };
    if (this.hierarchy) {
      this.hierarchy.updateViewport(this.transform);
    }

    // Synchronize DOM Overlay CSS transform
    if (this.domOverlay) {
      const matrix = AffineMatrix2D.fromViewport(this.transform);
      this.domOverlay.style.transform = matrix.toCSS();
    }

    if (this.currentScene && this.synchronizer) {
      this.synchronizer.updateBackground(this.getVisibleSceneBounds());
    }

    this.applyFrustumCulling();
    if (this.onViewportChange) {
      this.onViewportChange(this.transform);
    }
  }

  /**
   * Fit the viewport camera to center the entire page.
   */
  public fitToPage(options: ViewportFitOptions = {}): void {
    if (!this.currentScene || !this.hostElement) return;

    const width = this.hostElement.clientWidth || CANVAS_VIEWPORT_METRICS.DEFAULT_HOST_WIDTH;
    const height = this.hostElement.clientHeight || CANVAS_VIEWPORT_METRICS.DEFAULT_HOST_HEIGHT;

    const fitOptions: ViewportFitOptions = {
      padding: 0,
      align: "top-left",
      ...options,
    };

    const newTransform = ViewportManager.calculateFitToBounds(
      this.currentScene.canvasBounds,
      width,
      height,
      fitOptions
    );

    this.setViewport(newTransform);
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
    const width = this.hostElement.clientWidth || CANVAS_VIEWPORT_METRICS.DEFAULT_HOST_WIDTH;
    const height = this.hostElement.clientHeight || CANVAS_VIEWPORT_METRICS.DEFAULT_HOST_HEIGHT;

    const fitOptions: ViewportFitOptions = {
      padding: 40,
      align: "center",
      ...options,
    };

    const newTransform = ViewportManager.calculateFitToBounds(
      selectionBounds,
      width,
      height,
      fitOptions
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

    const localPoint = new Point(scenePoint.x - node.bounds.x, scenePoint.y - node.bounds.y);
    return { node, localPoint };
  }

  private applyFrustumCulling(): void {
    if (!this.enableCulling || !this.currentScene || !this.synchronizer || !this.hostElement)
      return;

    const width = this.hostElement.clientWidth || CANVAS_VIEWPORT_METRICS.DEFAULT_HOST_WIDTH;
    const height = this.hostElement.clientHeight || CANVAS_VIEWPORT_METRICS.DEFAULT_HOST_HEIGHT;

    // Calculate viewport bounding box in scene coordinates
    const topLeft = this.screenToScene(new Point(0, 0));
    const bottomRight = this.screenToScene(new Point(width, height));

    const viewportSceneRect = Rectangle.create(
      topLeft.x,
      topLeft.y,
      Math.max(CANVAS_VIEWPORT_METRICS.MIN_CULLING_DIMENSION, bottomRight.x - topLeft.x),
      Math.max(CANVAS_VIEWPORT_METRICS.MIN_CULLING_DIMENSION, bottomRight.y - topLeft.y)
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
    this.instrumentation.culledNodeCount = Math.max(
      0,
      this.currentScene.nodes.length - newVisibleNodeIds.size
    );
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

    // 4. Destroy spatial link renderer
    if (this.linkRenderer) {
      this.linkRenderer.destroy();
      this.linkRenderer = null;
    }

    // 5. Destroy scene graph hierarchy
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
