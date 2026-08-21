import { SpatialBounds } from "../../geometry/Bounds";
import { Point, Point2D } from "../../geometry/Point";
import { Rectangle } from "../../geometry/Rectangle";
import { ViewportTransform } from "../../geometry/Transform";
import { ViewportManager } from "../../geometry/ViewportManager";
import { ObjectId } from "../../model/Ids";
import { PageScene, PageSceneNode } from "../../pagescene/PageScene";
import { SpatialIndex } from "../../pagescene/SpatialIndex";
import {
  DeleteNodesCommand,
  DuplicateNodesCommand,
  EditTextCommand,
  InsertElementCommand,
  MoveNodesCommand,
  ResizeNodeCommand,
  ZOrderAction,
  ZOrderCommand,
} from "../../editor/commands/EditorCommands";
import {
  ResizeHandle,
  TransformGizmo,
} from "../../editor/gizmo/TransformGizmo";
import { HistoryManager } from "../../editor/HistoryManager";
import { InkDrawingController, InkToolOptions } from "../../editor/ink/InkDrawingController";
import { LassoSelectionController } from "../../editor/selection/LassoSelectionController";
import { InlineTextEditor } from "../../editor/text/InlineTextEditor";
import { SpatialClipboard } from "../../editor/clipboard/SpatialClipboard";
import { SceneGraphHierarchy } from "../pixi/SceneGraphHierarchy";
import { SceneSynchronizer } from "../pixi/SceneSynchronizer";

export type InteractionTool = "pan" | "select" | "pen" | "highlighter" | "eraser" | "lasso";

export interface SpatialInteractionCallbacks {
  onViewportChange: (transform: ViewportTransform) => void;
  onSelectionChange: (selectedNodes: PageSceneNode[]) => void;
  onHoverChange?: (hoveredNode: PageSceneNode | null) => void;
  onCursorSceneMove?: (scenePoint: Point2D) => void;
  onSceneMutate?: () => void;
}

export class SpatialInteractionController {
  private tool: InteractionTool = "select";
  private isPointerDown = false;
  private isDragging = false;
  private isPanning = false;
  private isResizing = false;
  private isMoving = false;
  private isDrawingInk = false;
  private isSelectingLasso = false;

  private dragStartScreen: Point2D = new Point(0, 0);
  private dragStartScene: Point2D = new Point(0, 0);
  private lastPointerScreen: Point2D = new Point(0, 0);
  private lastPointerScene: Point2D = new Point(0, 0);

  private activeResizeHandle: ResizeHandle | null = null;
  private resizeNodeInitialBounds: SpatialBounds | null = null;
  private selectedNodeIds = new Set<ObjectId>();
  private hoveredNodeId: ObjectId | null = null;

  // Touch gesture state
  private activeTouchPoints = new Map<number, Point2D>();
  private initialPinchDistance = 0;
  private initialPinchScale = 1.0;
  private pinchCenterScreen = new Point(0, 0);

  // Subsystems
  public readonly history = new HistoryManager();
  public readonly ink = new InkDrawingController();
  public readonly lasso = new LassoSelectionController();
  private inlineTextEditor: InlineTextEditor | null = null;

  private currentScene: PageScene | null = null;

  constructor(
    private hostElement: HTMLElement,
    _hierarchy: SceneGraphHierarchy,
    private spatialIndex: SpatialIndex,
    private getTransform: () => ViewportTransform,
    private screenToScene: (screenPt: Point2D) => Point2D,
    private callbacks: SpatialInteractionCallbacks,
    private synchronizer?: SceneSynchronizer
  ) {
    this.bindEvents();
  }

  public setScene(scene: PageScene): void {
    this.currentScene = scene;
  }

  public setTool(tool: InteractionTool): void {
    this.tool = tool;
    this.updateCursor();
  }

  public getTool(): InteractionTool {
    return this.tool;
  }

  public setInkOptions(options: Partial<InkToolOptions>): void {
    this.ink.setOptions(options);
    if (options.mode) {
      this.tool = options.mode;
      this.updateCursor();
    }
  }

  public getSelectedNodeIds(): ReadonlySet<ObjectId> {
    return this.selectedNodeIds;
  }

