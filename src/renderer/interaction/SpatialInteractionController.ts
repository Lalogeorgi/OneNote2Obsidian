import { SpatialBounds } from "../../geometry/Bounds";
import { Point, Point2D } from "../../geometry/Point";
import { Rectangle } from "../../geometry/Rectangle";
import { ViewportTransform } from "../../geometry/Transform";
import { ViewportManager } from "../../geometry/ViewportManager";
import { CanonicalOutline } from "../../model/CanonicalElements";
import { AssetId, IdGenerator, ObjectId } from "../../model/Ids";
import {
  PageScene,
  PageSceneNode,
  SceneGroupNode,
  SceneOutlineNode,
  SceneStickyNoteNode,
} from "../../pagescene/PageScene";
import { SceneBuilder } from "../../pagescene/SceneBuilder";
import { SpatialIndex } from "../../pagescene/SpatialIndex";
import { AnchorKind, StickyNoteColorPreset } from "../../model/CanonicalStickyNote";
import { StickyNoteUtils } from "../../model/StickyNoteUtils";
import { SpatialAnchorManager } from "../../knowledge/SpatialAnchorManager";
import { SpatialGroupManager } from "../../knowledge/SpatialGroupManager";
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
  ChangeStickyNoteStyleCommand,
  CreateStickyNoteCommand,
  ToggleStickyNotePinCommand,
  UpdateStickyNoteContentCommand,
} from "../../editor/commands/StickyNoteCommands";
import { ResizeHandle, TransformGizmo } from "../../editor/gizmo/TransformGizmo";
import { HistoryManager } from "../../editor/HistoryManager";
import { InkDrawingController, InkToolOptions } from "../../editor/ink/InkDrawingController";
import { LassoSelectionController } from "../../editor/selection/LassoSelectionController";
import { InlineTextEditor } from "../../editor/text/InlineTextEditor";
import { SpatialClipboard } from "../../editor/clipboard/SpatialClipboard";
import { SceneGraphHierarchy } from "../pixi/SceneGraphHierarchy";
import { SceneSynchronizer } from "../pixi/SceneSynchronizer";
import { DIGITAL_RULER_METRICS } from "../../constants/RibbonConstants";
import {
  CANVAS_INTERACTION_METRICS,
  CANVAS_INSERTION_DEFAULTS,
  CANVAS_CONTEXT_MENU_CONFIG,
  CANVAS_CURSORS,
  ContextMenuActionId,
  createDefaultSpawnPoint,
  createStickySpawnPoint,
} from "../../constants/CanvasConstants";

export type InteractionTool =
  "pan" | "select" | "pen" | "highlighter" | "pencil" | "eraser" | "lasso" | "shape" | "ruler";

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
  private isDrawingShape = false;
  private shapeStartScene: Point2D = new Point(0, 0);
  private isSelectingLasso = false;

  private dragStartScreen: Point2D = new Point(0, 0);
  private dragStartScene: Point2D = new Point(0, 0);
  private lastPointerScreen: Point2D = new Point(0, 0);
  private lastPointerScene: Point2D = new Point(0, 0);

  private activeResizeHandle: ResizeHandle | null = null;
  private resizeNodeInitialBounds: SpatialBounds | null = null;
  private selectedNodeIds = new Set<ObjectId>();
  private hoveredNodeId: ObjectId | null = null;

  // Touch gesture & kinetic momentum state
  private activeTouchPoints = new Map<number, Point2D>();
  private primaryTouchIds: [number, number] | null = null;
  private lastPinchDistance = 0;
  private lastPinchCenterScreen: Point2D | null = null;
  private velocityHistory: Array<{ x: number; y: number; time: number }> = [];
  private momentumAnimId: number | null = null;
  private isTouchPanning = false;
  private wasPinching = false;
  private pendingTouchTarget: HTMLElement | null = null;
  public static readonly TOUCH_PAN_SLOP = 8;

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
    this.hostElement.classList.add("onenote-canvas-host");
    this.bindEvents();
    this.bindSynchronizerEvents();
  }

  public setSynchronizer(synchronizer: SceneSynchronizer): void {
    this.synchronizer = synchronizer;
    this.bindSynchronizerEvents();
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
    const cmd = new DeleteNodesCommand(this.currentScene, Array.from(this.selectedNodeIds), () =>
      this.notifySceneMutated()
    );
    this.history.execute(cmd);
    this.clearSelection();
  }

  public duplicateSelection(offset = CANVAS_INTERACTION_METRICS.DUPLICATE_OFFSET): void {
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
      SpatialClipboard.cut(this.currentScene, nodes, this.history, () => this.notifySceneMutated());
      this.clearSelection();
    }
  }

  public paste(targetScenePt?: Point2D): void {
    if (!this.currentScene) return;
    const target = targetScenePt ?? this.lastPointerScene;
    const pasted = SpatialClipboard.paste(this.currentScene, target, this.history, () =>
      this.notifySceneMutated()
    );
    if (pasted.length > 0) {
      this.selectNodes(pasted);
    }
  }

  public adjustZOrder(action: ZOrderAction): void {
    if (!this.currentScene || this.selectedNodeIds.size === 0) return;
    const cmd = new ZOrderCommand(this.currentScene, Array.from(this.selectedNodeIds), action, () =>
      this.notifySceneMutated()
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

  public insertImage(
    assetId: AssetId,
    mimeType: string = CANVAS_INSERTION_DEFAULTS.IMAGE_MIME_TYPE,
    width: number = CANVAS_INSERTION_DEFAULTS.IMAGE_WIDTH,
    height: number = CANVAS_INSERTION_DEFAULTS.IMAGE_HEIGHT,
    targetPt?: Point2D
  ): void {
    if (!this.currentScene) return;
    const pt = targetPt ?? this.lastPointerScene ?? createDefaultSpawnPoint();
    const zIndex =
      this.currentScene.nodes.length > 0
        ? Math.max(...this.currentScene.nodes.map((n) => n.zIndex)) + 1
        : 1;

    const imgElement: import("../../model/CanonicalElements").CanonicalImage = {
      type: "image",
      id: IdGenerator.objectId("img"),
      bounds: { x: pt.x, y: pt.y, width, height, zIndex },
      assetId,
      mimeType: mimeType as any,
    };

    const node: import("../../pagescene/PageScene").SceneImageNode = {
      id: imgElement.id,
      layer: "images",
      bounds: imgElement.bounds,
      aabb: Rectangle.create(pt.x, pt.y, width, height),
      zIndex,
      visible: true,
      element: imgElement,
      assetId,
      mimeType,
    };

    const cmd = new InsertElementCommand(this.currentScene, node, () => this.notifySceneMutated());
    this.history.execute(cmd);
    this.selectNodes([node]);
  }

  public insertTable(
    cols: number = CANVAS_INSERTION_DEFAULTS.TABLE_COLS,
    rows: number = CANVAS_INSERTION_DEFAULTS.TABLE_ROWS,
    targetPt?: Point2D
  ): void {
    if (!this.currentScene) return;
    const pt = targetPt ?? this.lastPointerScene ?? createDefaultSpawnPoint();
    const zIndex =
      this.currentScene.nodes.length > 0
        ? Math.max(...this.currentScene.nodes.map((n) => n.zIndex)) + 1
        : 1;

    const tableRows = [];
    for (let r = 0; r < rows; r++) {
      const cells = [];
      for (let c = 0; c < cols; c++) {
        cells.push({ id: IdGenerator.objectId("c"), elements: [] });
      }
      tableRows.push({ id: IdGenerator.objectId("row"), cells });
    }

    const tableWidth = cols * CANVAS_INSERTION_DEFAULTS.TABLE_COL_WIDTH;
    const tableHeight = rows * CANVAS_INSERTION_DEFAULTS.TABLE_ROW_HEIGHT;

    const tableElement: import("../../model/CanonicalElements").CanonicalTable = {
      type: "table",
      id: IdGenerator.objectId("table"),
      bounds: { x: pt.x, y: pt.y, width: tableWidth, height: tableHeight, zIndex },
      columns: Array.from({ length: cols }, () => ({
        width: CANVAS_INSERTION_DEFAULTS.TABLE_COL_WIDTH,
      })),
      rows: tableRows,
    };

    const node: import("../../pagescene/PageScene").SceneTableNode = {
      id: tableElement.id,
      layer: "tables",
      bounds: tableElement.bounds,
      aabb: Rectangle.create(pt.x, pt.y, tableWidth, tableHeight),
      zIndex,
      visible: true,
      element: tableElement,
    };

    const cmd = new InsertElementCommand(this.currentScene, node, () => this.notifySceneMutated());
    this.history.execute(cmd);
    this.selectNodes([node]);
  }

  public insertTimestamp(targetPt?: Point2D): void {
    const now = new Date();
    const formatted =
      now.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }) +
      " " +
      now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

    this.insertNoteContainer(formatted, targetPt);
  }

  public insertNoteContainer(initialText = "", targetPt?: Point2D): void {
    if (!this.currentScene) return;
    const pt = targetPt ?? this.lastPointerScene ?? createDefaultSpawnPoint();
    const zIndex =
      this.currentScene.nodes.length > 0
        ? Math.max(...this.currentScene.nodes.map((n) => n.zIndex)) + 1
        : 1;

    const width = CANVAS_INSERTION_DEFAULTS.NOTE_CONTAINER_WIDTH;
    const height = CANVAS_INSERTION_DEFAULTS.NOTE_CONTAINER_HEIGHT;

    const newOutline: CanonicalOutline = {
      type: "outline",
      id: IdGenerator.objectId("outline"),
      bounds: { x: pt.x, y: pt.y, width, height, zIndex },
      paragraphs: [
        {
          id: IdGenerator.objectId("p"),
          indentLevel: 0,
          runs: [{ text: initialText }],
        },
      ],
    };

    const newNode: SceneOutlineNode = {
      id: newOutline.id,
      layer: "text",
      bounds: newOutline.bounds,
      aabb: Rectangle.create(pt.x, pt.y, width, height),
      zIndex,
      visible: true,
      element: newOutline,
      renderedHtml: initialText ? `<p>${initialText}</p>` : "<p><br></p>",
    };

    const cmd = new InsertElementCommand(this.currentScene, newNode, () =>
      this.notifySceneMutated()
    );
    this.history.execute(cmd);
    this.selectNodes([newNode]);

    setTimeout(() => {
      const domEl = document.getElementById(`dom-outline-${newNode.id}`);
      const bodyEl = domEl?.querySelector(".onenote-container-body") as HTMLElement;
      if (bodyEl) {
        bodyEl.focus();
      }
    }, CANVAS_INTERACTION_METRICS.FOCUS_INPUT_DELAY_MS);
  }

  public insertStickyNote(
    colorPreset:
      StickyNoteColorPreset | string = CANVAS_INSERTION_DEFAULTS.STICKY_NOTE_DEFAULT_COLOR,
    opacity = 1.0,
    targetPt?: Point2D
  ): SceneStickyNoteNode | null {
    if (!this.currentScene) return null;
    const pt = targetPt ?? this.lastPointerScene ?? createStickySpawnPoint();
    const zIndex =
      this.currentScene.nodes.length > 0
        ? Math.max(...this.currentScene.nodes.map((n) => n.zIndex)) + 1
        : 1;

    const width = CANVAS_INSERTION_DEFAULTS.STICKY_NOTE_WIDTH;
    const height = CANVAS_INSERTION_DEFAULTS.STICKY_NOTE_HEIGHT;

    const canonicalNote = StickyNoteUtils.createDefaultStickyNote({
      id: IdGenerator.stickyNoteId(),
      bounds: { x: pt.x, y: pt.y, width, height, zIndex },
      color: colorPreset,
      opacity,
      content: "",
    });

    const colors = StickyNoteUtils.resolveStickyNoteColors(
      canonicalNote.color,
      canonicalNote.theme
    );
    const renderedHtml = SceneBuilder.renderStickyNoteHtml(canonicalNote, colors);

    const node: SceneStickyNoteNode = {
      id: canonicalNote.id,
      layer: "stickyNotes",
      bounds: canonicalNote.bounds,
      aabb: Rectangle.create(pt.x, pt.y, width, height),
      zIndex,
      visible: true,
      opacity: canonicalNote.opacity,
      element: canonicalNote,
      title: canonicalNote.title,
      text: canonicalNote.content,
      renderedHtml,
      color: colors.background,
      headerColor: colors.header,
      textColor: colors.text,
      borderColor: colors.border,
      isPinned: false,
    };

    const cmd = new CreateStickyNoteCommand(this.currentScene, node, () =>
      this.notifySceneMutated()
    );
    this.history.execute(cmd);
    this.selectNodes([node]);

    // Immediately pop out independent quick note (do not leave docked)
    if (this.synchronizer?.onStickyNotePopout) {
      this.synchronizer.onStickyNotePopout(node);
    }

    return node;
  }

  public anchorStickyNote(
    noteId: ObjectId,
    targetNodeId: ObjectId,
    kind: AnchorKind = "attached"
  ): boolean {
    if (!this.currentScene) return false;
    const note = this.currentScene.nodes.find(
      (n) => n.id === noteId && n.layer === "stickyNotes"
    ) as SceneStickyNoteNode | undefined;
    const targetNode = this.currentScene.nodes.find((n) => n.id === targetNodeId);
    if (!note || !targetNode) return false;

    SpatialAnchorManager.createAnchorForNote(note, targetNode, kind);
    this.notifySceneMutated();
    return true;
  }

  public unanchorStickyNote(noteId: ObjectId): boolean {
    if (!this.currentScene) return false;
    const note = this.currentScene.nodes.find(
      (n) => n.id === noteId && n.layer === "stickyNotes"
    ) as SceneStickyNoteNode | undefined;
    if (!note) return false;

    SpatialAnchorManager.removeAnchor(note);
    this.notifySceneMutated();
    return true;
  }

  public groupSelectedNodes(title?: string): SceneGroupNode | null {
    if (!this.currentScene) return null;
    const selNodes = this.getSelectedNodes().filter((n) => n.layer !== "spatialGroups");
    if (selNodes.length === 0) return null;

    const groupNode = SpatialGroupManager.createGroup(
      this.currentScene,
      selNodes.map((n) => n.id),
      { title: title || "Group" }
    );

    if (groupNode) {
      this.selectNodes([groupNode]);
      this.notifySceneMutated();
    }
    return groupNode;
  }

  public ungroupSelectedGroups(): boolean {
    if (!this.currentScene) return false;
    const selGroups = this.getSelectedNodes().filter(
      (n) => n.layer === "spatialGroups"
    ) as SceneGroupNode[];
    if (selGroups.length === 0) return false;

    let anyUngrouped = false;
    for (const grp of selGroups) {
      const success = SpatialGroupManager.ungroup(this.currentScene, grp.id);
      if (success) anyUngrouped = true;
    }

    if (anyUngrouped) {
      this.selectNodes([]);
      this.notifySceneMutated();
    }
    return anyUngrouped;
  }

  private bindSynchronizerEvents(): void {
    if (!this.synchronizer) return;

    this.synchronizer.onStickyNoteTitleChange = (node, newTitle) => {
      const cmd = new UpdateStickyNoteContentCommand(
        node,
        node.element.content,
        newTitle,
        node.element.paragraphs,
        () => this.notifySceneMutated()
      );
      this.history.execute(cmd);
    };

    this.synchronizer.onStickyNoteContentChange = (node, newContent) => {
      const cmd = new UpdateStickyNoteContentCommand(
        node,
        newContent,
        node.element.title,
        node.element.paragraphs,
        () => this.notifySceneMutated()
      );
      this.history.execute(cmd);
    };

    this.synchronizer.onStickyNoteStyleChange = (node, style) => {
      const cmd = new ChangeStickyNoteStyleCommand(node, style, () => this.notifySceneMutated());
      this.history.execute(cmd);
    };

    this.synchronizer.onStickyNotePinToggle = (node) => {
      const cmd = new ToggleStickyNotePinCommand(node, () => this.notifySceneMutated());
      this.history.execute(cmd);
    };

    this.synchronizer.onStickyNoteDelete = (node) => {
      if (this.currentScene) {
        const cmd = new DeleteNodesCommand(this.currentScene, [node.id], () =>
          this.notifySceneMutated()
        );
        this.history.execute(cmd);
        this.clearSelection();
      }
    };

    this.synchronizer.onStickyNoteDuplicate = (node) => {
      if (this.currentScene) {
        const cmd = new DuplicateNodesCommand(
          this.currentScene,
          [node.id],
          CANVAS_INTERACTION_METRICS.DUPLICATE_OFFSET,
          () => this.notifySceneMutated()
        );
        this.history.execute(cmd);
      }
    };

    this.synchronizer.onGroupTitleChange = (node, newTitle) => {
      (node as any).title = newTitle;
      (node.element as any).title = newTitle;
      (node.element as any).modifiedTime = Date.now();
      this.notifySceneMutated();
    };

    this.synchronizer.onGroupUngroup = (node) => {
      if (this.currentScene) {
        SpatialGroupManager.ungroup(this.currentScene, node.id);
        this.notifySceneMutated();
      }
    };
  }

  // --- Kinetic Momentum & Velocity Tracking ---

  private recordVelocity(screenPt: Point2D): void {
    const now = performance.now();
    this.velocityHistory.push({ x: screenPt.x, y: screenPt.y, time: now });
    while (this.velocityHistory.length > 0 && now - this.velocityHistory[0]!.time > 100) {
      this.velocityHistory.shift();
    }
  }

  private calculateReleaseVelocity(): { vx: number; vy: number } {
    if (this.velocityHistory.length < 2) return { vx: 0, vy: 0 };
    const first = this.velocityHistory[0]!;
    const last = this.velocityHistory[this.velocityHistory.length - 1]!;
    const dt = last.time - first.time;
    if (dt <= 10) return { vx: 0, vy: 0 };
    return {
      vx: (last.x - first.x) / dt,
      vy: (last.y - first.y) / dt,
    };
  }

  public stopMomentum(): void {
    if (this.momentumAnimId !== null) {
      cancelAnimationFrame(this.momentumAnimId);
      this.momentumAnimId = null;
    }
  }

  private startMomentum(vx: number, vy: number): void {
    this.stopMomentum();
    const speed = Math.hypot(vx, vy);
    if (speed < 0.15) return;

    const maxSpeed = 3.5;
    let curVx = (vx / speed) * Math.min(speed, maxSpeed);
    let curVy = (vy / speed) * Math.min(speed, maxSpeed);

    let lastTime = performance.now();
    const friction = 0.93;

    const step = (time: number) => {
      const dt = Math.min(32, time - lastTime);
      lastTime = time;

      const frameScale = dt / 16.67;
      const stepFriction = Math.pow(friction, frameScale);

      const dx = curVx * dt;
      const dy = curVy * dt;

      curVx *= stepFriction;
      curVy *= stepFriction;

      const current = this.getTransform();
      const next = ViewportManager.panBy(current, dx, dy);
      this.callbacks.onViewportChange(next);

      if (Math.hypot(curVx, curVy) > 0.05) {
        this.momentumAnimId = requestAnimationFrame(step);
      } else {
        this.momentumAnimId = null;
      }
    };

    this.momentumAnimId = requestAnimationFrame(step);
  }

  // --- Event Binding ---

  private bindEvents(): void {
    this.hostElement.addEventListener("wheel", this.handleWheel, { passive: false });
    this.hostElement.addEventListener("pointerdown", this.handlePointerDown);
    this.hostElement.addEventListener("pointermove", this.handlePointerMove);
    this.hostElement.addEventListener("pointerup", this.handlePointerUp);
    this.hostElement.addEventListener("pointercancel", this.handlePointerCancel);
    this.hostElement.addEventListener("lostpointercapture", this.handleLostPointerCapture);
    this.hostElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.hostElement.addEventListener("contextmenu", this.handleContextMenu);
    this.hostElement.addEventListener("dblclick", this.handleDoubleClick);
    window.addEventListener("pointermove", this.handleWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", this.handleWindowPointerUp);
    window.addEventListener("pointercancel", this.handleWindowPointerUp);
    window.addEventListener("keydown", this.handleKeyDown);
  }

  public unbind(): void {
    this.stopMomentum();
    this.hostElement.removeEventListener("wheel", this.handleWheel);
    this.hostElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.hostElement.removeEventListener("pointermove", this.handlePointerMove);
    this.hostElement.removeEventListener("pointerup", this.handlePointerUp);
    this.hostElement.removeEventListener("pointercancel", this.handlePointerCancel);
    this.hostElement.removeEventListener("lostpointercapture", this.handleLostPointerCapture);
    this.hostElement.removeEventListener("pointerleave", this.handlePointerLeave);
    this.hostElement.removeEventListener("contextmenu", this.handleContextMenu);
    this.hostElement.removeEventListener("dblclick", this.handleDoubleClick);
    window.removeEventListener("pointermove", this.handleWindowPointerMove);
    window.removeEventListener("pointerup", this.handleWindowPointerUp);
    window.removeEventListener("pointercancel", this.handleWindowPointerUp);
    window.removeEventListener("keydown", this.handleKeyDown);
    this.closeContextMenu();
    this.clearSelection();
  }

  private handleWindowPointerMove = (e: PointerEvent): void => {
    // If a gesture is active (pointer down, dragging, panning, or active touches), route global moves
    if (this.isPointerDown || this.activeTouchPoints.size > 0) {
      this.handlePointerMove(e);
    }
  };

  private handleWindowPointerUp = (e: PointerEvent): void => {
    if (this.isPointerDown || this.activeTouchPoints.has(e.pointerId)) {
      this.handlePointerUp(e);
    }
  };

  private contextMenuEl: HTMLElement | null = null;

  public closeContextMenu(): void {
    if (this.contextMenuEl) {
      this.contextMenuEl.remove();
      this.contextMenuEl = null;
    }
  }

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    this.closeContextMenu();

    const rect = this.hostElement.getBoundingClientRect();
    const screenPt = new Point(e.clientX - rect.left, e.clientY - rect.top);
    const scenePt = this.screenToScene(screenPt);

    const hitNode = this.spatialIndex.hitTest(scenePt);
    if (hitNode && !this.selectedNodeIds.has(hitNode.id)) {
      this.selectNodes([hitNode]);
    }

    const selNodes = this.getSelectedNodes();
    const menu = document.createElement("div");
    menu.className = "onenote-canvas-context-menu";
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    const addItem = (icon: string, label: string, shortcut: string, onClick: () => void) => {
      const item = document.createElement("button");
      item.className = "onenote-context-item";
      const iconSpan = document.createElement("span");
      iconSpan.className = "onenote-context-icon";
      iconSpan.textContent = icon;
      const labelSpan = document.createElement("span");
      labelSpan.className = "onenote-context-label";
      labelSpan.textContent = label;
      const shortcutSpan = document.createElement("span");
      shortcutSpan.className = "onenote-context-shortcut";
      shortcutSpan.textContent = shortcut;
      item.appendChild(iconSpan);
      item.appendChild(labelSpan);
      item.appendChild(shortcutSpan);
      item.addEventListener("click", (evt) => {
        evt.stopPropagation();
        this.closeContextMenu();
        onClick();
      });
      menu.appendChild(item);
    };

    const addSeparator = () => {
      const sep = document.createElement("div");
      sep.className = "onenote-context-separator";
      menu.appendChild(sep);
    };

    const handleAction = (actionId: ContextMenuActionId) => {
      switch (actionId) {
        case "bringToFront":
          this.adjustZOrder("bringToFront");
          break;
        case "bringForward":
          this.adjustZOrder("bringForward");
          break;
        case "sendBackward":
          this.adjustZOrder("sendBackward");
          break;
        case "sendToBack":
          this.adjustZOrder("sendToBack");
          break;
        case "cut":
          this.cutSelection();
          break;
        case "copy":
          this.copySelection();
          break;
        case "paste":
          this.paste();
          break;
        case "duplicate":
          this.duplicateSelection();
          break;
        case "delete":
          this.deleteSelection();
          break;
      }
    };

    const items =
      selNodes.length > 0
        ? CANVAS_CONTEXT_MENU_CONFIG.SELECTION_ITEMS
        : CANVAS_CONTEXT_MENU_CONFIG.EMPTY_CANVAS_ITEMS;

    for (const item of items) {
      if (item.type === "separator") {
        addSeparator();
      } else {
        addItem(item.icon, item.label, item.shortcut, () => handleAction(item.action));
      }
    }

    document.body.appendChild(menu);
    this.contextMenuEl = menu;

    const onDocClick = (evt: MouseEvent) => {
      if (menu && !menu.contains(evt.target as Node)) {
        this.closeContextMenu();
        window.removeEventListener("pointerdown", onDocClick as any, true);
      }
    };
    setTimeout(() => {
      window.addEventListener("pointerdown", onDocClick as any, true);
    }, CANVAS_INTERACTION_METRICS.CONTEXT_MENU_DISMISS_DELAY_MS);
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    // Ignore if focus is in an input, textarea, or contentEditable element
    const target = e.target as HTMLElement | null;
    const targetTag = target?.tagName?.toLowerCase();
    if (
      targetTag === "input" ||
      targetTag === "textarea" ||
      target?.isContentEditable ||
      target?.closest("[contenteditable='true']") ||
      target?.closest(".onenote-sticky-title-input") ||
      target?.closest(".onenote-sticky-body")
    ) {
      return;
    }

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

    if (isCtrlOrMeta && (e.key === "g" || e.key === "G")) {
      e.preventDefault();
      if (e.shiftKey) {
        this.ungroupSelectedGroups();
      } else {
        this.groupSelectedNodes();
      }
      return;
    }

    // Z-Order Shortcuts
    if (isCtrlOrMeta && (e.key === "]" || e.key === "}")) {
      if (this.selectedNodeIds.size > 0) {
        e.preventDefault();
        this.adjustZOrder(e.shiftKey ? "bringToFront" : "bringForward");
      }
      return;
    }

    if (isCtrlOrMeta && (e.key === "[" || e.key === "{")) {
      if (this.selectedNodeIds.size > 0) {
        e.preventDefault();
        this.adjustZOrder(e.shiftKey ? "sendToBack" : "sendBackward");
      }
      return;
    }

    // Arrow keys for nudging selected objects
    const nudgeAmount = e.shiftKey
      ? CANVAS_INTERACTION_METRICS.NUDGE_SHIFT_STEP
      : CANVAS_INTERACTION_METRICS.NUDGE_NORMAL_STEP;
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
              const cmd = new EditTextCommand(node, outline.paragraphs, newParas, () =>
                this.notifySceneMutated()
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
      const zoomFactor =
        e.deltaY < 0
          ? CANVAS_INTERACTION_METRICS.WHEEL_ZOOM_IN
          : CANVAS_INTERACTION_METRICS.WHEEL_ZOOM_OUT;
      const current = this.getTransform();
      let next = ViewportManager.zoomAtScreenPoint(current, screenPoint, zoomFactor);
      if (this.currentScene && zoomFactor < 1) {
        next = ViewportManager.clampTopLeftAnchor(
          next,
          this.currentScene.canvasBounds,
          rect.width,
          rect.height
        );
      }
      this.callbacks.onViewportChange(next);
    } else {
      const current = this.getTransform();
      const next = ViewportManager.panBy(current, -e.deltaX, -e.deltaY);
      this.callbacks.onViewportChange(next);
    }
  };

  private handlePointerDown = (e: PointerEvent): void => {
    // 1. Stop any ongoing kinetic momentum
    this.stopMomentum();

    const rect = this.hostElement.getBoundingClientRect();
    const screenPt = new Point(e.clientX - rect.left, e.clientY - rect.top);
    const scenePt = this.screenToScene(screenPt);

    this.activeTouchPoints.set(e.pointerId, screenPt);

    // Multi-touch gestures (2 or more fingers)
    if (this.activeTouchPoints.size >= 2) {
      this.wasPinching = true;
      // Cancel any single-finger active stroke
      if (this.isDrawingInk) {
        this.isDrawingInk = false;
        this.ink.cancelStroke();
        this.synchronizer?.clearActiveStroke();
      }
      // Cancel any single-finger lasso selection
      if (this.isSelectingLasso) {
        this.isSelectingLasso = false;
        this.lasso.clear();
        this.synchronizer?.clearLasso();
      }
      this.isMoving = false;
      this.isResizing = false;
      this.isDrawingShape = false;
      this.synchronizer?.clearShapePreview();

      const ids = Array.from(this.activeTouchPoints.keys());
      this.primaryTouchIds = [ids[0]!, ids[1]!];
      const p1 = this.activeTouchPoints.get(this.primaryTouchIds[0])!;
      const p2 = this.activeTouchPoints.get(this.primaryTouchIds[1])!;

      this.lastPinchDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      this.lastPinchCenterScreen = new Point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      this.isPanning = false;
      this.isTouchPanning = false;
      this.pendingTouchTarget = null;
      this.velocityHistory = [];
      // Release pointer capture on touch points to avoid browser cancellation during multi-touch
      for (const id of ids) {
        this.safeReleasePointer(id);
      }
      return;
    }

    this.isPointerDown = true;
    this.isDragging = false;
    this.dragStartScreen = screenPt;
    this.dragStartScene = scenePt;
    this.lastPointerScreen = screenPt;
    this.lastPointerScene = scenePt;
    this.velocityHistory = [];
    this.recordVelocity(screenPt);

    // Pan Initiation
    if (e.button === 1 || this.tool === "pan" || e.altKey) {
      this.isPanning = true;
      this.isTouchPanning = e.pointerType === "touch";
      this.hostElement.style.cursor = CANVAS_CURSORS.panning;
      this.safeCapturePointer(e.pointerId, e.pointerType);
      return;
    }

    // Ink Drawing (Pen / Highlighter / Pencil)
    if (this.tool === "pen" || this.tool === "highlighter" || this.tool === "pencil") {
      this.isDrawingInk = true;
      const pt = this.snapToRulerIfActive(scenePt);
      this.ink.startStroke(pt);
      this.safeCapturePointer(e.pointerId, e.pointerType);
      return;
    }

    // Shape Drawing Tool
    if (this.tool === "shape") {
      this.isDrawingShape = true;
      this.shapeStartScene = scenePt;
      this.safeCapturePointer(e.pointerId, e.pointerType);
      return;
    }

    // Stroke Eraser
    if (this.tool === "eraser") {
      this.eraseInkAt(scenePt);
      this.safeCapturePointer(e.pointerId, e.pointerType);
      return;
    }

    // Lasso Selection Mode
    if (this.tool === "lasso") {
      this.isSelectingLasso = true;
      this.lasso.start(scenePt);
      this.safeCapturePointer(e.pointerId, e.pointerType);
      return;
    }

    this.closeContextMenu();

    // Check for Image selection and drag
    const targetEl = e.target as HTMLElement | null;
    const imgEl = targetEl?.closest(".onenote-image-container") as HTMLElement | null;
    if (imgEl && this.currentScene) {
      const nodeId = (imgEl as any).datasetNodeId;
      const node = this.currentScene.nodes.find((n) => n.id === nodeId);
      if (node) {
        if (!this.selectedNodeIds.has(node.id)) {
          this.selectNodes([node]);
        }
        if (e.pointerType === "touch") {
          // Touch screen parity: touching an image selects it; dragging finger pans viewport
          this.pendingTouchTarget = targetEl;
          this.isTouchPanning = true;
          this.isPanning = false;
          this.safeCapturePointer(e.pointerId, e.pointerType);
          return;
        }
        this.isMoving = true;
        this.safeCapturePointer(e.pointerId, e.pointerType);
        return;
      }
    }

    // Check for Sticky Note Header grab / header drag
    const stickyHeaderEl = targetEl?.closest(".onenote-sticky-header") as HTMLElement | null;
    if (stickyHeaderEl && this.currentScene) {
      if (
        !targetEl?.closest(".onenote-sticky-action-btn") &&
        !targetEl?.closest(".onenote-sticky-title-input") &&
        !targetEl?.closest(".onenote-sticky-popover")
      ) {
        const nodeId =
          (stickyHeaderEl as any).datasetNodeId ||
          (stickyHeaderEl.parentElement as any)?.datasetNodeId;
        const node = this.currentScene.nodes.find((n) => n.id === nodeId);
        if (node) {
          this.selectNodes([node]);
          if (!(node as any).isPinned) {
            if (e.pointerType === "touch" && !targetEl?.closest(".onenote-sticky-grab-handle")) {
              this.pendingTouchTarget = targetEl;
              this.isTouchPanning = true;
              this.isPanning = false;
              this.safeCapturePointer(e.pointerId, e.pointerType);
              return;
            }
            this.isMoving = true;
            this.safeCapturePointer(e.pointerId, e.pointerType);
          }
          return;
        }
      }
    }

    // Check for Sticky Note Resizer
    const stickyResizerEl = targetEl?.closest(".onenote-sticky-resizer") as HTMLElement | null;
    if (stickyResizerEl && this.currentScene) {
      const nodeId =
        (stickyResizerEl as any).datasetNodeId ||
        (stickyResizerEl.parentElement as any)?.datasetNodeId;
      const handle = (stickyResizerEl as any).datasetHandle || "se";
      const node = this.currentScene.nodes.find((n) => n.id === nodeId);
      if (node) {
        this.selectNodes([node]);
        if (!(node as any).isPinned) {
          this.isResizing = true;
          this.activeResizeHandle = handle as ResizeHandle;
          this.resizeNodeInitialBounds = { ...node.bounds };
          this.safeCapturePointer(e.pointerId, e.pointerType);
        }
        return;
      }
    }

    // Check for Note Container grab handle or header drag
    const grabEl = targetEl?.closest(".onenote-container-grab-handle") as HTMLElement | null;
    if (grabEl && this.currentScene) {
      const nodeId =
        (grabEl as any).datasetNodeId ||
        (grabEl.parentElement?.parentElement as any)?.datasetNodeId;
      const node = this.currentScene.nodes.find((n) => n.id === nodeId);
      if (node) {
        this.selectNodes([node]);
        this.isMoving = true;
        this.safeCapturePointer(e.pointerId, e.pointerType);
        return;
      }
    }

    const noteContainerHeaderEl = targetEl?.closest(
      ".onenote-container-header"
    ) as HTMLElement | null;
    if (noteContainerHeaderEl && this.currentScene) {
      const parentContainer = noteContainerHeaderEl.closest(
        ".onenote-note-container"
      ) as HTMLElement | null;
      const nodeId =
        (noteContainerHeaderEl as any).datasetNodeId || (parentContainer as any)?.datasetNodeId;
      const node = this.currentScene.nodes.find((n) => n.id === nodeId);
      if (node) {
        if (!this.selectedNodeIds.has(node.id)) {
          this.selectNodes([node]);
        }
        this.isMoving = true;
        this.safeCapturePointer(e.pointerId, e.pointerType);
        return;
      }
    }

    const resizerEl = targetEl?.closest(".onenote-container-resizer") as HTMLElement | null;
    if (resizerEl && this.currentScene) {
      const nodeId =
        (resizerEl as any).datasetNodeId || (resizerEl.parentElement as any)?.datasetNodeId;
      const node = this.currentScene.nodes.find((n) => n.id === nodeId);
      if (node) {
        this.selectNodes([node]);
        this.isResizing = true;
        this.activeResizeHandle = "e";
        this.resizeNodeInitialBounds = { ...node.bounds };
        this.safeCapturePointer(e.pointerId, e.pointerType);
        return;
      }
    }

    if (
      targetEl?.closest(".onenote-container-body") ||
      targetEl?.closest(".onenote-title-input") ||
      targetEl?.closest(".onenote-sticky-body") ||
      targetEl?.closest(".onenote-sticky-title-input") ||
      targetEl?.closest(".onenote-sticky-popover")
    ) {
      const containerEl = targetEl.closest(".onenote-note-container") as HTMLElement | null;
      if (containerEl && this.currentScene) {
        const nodeId = (containerEl as any).datasetNodeId;
        const node = this.currentScene.nodes.find((n) => n.id === nodeId);
        if (node) {
          this.selectNodes([node]);
        }
      }
      if (e.pointerType === "touch") {
        // OneNote touch screen parity: swiping with finger across text notes smoothly pans the canvas;
        // a stationary tap will focus text editing in handlePointerUp.
        this.pendingTouchTarget = targetEl;
        this.isTouchPanning = true;
        this.isPanning = false;
        this.safeCapturePointer(e.pointerId, e.pointerType);
        return;
      }
      this.isPointerDown = false;
      return;
    }

    // Select Tool: Check for handle resize or node move
    if (e.button === 0 && this.tool === "select") {
      // 1. Check if clicked on a resize handle of the current selection
      const selNodes = this.getSelectedNodes();
      const selBounds = TransformGizmo.getSelectionBounds(selNodes);
      if (selBounds && selNodes.length === 1 && selNodes[0]!.layer !== "text") {
        const hitHandle = TransformGizmo.hitTestHandles(scenePt, selBounds);
        if (hitHandle) {
          this.isResizing = true;
          this.activeResizeHandle = hitHandle.handle;
          this.resizeNodeInitialBounds = { ...selNodes[0]!.bounds };
          this.hostElement.style.cursor = hitHandle.cursor;
          this.safeCapturePointer(e.pointerId, e.pointerType);
          return;
        }
      }

      // 2. Check if clicked inside bounds of any currently selected node to begin moving
      if (e.pointerType !== "touch") {
        for (const sn of selNodes) {
          if (
            scenePt.x >= sn.bounds.x &&
            scenePt.x <= sn.bounds.x + sn.bounds.width &&
            scenePt.y >= sn.bounds.y &&
            scenePt.y <= sn.bounds.y + sn.bounds.height
          ) {
            this.isMoving = true;
            this.safeCapturePointer(e.pointerId, e.pointerType);
            return;
          }
        }
      }

      // 3. Otherwise, single select or start marquee box
      const hitNode = this.spatialIndex.hitTest(scenePt);
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
          if (e.pointerType === "touch") {
            // Touch screen parity: tapping selects the node, but dragging directly on an unselected node
            // smoothly pans the canvas to avoid accidental displacements when swiping/reading.
            this.pendingTouchTarget = targetEl;
            this.isTouchPanning = true;
            this.isPanning = false;
          } else {
            this.isMoving = true;
          }
        }
      } else {
        if (e.pointerType === "touch") {
          // Single-finger touch drag on empty canvas smoothly pans the viewport (OneNote touch parity)
          this.pendingTouchTarget = targetEl;
          this.isTouchPanning = true;
          this.isPanning = false;
        } else {
          // Mouse drag on empty canvas starts marquee box selection
          if (!e.shiftKey) {
            this.clearSelection();
          }
          this.isSelectingLasso = true;
          this.lasso.start(scenePt);
        }
      }

      this.safeCapturePointer(e.pointerId, e.pointerType);
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    const rect = this.hostElement.getBoundingClientRect();
    const screenPt = new Point(e.clientX - rect.left, e.clientY - rect.top);
    const scenePt = this.screenToScene(screenPt);

    this.activeTouchPoints.set(e.pointerId, screenPt);

    // Multi-touch gestures (2 or more fingers)
    if (this.activeTouchPoints.size >= 2) {
      if (
        !this.primaryTouchIds ||
        !this.activeTouchPoints.has(this.primaryTouchIds[0]) ||
        !this.activeTouchPoints.has(this.primaryTouchIds[1])
      ) {
        const ids = Array.from(this.activeTouchPoints.keys());
        this.primaryTouchIds = [ids[0]!, ids[1]!];
        const p1 = this.activeTouchPoints.get(this.primaryTouchIds[0])!;
        const p2 = this.activeTouchPoints.get(this.primaryTouchIds[1])!;
        this.lastPinchDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        this.lastPinchCenterScreen = new Point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
        return;
      }

      const p1 = this.activeTouchPoints.get(this.primaryTouchIds[0])!;
      const p2 = this.activeTouchPoints.get(this.primaryTouchIds[1])!;
      const currentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const currentCenter = new Point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);

      if (this.lastPinchCenterScreen && this.lastPinchDistance > 0) {
        const current = this.getTransform();
        const next = ViewportManager.pinchTransform(
          current,
          this.lastPinchCenterScreen,
          currentCenter,
          currentDist,
          this.lastPinchDistance
        );
        this.callbacks.onViewportChange(next);
      }

      this.lastPinchDistance = currentDist;
      this.lastPinchCenterScreen = currentCenter;
      return;
    }

    if (this.callbacks.onCursorSceneMove) {
      this.callbacks.onCursorSceneMove(scenePt);
    }

    // Single-Finger Touch Panning (with touch slop threshold)
    if (this.isTouchPanning) {
      const distFromStart = Math.hypot(
        screenPt.x - this.dragStartScreen.x,
        screenPt.y - this.dragStartScreen.y
      );
      if (!this.isPanning && distFromStart > SpatialInteractionController.TOUCH_PAN_SLOP) {
        this.isPanning = true;
        this.isDragging = true;
        this.hostElement.style.cursor = CANVAS_CURSORS.panning;
      }
      if (this.isPanning) {
        const dx = screenPt.x - this.lastPointerScreen.x;
        const dy = screenPt.y - this.lastPointerScreen.y;
        this.lastPointerScreen = screenPt;
        this.lastPointerScene = scenePt;
        this.recordVelocity(screenPt);

        const current = this.getTransform();
        const next = ViewportManager.panBy(current, dx, dy);
        this.callbacks.onViewportChange(next);
        return;
      }
      this.lastPointerScreen = screenPt;
      this.lastPointerScene = scenePt;
      return;
    }

    // Mouse Panning (pan tool, middle button, or altKey)
    if (this.isPanning) {
      const dx = screenPt.x - this.lastPointerScreen.x;
      const dy = screenPt.y - this.lastPointerScreen.y;
      this.lastPointerScreen = screenPt;
      this.lastPointerScene = scenePt;

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
      if (dragDist > CANVAS_INTERACTION_METRICS.DRAG_START_THRESHOLD) {
        this.isDragging = true;
      }
    }

    // Ink Drawing
    if (this.isDrawingInk && this.isPointerDown) {
      const pt = this.snapToRulerIfActive(scenePt);
      this.ink.continueStroke(pt);
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

    // Shape Drawing Preview
    if (this.isDrawingShape && this.isPointerDown) {
      if (this.synchronizer) {
        const opts = this.ink.getOptions();
        this.synchronizer.renderShapePreview(
          opts.shapeKind,
          this.shapeStartScene,
          scenePt,
          opts.color,
          opts.strokeWidth,
          opts.fillColor
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
    if (
      this.isResizing &&
      this.isPointerDown &&
      this.activeResizeHandle &&
      this.resizeNodeInitialBounds
    ) {
      const deltaX = scenePt.x - this.dragStartScene.x;
      const deltaY = scenePt.y - this.dragStartScene.y;
      const selNodes = this.getSelectedNodes();
      if (selNodes.length === 1) {
        const node = selNodes[0]!;
        const minW =
          node.layer === "stickyNotes"
            ? CANVAS_INSERTION_DEFAULTS.MIN_STICKY_RESIZE_WIDTH
            : CANVAS_INSERTION_DEFAULTS.MIN_NODE_RESIZE_WIDTH;
        const newBounds = TransformGizmo.computeResizedBounds(
          this.resizeNodeInitialBounds,
          this.activeResizeHandle,
          deltaX,
          deltaY,
          e.shiftKey,
          minW
        );
        node.bounds = newBounds;
        node.aabb = Rectangle.create(newBounds.x, newBounds.y, newBounds.width, newBounds.height);
        if (this.synchronizer) {
          this.synchronizer.setSelectedNodes(selNodes);
          if (node.layer === "text") {
            const domEl = document.getElementById(`dom-outline-${node.id}`);
            if (domEl) {
              domEl.style.width = `${Math.max(CANVAS_INSERTION_DEFAULTS.MIN_TEXT_CONTAINER_WIDTH, newBounds.width)}px`;
            }
          } else if (node.layer === "stickyNotes") {
            const domEl = document.getElementById(`dom-sticky-${node.id}`);
            if (domEl) {
              domEl.style.width = `${Math.max(CANVAS_INSERTION_DEFAULTS.MIN_STICKY_RESIZE_WIDTH, newBounds.width)}px`;
              domEl.style.height = `${Math.max(CANVAS_INSERTION_DEFAULTS.MIN_STICKY_RESIZE_HEIGHT, newBounds.height)}px`;
              domEl.style.left = `${newBounds.x}px`;
              domEl.style.top = `${newBounds.y}px`;
            }
          }
          this.synchronizer.onNodeBoundsLiveUpdate?.(node.id, newBounds);
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
        if (node.layer === "stickyNotes" && (node as any).isPinned) {
          continue; // Pinned notes are locked in place
        }

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

        if (node.layer === "text") {
          const domEl =
            this.hostElement.querySelector<HTMLElement>(`#dom-outline-${node.id}`) ||
            document.getElementById(`dom-outline-${node.id}`);
          if (domEl) {
            domEl.style.left = `${node.bounds.x}px`;
            domEl.style.top = `${node.bounds.y}px`;
          }
        } else if (node.layer === "images") {
          const domEl =
            this.hostElement.querySelector<HTMLElement>(`#dom-image-${node.id}`) ||
            document.getElementById(`dom-image-${node.id}`);
          if (domEl) {
            domEl.style.left = `${node.bounds.x}px`;
            domEl.style.top = `${node.bounds.y}px`;
          }
        } else if (node.layer === "topInk" || node.layer === "bottomInk") {
          const domEl =
            this.hostElement.querySelector<HTMLElement>(`#dom-ink-${node.id}`) ||
            document.getElementById(`dom-ink-${node.id}`);
          if (domEl) {
            domEl.style.left = `${node.bounds.x}px`;
            domEl.style.top = `${node.bounds.y}px`;
          }
        } else if (node.layer === "tables") {
          const domEl =
            this.hostElement.querySelector<HTMLElement>(`#dom-table-${node.id}`) ||
            document.getElementById(`dom-table-${node.id}`);
          if (domEl) {
            domEl.style.left = `${node.bounds.x}px`;
            domEl.style.top = `${node.bounds.y}px`;
          }
        } else if (node.layer === "attachments") {
          const domEl =
            this.hostElement.querySelector<HTMLElement>(`#dom-attachment-${node.id}`) ||
            document.getElementById(`dom-attachment-${node.id}`);
          if (domEl) {
            domEl.style.left = `${node.bounds.x}px`;
            domEl.style.top = `${node.bounds.y}px`;
          }
        } else if (node.layer === "stickyNotes") {
          const domEl =
            this.hostElement.querySelector<HTMLElement>(`#dom-sticky-${node.id}`) ||
            document.getElementById(`dom-sticky-${node.id}`);
          if (domEl) {
            domEl.style.left = `${node.bounds.x}px`;
            domEl.style.top = `${node.bounds.y}px`;
          }
        } else if (node.layer === "spatialGroups") {
          const domEl =
            this.hostElement.querySelector<HTMLElement>(`#dom-group-${node.id}`) ||
            document.getElementById(`dom-group-${node.id}`);
          if (domEl) {
            domEl.style.left = `${node.bounds.x}px`;
            domEl.style.top = `${node.bounds.y}px`;
          }
          if (this.currentScene) {
            const movedMembers = SpatialGroupManager.moveGroup(
              this.currentScene,
              node.id,
              deltaX,
              deltaY
            );
            for (const member of movedMembers) {
              if (member.layer === "stickyNotes") {
                const memberDom = document.getElementById(`dom-sticky-${member.id}`);
                if (memberDom) {
                  memberDom.style.left = `${member.bounds.x}px`;
                  memberDom.style.top = `${member.bounds.y}px`;
                }
              } else if (member.layer === "text") {
                const memberDom = document.getElementById(`dom-outline-${member.id}`);
                if (memberDom) {
                  memberDom.style.left = `${member.bounds.x}px`;
                  memberDom.style.top = `${member.bounds.y}px`;
                }
              }
              if (this.synchronizer) {
                this.synchronizer.onNodeBoundsLiveUpdate?.(member.id, member.bounds);
              }
            }
          }
        }

        const pixiObj = this.synchronizer?.getDisplayObject(node.id);
        if (pixiObj) {
          pixiObj.position.x += deltaX;
          pixiObj.position.y += deltaY;
        }

        if (this.synchronizer) {
          this.synchronizer.onNodeBoundsLiveUpdate?.(node.id, node.bounds);
        }

        // Target Follower: Automatically move any Sticky Notes anchored to this node
        if (this.currentScene && node.layer !== "stickyNotes") {
          const anchoredNotes = SpatialAnchorManager.updateAnchoredNotesOnTargetMove(
            this.currentScene,
            node.id,
            deltaX,
            deltaY
          );
          for (const anchored of anchoredNotes) {
            const domEl = document.getElementById(`dom-sticky-${anchored.id}`);
            if (domEl) {
              domEl.style.left = `${anchored.bounds.x}px`;
              domEl.style.top = `${anchored.bounds.y}px`;
            }
            if (this.synchronizer) {
              this.synchronizer.onNodeBoundsLiveUpdate?.(anchored.id, anchored.bounds);
            }
          }
        } else if (this.currentScene && node.layer === "stickyNotes") {
          // Independent movement: update spatial offset relative to target
          const sticky = node as SceneStickyNoteNode;
          const anchor = sticky.anchor || sticky.element?.anchor;
          if (anchor && anchor.targetId) {
            const targetNode = this.currentScene.nodes.find((n) => n.id === anchor.targetId);
            if (targetNode) {
              SpatialAnchorManager.updateAnchorOffsetOnNoteMove(sticky, targetNode);
            }
          }
        }
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
    const rect = this.hostElement.getBoundingClientRect();
    const screenPt = new Point(e.clientX - rect.left, e.clientY - rect.top);
    const scenePt = this.screenToScene(screenPt);

    this.activeTouchPoints.delete(e.pointerId);

    // Multi-touch transitions
    if (this.activeTouchPoints.size >= 2) {
      const ids = Array.from(this.activeTouchPoints.keys());
      this.primaryTouchIds = [ids[0]!, ids[1]!];
      const p1 = this.activeTouchPoints.get(this.primaryTouchIds[0])!;
      const p2 = this.activeTouchPoints.get(this.primaryTouchIds[1])!;
      this.lastPinchDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      this.lastPinchCenterScreen = new Point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      this.safeReleasePointer(e.pointerId);
      return;
    } else if (this.activeTouchPoints.size === 1) {
      const remainingId = Array.from(this.activeTouchPoints.keys())[0]!;
      const remainingPt = this.activeTouchPoints.get(remainingId)!;
      this.lastPointerScreen = remainingPt;
      this.lastPointerScene = this.screenToScene(remainingPt);
      this.dragStartScreen = remainingPt;
      this.dragStartScene = this.lastPointerScene;
      this.primaryTouchIds = null;
      this.lastPinchCenterScreen = null;
      this.lastPinchDistance = 0;

      // Seamlessly continue single-finger panning for the remaining touch point
      this.isPanning = true;
      this.isTouchPanning = true;
      this.isPointerDown = true;
      this.velocityHistory = [];
      this.recordVelocity(remainingPt);
      this.safeReleasePointer(e.pointerId);
      return;
    } else if (this.activeTouchPoints.size === 0) {
      this.primaryTouchIds = null;
      this.lastPinchCenterScreen = null;
      this.lastPinchDistance = 0;
    }

    if (this.isTouchPanning) {
      const wasPanning = this.isPanning;
      const targetEl = this.pendingTouchTarget || (e.target as HTMLElement | null);
      const hadPinch = this.wasPinching;
      this.isTouchPanning = false;
      this.isPanning = false;
      this.isPointerDown = false;
      this.isDragging = false;
      this.pendingTouchTarget = null;
      this.wasPinching = false;
      this.safeReleasePointer(e.pointerId);
      this.updateCursor();

      const dragDist = Math.hypot(
        screenPt.x - this.dragStartScreen.x,
        screenPt.y - this.dragStartScreen.y
      );

      if (hadPinch) {
        // Multi-touch pinch/pan gesture just finished: do NOT trigger tap-to-type or element focus!
        const { vx, vy } = this.calculateReleaseVelocity();
        if (Math.hypot(vx, vy) > 0.25) {
          this.startMomentum(vx, vy);
        }
      } else if (wasPanning && dragDist > SpatialInteractionController.TOUCH_PAN_SLOP) {
        const { vx, vy } = this.calculateReleaseVelocity();
        this.startMomentum(vx, vy);
      } else {
        // Stationary tap with single finger: focus element for typing / editing or tap-to-type
        const editableHost = targetEl?.closest<HTMLElement>(
          '.onenote-container-body, .onenote-title-input, .onenote-sticky-title-input, input, textarea, [contenteditable="true"]'
        );
        if (editableHost) {
          editableHost.focus();
          if (editableHost.isContentEditable) {
            const sel = window.getSelection();
            if (sel) {
              const range = document.createRange();
              if (targetEl && targetEl !== editableHost && editableHost.contains(targetEl)) {
                range.selectNodeContents(targetEl);
              } else {
                range.selectNodeContents(editableHost);
              }
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        } else if (targetEl && typeof (targetEl as any).focus === "function") {
          (targetEl as any).focus();
        } else {
          const hitNode = this.spatialIndex.hitTest(scenePt);
          if (
            !hitNode &&
            this.currentScene &&
            dragDist < CANVAS_INTERACTION_METRICS.CLICK_TO_TYPE_THRESHOLD
          ) {
            this.handleBlankCanvasTap(scenePt, targetEl);
          }
        }
      }
      this.velocityHistory = [];
      return;
    }

    if (this.isPanning) {
      this.isPanning = false;
      this.isPointerDown = false;
      this.isDragging = false;
      this.isMoving = false;
      this.safeReleasePointer(e.pointerId);
      this.updateCursor();
      this.velocityHistory = [];
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
        const cmd = new InsertElementCommand(this.currentScene, newNode, () =>
          this.notifySceneMutated()
        );
        this.history.execute(cmd);
      }
    }

    // Finish Shape Drawing
    if (this.isDrawingShape) {
      this.isDrawingShape = false;
      if (this.synchronizer) {
        this.synchronizer.clearShapePreview();
      }
      const opts = this.ink.getOptions();
      const dist = Math.hypot(
        scenePt.x - this.shapeStartScene.x,
        scenePt.y - this.shapeStartScene.y
      );
      if (dist >= CANVAS_INTERACTION_METRICS.SHAPE_MIN_DRAG_DISTANCE && this.currentScene) {
        const shapeNode = this.ink.createShapeNode(
          opts.shapeKind,
          this.shapeStartScene,
          scenePt,
          opts.color,
          opts.strokeWidth,
          opts.fillColor
        );
        const cmd = new InsertElementCommand(this.currentScene, shapeNode, () =>
          this.notifySceneMutated()
        );
        this.history.execute(cmd);
        this.selectNodes([shapeNode]);
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

      for (const n of selNodes) {
        const pixiObj = this.synchronizer?.getDisplayObject(n.id);
        if (pixiObj) {
          pixiObj.position.x = 0;
          pixiObj.position.y = 0;
        }
      }

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

    // Click-to-Type anywhere on blank canvas
    if (
      !this.isDragging &&
      !this.isMoving &&
      !this.isResizing &&
      !this.isPanning &&
      !this.isDrawingInk &&
      !this.isDrawingShape &&
      !this.wasPinching &&
      this.tool === "select"
    ) {
      const dist = Math.hypot(
        screenPt.x - this.dragStartScreen.x,
        screenPt.y - this.dragStartScreen.y
      );
      const hitNode = this.spatialIndex.hitTest(scenePt);

      if (
        dist < CANVAS_INTERACTION_METRICS.CLICK_TO_TYPE_THRESHOLD &&
        !hitNode &&
        this.currentScene
      ) {
        this.handleBlankCanvasTap(scenePt, e.target as HTMLElement | null);
      }
    }

    this.activeTouchPoints.delete(e.pointerId);
    if (this.activeTouchPoints.size < 2) {
      this.lastPinchDistance = 0;
      this.lastPinchCenterScreen = null;
      this.primaryTouchIds = null;
    }
    if (this.activeTouchPoints.size === 0) {
      this.wasPinching = false;
    }

    this.isPointerDown = false;
    this.isDragging = false;
    this.isMoving = false;
    this.isPanning = false;
    this.isTouchPanning = false;
    this.pendingTouchTarget = null;
    this.velocityHistory = [];
    this.safeReleasePointer(e.pointerId);
    this.updateCursor();
  };

  private handlePointerCancel = (e: PointerEvent): void => {
    this.activeTouchPoints.delete(e.pointerId);
    if (this.activeTouchPoints.size === 0) {
      this.primaryTouchIds = null;
      this.lastPinchCenterScreen = null;
      this.lastPinchDistance = 0;
      this.isPointerDown = false;
      this.isDragging = false;
      this.isMoving = false;
      this.isPanning = false;
      this.isTouchPanning = false;
      this.pendingTouchTarget = null;
      this.wasPinching = false;
      this.stopMomentum();
    }
    this.handlePointerUp(e);
  };

  private handleLostPointerCapture = (e: PointerEvent): void => {
    if (e.pointerType === "touch") {
      // Touch pointers frequently lose capture during multi-touch or element boundary crossings.
      // Do NOT delete touch points on lostpointercapture; only pointerup and pointercancel signal touch end.
      return;
    }
    this.activeTouchPoints.delete(e.pointerId);
    if (this.activeTouchPoints.size === 0) {
      this.isPointerDown = false;
      this.isDragging = false;
      this.isMoving = false;
      this.isResizing = false;
      this.isPanning = false;
      this.isTouchPanning = false;
      this.pendingTouchTarget = null;
      this.primaryTouchIds = null;
      this.lastPinchCenterScreen = null;
      this.lastPinchDistance = 0;
      this.wasPinching = false;
      this.stopMomentum();
    }
  };

  private handleBlankCanvasTap(scenePt: Point2D, targetEl: HTMLElement | null): void {
    if (!this.currentScene) return;
    if (
      targetEl?.closest(".onenote-floating-toolbar") ||
      targetEl?.closest(".onenote-page-title-block") ||
      targetEl?.closest(".onenote-note-container") ||
      targetEl?.closest(".onenote-sticky-note") ||
      targetEl?.closest(".onenote-image-container") ||
      targetEl?.closest(".onenote-table-container") ||
      targetEl?.closest(".onenote-attachment-container") ||
      targetEl?.closest(".onenote-group-container") ||
      targetEl?.closest(".onenote-canvas-context-menu") ||
      targetEl?.closest(".onenote-ribbon-root")
    ) {
      return;
    }

    const width = CANVAS_INSERTION_DEFAULTS.TEXT_BOX_WIDTH;
    const height = CANVAS_INSERTION_DEFAULTS.TEXT_BOX_HEIGHT;

    const newOutline: CanonicalOutline = {
      type: "outline",
      id: IdGenerator.objectId("outline"),
      bounds: {
        x: Math.round(scenePt.x),
        y: Math.round(scenePt.y),
        width,
        height,
        zIndex: (this.currentScene.nodes.length + 1) * 10,
      },
      paragraphs: [
        {
          id: IdGenerator.objectId("p"),
          indentLevel: 0,
          runs: [{ text: "" }],
        },
      ],
    };
    const newNode: SceneOutlineNode = {
      id: newOutline.id,
      layer: "text",
      bounds: newOutline.bounds,
      aabb: Rectangle.create(newOutline.bounds.x, newOutline.bounds.y, width, height),
      zIndex: newOutline.bounds.zIndex,
      visible: true,
      element: newOutline,
      renderedHtml: "<p><br></p>",
    };
    const cmd = new InsertElementCommand(this.currentScene, newNode, () =>
      this.notifySceneMutated()
    );
    this.history.execute(cmd);
    this.selectNodes([newNode]);

    setTimeout(() => {
      const domEl = document.getElementById(`dom-outline-${newNode.id}`);
      const bodyEl = domEl?.querySelector(".onenote-container-body") as HTMLElement;
      if (bodyEl) {
        bodyEl.focus();
      }
    }, CANVAS_INTERACTION_METRICS.FOCUS_INPUT_DELAY_MS);
  }

  private handlePointerLeave = (_e: PointerEvent): void => {
    if (!this.isPointerDown && this.activeTouchPoints.size === 0) {
      if (this.hoveredNodeId !== null) {
        this.hoveredNodeId = null;
        if (this.callbacks.onHoverChange) {
          this.callbacks.onHoverChange(null);
        }
      }
    }
  };

  private eraseInkAt(scenePt: Point2D): void {
    if (!this.currentScene) return;
    const inkNodes = this.currentScene.nodes.filter((n) => n.element.type === "ink");
    const { modifiedNodes, deletedNodeIds } = this.ink.eraseAt(scenePt, inkNodes);

    if (deletedNodeIds.length > 0) {
      const cmd = new DeleteNodesCommand(this.currentScene, deletedNodeIds, () =>
        this.notifySceneMutated()
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

  private snapToRulerIfActive(pt: Point2D): Point2D {
    if (!this.synchronizer || !this.synchronizer.isRulerActive()) return pt;
    const rInfo = this.synchronizer.getRulerInfo();
    if (!rInfo.visible) return pt;

    const rad = (rInfo.angle * Math.PI) / 180;
    const dirX = Math.cos(rad);
    const dirY = Math.sin(rad);

    const normX = -dirY;
    const normY = dirX;

    const dx = pt.x - rInfo.x;
    const dy = pt.y - rInfo.y;

    const distFromCenterLine = dx * normX + dy * normY;
    const halfH = DIGITAL_RULER_METRICS.HEIGHT / 2;
    const distToTopEdge = Math.abs(distFromCenterLine - halfH);
    const distToBottomEdge = Math.abs(distFromCenterLine + halfH);

    const snapThreshold = DIGITAL_RULER_METRICS.SNAP_THRESHOLD;
    if (distToTopEdge < snapThreshold) {
      const along = dx * dirX + dy * dirY;
      return new Point(
        rInfo.x + along * dirX + halfH * normX,
        rInfo.y + along * dirY + halfH * normY
      );
    } else if (distToBottomEdge < snapThreshold) {
      const along = dx * dirX + dy * dirY;
      return new Point(
        rInfo.x + along * dirX - halfH * normX,
        rInfo.y + along * dirY - halfH * normY
      );
    }

    return pt;
  }

  private updateCursor(): void {
    switch (this.tool) {
      case "pan":
        this.hostElement.style.cursor = CANVAS_CURSORS.pan;
        break;
      case "pen":
        this.hostElement.style.cursor = CANVAS_CURSORS.pen;
        break;
      case "pencil":
        this.hostElement.style.cursor = CANVAS_CURSORS.pencil;
        break;
      case "highlighter":
        this.hostElement.style.cursor = CANVAS_CURSORS.highlighter;
        break;
      case "shape":
        this.hostElement.style.cursor = CANVAS_CURSORS.shape;
        break;
      case "eraser":
        this.hostElement.style.cursor = CANVAS_CURSORS.eraser;
        break;
      case "lasso":
        this.hostElement.style.cursor = CANVAS_CURSORS.lasso;
        break;
      case "ruler":
        this.hostElement.style.cursor = CANVAS_CURSORS.ruler;
        break;
      default:
        this.hostElement.style.cursor = CANVAS_CURSORS.default;
    }
  }

  private safeCapturePointer(pointerId: number, pointerType?: string): void {
    if (pointerType === "touch") return;
    try {
      if (typeof this.hostElement.setPointerCapture === "function") {
        this.hostElement.setPointerCapture(pointerId);
      }
    } catch {
      // Ignored in test environment
    }
  }

  private safeReleasePointer(pointerId: number): void {
    try {
      if (
        typeof this.hostElement.hasPointerCapture === "function" &&
        this.hostElement.hasPointerCapture(pointerId)
      ) {
        this.hostElement.releasePointerCapture(pointerId);
      } else if (typeof this.hostElement.releasePointerCapture === "function") {
        this.hostElement.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignored in test environment
    }
  }
}