  public getSelectedNodes(): PageSceneNode[] {
    if (!this.currentScene) return [];
    return this.currentScene.nodes.filter((n) => this.selectedNodeIds.has(n.id));
  }

  public selectNodes(nodes: PageSceneNode[]): void {
    this.selectedNodeIds.clear();
    for (const n of nodes) {
      this.selectedNodeIds.add(n.id);
    }
    this.callbacks.onSelectionChange(nodes);
  }

  public clearSelection(): void {
    this.selectedNodeIds.clear();
    this.callbacks.onSelectionChange([]);
  }

  // --- Keyboard Shortcuts & Clipboard Actions ---

  public undo(): boolean {
    const success = this.history.undo();
    if (success) this.notifySceneMutated();
    return success;
  }

  public redo(): boolean {
    const success = this.history.redo();
    if (success) this.notifySceneMutated();
    return success;
  }

  public deleteSelection(): void {
    if (!this.currentScene || this.selectedNodeIds.size === 0) return;
    const cmd = new DeleteNodesCommand(
      this.currentScene,
      Array.from(this.selectedNodeIds),
      () => this.notifySceneMutated()
    );
    this.history.execute(cmd);
    this.clearSelection();
  }

  public duplicateSelection(offset = 20): void {
    if (!this.currentScene || this.selectedNodeIds.size === 0) return;
    const cmd = new DuplicateNodesCommand(
      this.currentScene,
      Array.from(this.selectedNodeIds),
      offset,
      () => this.notifySceneMutated()
    );
    this.history.execute(cmd);
    this.selectNodes(cmd.duplicatedNodes);
  }

  public copySelection(): void {
    const nodes = this.getSelectedNodes();
    if (nodes.length > 0) {
      SpatialClipboard.copy(nodes);
    }
  }

  public cutSelection(): void {
    if (!this.currentScene) return;
    const nodes = this.getSelectedNodes();
    if (nodes.length > 0) {
      SpatialClipboard.cut(
        this.currentScene,
        nodes,
        this.history,
        () => this.notifySceneMutated()
      );
      this.clearSelection();
    }
  }

  public paste(targetScenePt?: Point2D): void {
    if (!this.currentScene) return;
    const target = targetScenePt ?? this.lastPointerScene;
    const pasted = SpatialClipboard.paste(
      this.currentScene,
      target,
      this.history,
      () => this.notifySceneMutated()
    );
    if (pasted.length > 0) {
      this.selectNodes(pasted);
    }
  }

  public adjustZOrder(action: ZOrderAction): void {
    if (!this.currentScene || this.selectedNodeIds.size === 0) return;
    const cmd = new ZOrderCommand(
      this.currentScene,
      Array.from(this.selectedNodeIds),
      action,
      () => this.notifySceneMutated()
    );
    this.history.execute(cmd);
  }

  public nudgeSelection(dx: number, dy: number): void {
    if (!this.currentScene || this.selectedNodeIds.size === 0) return;
    const cmd = new MoveNodesCommand(
      this.currentScene,
      Array.from(this.selectedNodeIds),
      dx,
      dy,
      () => this.notifySceneMutated()
    );
    this.history.execute(cmd);
  }

  // --- Event Binding ---

  private bindEvents(): void {
    this.hostElement.addEventListener("wheel", this.handleWheel, { passive: false });
    this.hostElement.addEventListener("pointerdown", this.handlePointerDown);
    this.hostElement.addEventListener("pointermove", this.handlePointerMove);
    this.hostElement.addEventListener("pointerup", this.handlePointerUp);
    this.hostElement.addEventListener("pointercancel", this.handlePointerUp);
    this.hostElement.addEventListener("contextmenu", this.handleContextMenu);
    this.hostElement.addEventListener("dblclick", this.handleDoubleClick);
    window.addEventListener("keydown", this.handleKeyDown);
  }

  public unbind(): void {
    this.hostElement.removeEventListener("wheel", this.handleWheel);
    this.hostElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.hostElement.removeEventListener("pointermove", this.handlePointerMove);
    this.hostElement.removeEventListener("pointerup", this.handlePointerUp);
    this.hostElement.removeEventListener("pointercancel", this.handlePointerUp);
    this.hostElement.removeEventListener("contextmenu", this.handleContextMenu);
    this.hostElement.removeEventListener("dblclick", this.handleDoubleClick);
    window.removeEventListener("keydown", this.handleKeyDown);
    this.clearSelection();
  }

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    // Ignore if focus is in an input or textarea
    const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (targetTag === "input" || targetTag === "textarea") return;

    const isCtrlOrMeta = e.ctrlKey || e.metaKey;

    if (isCtrlOrMeta && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
      return;
    }

    if (isCtrlOrMeta && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      this.redo();
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (this.selectedNodeIds.size > 0) {
        e.preventDefault();
        this.deleteSelection();
      }
      return;
    }

    if (isCtrlOrMeta && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      this.duplicateSelection();
      return;
    }

    if (isCtrlOrMeta && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      this.copySelection();
      return;
    }

    if (isCtrlOrMeta && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      this.cutSelection();
      return;
    }

    if (isCtrlOrMeta && (e.key === "v" || e.key === "V")) {
      e.preventDefault();
      this.paste();
      return;
    }

    if (isCtrlOrMeta && (e.key === "a" || e.key === "A")) {
      if (this.currentScene) {
        e.preventDefault();
        this.selectNodes(this.currentScene.nodes);
      }
      return;
    }

    // Arrow keys for nudging selected objects
    const nudgeAmount = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      this.nudgeSelection(0, -nudgeAmount);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      this.nudgeSelection(0, nudgeAmount);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      this.nudgeSelection(-nudgeAmount, 0);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      this.nudgeSelection(nudgeAmount, 0);
    }
  };

  private handleDoubleClick = (e: MouseEvent): void => {
    const rect = this.hostElement.getBoundingClientRect();
    const screenPt = new Point(e.clientX - rect.left, e.clientY - rect.top);
    const scenePt = this.screenToScene(screenPt);

    const hitNode = this.spatialIndex.hitTest(scenePt);
    if (hitNode && hitNode.element.type === "outline") {
      // Begin inline text editing
      if (!this.inlineTextEditor) {
        this.inlineTextEditor = new InlineTextEditor({
          containerEl: this.hostElement,
          viewport: {
            getState: () => this.getTransform(),
            sceneToScreen: (pt: Point2D) => {
              const t = this.getTransform();
              return new Point(pt.x * t.scale + t.x, pt.y * t.scale + t.y);
            },
            screenToScene: (pt: Point2D) => this.screenToScene(pt),
          },
          onCommit: (node, newParas) => {
            if (this.currentScene) {
              const outline = node.element as any;
              const cmd = new EditTextCommand(
                node,
                outline.paragraphs,
                newParas,
                () => this.notifySceneMutated()
              );
              this.history.execute(cmd);
            }
          },
        });
      }
      this.inlineTextEditor.startEditing(hitNode);
    }
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.hostElement.getBoundingClientRect();
    const screenPoint = new Point(e.clientX - rect.left, e.clientY - rect.top);

    if (e.ctrlKey || e.metaKey || this.tool === "select") {
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      const current = this.getTransform();
      const next = ViewportManager.zoomAtScreenPoint(current, screenPoint, zoomFactor);
      this.callbacks.onViewportChange(next);
    } else {
      const current = this.getTransform();
      const next = ViewportManager.panBy(current, -e.deltaX, -e.deltaY);
      this.callbacks.onViewportChange(next);
    }
  };

  private handlePointerDown = (e: PointerEvent): void => {
    const rect = this.hostElement.getBoundingClientRect();
    const screenPt = new Point(e.clientX - rect.left, e.clientY - rect.top);
    const scenePt = this.screenToScene(screenPt);

    this.activeTouchPoints.set(e.pointerId, screenPt);

    if (this.activeTouchPoints.size === 2) {
      const pts = Array.from(this.activeTouchPoints.values());
      const p1 = pts[0]!;
      const p2 = pts[1]!;
      this.initialPinchDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      this.initialPinchScale = this.getTransform().scale;
      this.pinchCenterScreen = new Point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      return;
    }

    this.isPointerDown = true;
    this.isDragging = false;
    this.dragStartScreen = screenPt;
    this.dragStartScene = scenePt;
    this.lastPointerScreen = screenPt;
    this.lastPointerScene = scenePt;

    // Pan Initiation
    if (e.button === 1 || this.tool === "pan" || e.altKey) {
      this.isPanning = true;
      this.hostElement.style.cursor = "grabbing";
      this.safeCapturePointer(e.pointerId);
      return;
    }

    // Ink Drawing (Pen / Highlighter)
    if (this.tool === "pen" || this.tool === "highlighter") {
      this.isDrawingInk = true;
      this.ink.startStroke(scenePt);
      this.safeCapturePointer(e.pointerId);
      return;
    }

    // Stroke Eraser
    if (this.tool === "eraser") {
      this.eraseInkAt(scenePt);
      this.safeCapturePointer(e.pointerId);
      return;
    }

    // Lasso Selection Mode
    if (this.tool === "lasso") {
      this.isSelectingLasso = true;
      this.lasso.start(scenePt);
      this.safeCapturePointer(e.pointerId);
      return;
    }

    // Select Tool: Check for handle resize or node move
    if (e.button === 0 && this.tool === "select") {
      // 1. Check if clicked on a resize handle of the current selection
      const selNodes = this.getSelectedNodes();
      const selBounds = TransformGizmo.getSelectionBounds(selNodes);
      if (selBounds && selNodes.length === 1) {
        const hitHandle = TransformGizmo.hitTestHandles(scenePt, selBounds);
        if (hitHandle) {
          this.isResizing = true;
          this.activeResizeHandle = hitHandle.handle;
          this.resizeNodeInitialBounds = { ...selNodes[0]!.bounds };
          this.hostElement.style.cursor = hitHandle.cursor;
          this.safeCapturePointer(e.pointerId);
          return;
        }
      }

      // 2. Check if clicked on an existing selected node to begin moving
      const hitNode = this.spatialIndex.hitTest(scenePt);
      if (hitNode && this.selectedNodeIds.has(hitNode.id)) {
        this.isMoving = true;
        this.safeCapturePointer(e.pointerId);
        return;
      }

      // 3. Otherwise, single select or start marquee box
      if (hitNode) {
        if (e.shiftKey) {
          if (this.selectedNodeIds.has(hitNode.id)) {
            this.selectedNodeIds.delete(hitNode.id);
          } else {
            this.selectedNodeIds.add(hitNode.id);
          }
          this.callbacks.onSelectionChange(this.getSelectedNodes());
        } else {
          this.selectNodes([hitNode]);
          this.isMoving = true;
        }
      } else {
        // Start marquee box selection on empty canvas drag
        if (!e.shiftKey) {
          this.clearSelection();
        }
        this.isSelectingLasso = true;
        this.lasso.start(scenePt);
      }

      this.safeCapturePointer(e.pointerId);
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    const rect = this.hostElement.getBoundingClientRect();
    const screenPt = new Point(e.clientX - rect.left, e.clientY - rect.top);
    const scenePt = this.screenToScene(screenPt);

    this.activeTouchPoints.set(e.pointerId, screenPt);

    if (this.activeTouchPoints.size === 2) {
      const pts = Array.from(this.activeTouchPoints.values());
      const p1 = pts[0]!;
      const p2 = pts[1]!;
      const currentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (this.initialPinchDistance > 0) {
        const factor = currentDist / this.initialPinchDistance;
        const current = this.getTransform();
        const targetScale = this.initialPinchScale * factor;
        const scaleFactor = targetScale / current.scale;
        const next = ViewportManager.zoomAtScreenPoint(current, this.pinchCenterScreen, scaleFactor);
        this.callbacks.onViewportChange(next);
      }
      return;
    }

    if (this.callbacks.onCursorSceneMove) {
      this.callbacks.onCursorSceneMove(scenePt);
    }

    // Panning
    if (this.isPanning) {
      const dx = screenPt.x - this.lastPointerScreen.x;
      const dy = screenPt.y - this.lastPointerScreen.y;
      this.lastPointerScreen = screenPt;
      const current = this.getTransform();
      const next = ViewportManager.panBy(current, dx, dy);
      this.callbacks.onViewportChange(next);
      return;
    }

    if (this.isPointerDown) {
      const dragDist = Math.hypot(
        screenPt.x - this.dragStartScreen.x,
        screenPt.y - this.dragStartScreen.y
      );
      if (dragDist > 3) {
        this.isDragging = true;
      }
    }

    // Ink Drawing
    if (this.isDrawingInk && this.isPointerDown) {
      this.ink.continueStroke(scenePt);
      if (this.synchronizer) {
        const opts = this.ink.getOptions();
        this.synchronizer.renderActiveStroke(
          this.ink.getCurrentPoints(),
          opts.color,
          opts.strokeWidth,
          opts.mode === "highlighter"
        );
      }
      return;
    }

    // Eraser dragging
    if (this.tool === "eraser" && this.isPointerDown) {
      this.eraseInkAt(scenePt);
      return;
    }

    // Lasso / Marquee dragging
    if (this.isSelectingLasso && this.isPointerDown) {
      this.lasso.addPoint(scenePt);
      if (this.synchronizer) {
        this.synchronizer.renderLasso(this.lasso.getPoints());
      }
      return;
    }

    // Handle Resizing
    if (this.isResizing && this.isPointerDown && this.activeResizeHandle && this.resizeNodeInitialBounds) {
      const deltaX = scenePt.x - this.dragStartScene.x;
      const deltaY = scenePt.y - this.dragStartScene.y;
      const selNodes = this.getSelectedNodes();
      if (selNodes.length === 1) {
        const node = selNodes[0]!;
        const newBounds = TransformGizmo.computeResizedBounds(
          this.resizeNodeInitialBounds,
          this.activeResizeHandle,
          deltaX,
          deltaY,
          e.shiftKey
        );
        node.bounds = newBounds;
        node.aabb = Rectangle.create(
          newBounds.x,
          newBounds.y,
          newBounds.width,
          newBounds.height
        );
        if (this.synchronizer) {
          this.synchronizer.setSelectedNodes(selNodes);
        }
      }
      return;
    }

    // Node Moving
    if (this.isMoving && this.isDragging && this.isPointerDown) {
      const deltaX = scenePt.x - this.lastPointerScene.x;
      const deltaY = scenePt.y - this.lastPointerScene.y;
      const selNodes = this.getSelectedNodes();

      for (const node of selNodes) {
        node.bounds = {
          ...node.bounds,
          x: node.bounds.x + deltaX,
          y: node.bounds.y + deltaY,
        };
        node.aabb = Rectangle.create(
          node.bounds.x,
          node.bounds.y,
          node.bounds.width,
          node.bounds.height
        );
      }

      if (this.synchronizer) {
        this.synchronizer.setSelectedNodes(selNodes);
      }
      this.lastPointerScene = scenePt;
      return;
    }

    // Hover cursor updates when pointer is up
    if (!this.isPointerDown) {
      const selNodes = this.getSelectedNodes();
      const selBounds = TransformGizmo.getSelectionBounds(selNodes);
      if (selBounds && selNodes.length === 1) {
        const hitHandle = TransformGizmo.hitTestHandles(scenePt, selBounds);
        if (hitHandle) {
          this.hostElement.style.cursor = hitHandle.cursor;
          return;
        }
      }

      const hitNode = this.spatialIndex.hitTest(scenePt);
      if (hitNode?.id !== this.hoveredNodeId) {
        this.hoveredNodeId = hitNode?.id ?? null;
        if (this.callbacks.onHoverChange) {
          this.callbacks.onHoverChange(hitNode);
        }
      }
      this.updateCursor();
    }

    this.lastPointerScreen = screenPt;
    this.lastPointerScene = scenePt;
  };

  private handlePointerUp = (e: PointerEvent): void => {
    this.activeTouchPoints.delete(e.pointerId);

    if (this.isPanning) {
      this.isPanning = false;
      this.updateCursor();
      this.safeReleasePointer(e.pointerId);
      return;
    }

    // Finish Ink Stroke
    if (this.isDrawingInk) {
      this.isDrawingInk = false;
      const newNode = this.ink.finishStroke();
      if (this.synchronizer) {
        this.synchronizer.clearActiveStroke();
      }
      if (newNode && this.currentScene) {
        const cmd = new InsertElementCommand(
          this.currentScene,
          newNode,
          () => this.notifySceneMutated()
        );
        this.history.execute(cmd);
      }
    }

    // Finish Lasso / Marquee Selection
    if (this.isSelectingLasso) {
      this.isSelectingLasso = false;
      if (this.synchronizer) {
        this.synchronizer.clearLasso();
      }
      if (this.currentScene) {
        const selected = this.lasso.querySelectedNodes(this.currentScene.nodes);
        this.selectNodes(selected);
      }
      this.lasso.clear();
    }

    // Commit Resizing to History
    if (this.isResizing) {
      this.isResizing = false;
      const selNodes = this.getSelectedNodes();
      if (selNodes.length === 1 && this.resizeNodeInitialBounds && this.currentScene) {
        const node = selNodes[0]!;
        const cmd = new ResizeNodeCommand(
          this.currentScene,
          node.id,
          this.resizeNodeInitialBounds,
          { ...node.bounds },
          () => this.notifySceneMutated()
        );
        this.history.execute(cmd);
      }
      this.activeResizeHandle = null;
      this.resizeNodeInitialBounds = null;
    }

    // Commit Move to History
    if (this.isMoving && this.isDragging) {
      this.isMoving = false;
      const totalDx = this.lastPointerScene.x - this.dragStartScene.x;
      const totalDy = this.lastPointerScene.y - this.dragStartScene.y;
      const selNodes = this.getSelectedNodes();

      if (this.currentScene && selNodes.length > 0 && (totalDx !== 0 || totalDy !== 0)) {
        // Reset bounds and apply via command to ensure proper undo stack state
        for (const n of selNodes) {
          n.bounds = {
            ...n.bounds,
            x: n.bounds.x - totalDx,
            y: n.bounds.y - totalDy,
          };
        }
        const cmd = new MoveNodesCommand(
          this.currentScene,
          selNodes.map((n) => n.id),
          totalDx,
          totalDy,
          () => this.notifySceneMutated()
        );
        this.history.execute(cmd);
      }
    }

    this.isPointerDown = false;
    this.isDragging = false;
    this.isMoving = false;
    this.safeReleasePointer(e.pointerId);
    this.updateCursor();
  };

  private eraseInkAt(scenePt: Point2D): void {
    if (!this.currentScene) return;
    const inkNodes = this.currentScene.nodes.filter((n) => n.element.type === "ink");
    const { modifiedNodes, deletedNodeIds } = this.ink.eraseAt(scenePt, inkNodes);

    if (deletedNodeIds.length > 0) {
      const cmd = new DeleteNodesCommand(
        this.currentScene,
        deletedNodeIds,
        () => this.notifySceneMutated()
      );
      this.history.execute(cmd);
    } else if (modifiedNodes.length > 0) {
      this.notifySceneMutated();
    }
  }

  private notifySceneMutated(): void {
    if (this.currentScene) {
      this.spatialIndex.load(this.currentScene.nodes);
    }
    if (this.callbacks.onSceneMutate) {
      this.callbacks.onSceneMutate();
    }
  }

  private updateCursor(): void {
    switch (this.tool) {
      case "pan":
        this.hostElement.style.cursor = "grab";
        break;
      case "pen":
      case "highlighter":
        this.hostElement.style.cursor = "crosshair";
        break;
      case "eraser":
        this.hostElement.style.cursor = "cell";
        break;
      case "lasso":
        this.hostElement.style.cursor = "crosshair";
        break;
      default:
        this.hostElement.style.cursor = "default";
    }
  }

  private safeCapturePointer(pointerId: number): void {
    try {
      this.hostElement.setPointerCapture(pointerId);
    } catch {
      // Ignored in test environment
    }
  }

  private safeReleasePointer(pointerId: number): void {
    try {
      this.hostElement.releasePointerCapture(pointerId);
    } catch {
      // Ignored in test environment
    }
  }
}
