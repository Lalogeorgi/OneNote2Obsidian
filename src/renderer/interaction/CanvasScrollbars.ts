import { PixiRenderer } from "../pixi/PixiRenderer";
import { ViewportTransform } from "../../geometry/Transform";

export interface CanvasScrollbarsOptions {
  container: HTMLElement;
  renderer: PixiRenderer;
  cornerSize?: number;
  minThumbSize?: number;
}

/**
 * Expandable Canvas Scrollbars (Vertical & Horizontal).
 *
 * Provides smooth, draggable scroll navigation along the right and bottom
 * edges of the OneNote canvas view. Automatically expands from a thin 6px pill
 * to a 13px grabbable bar on hover or drag.
 */
export class CanvasScrollbars {
  private readonly container: HTMLElement;
  private readonly renderer: PixiRenderer;
  private readonly cornerSize: number;
  private readonly minThumbSize: number;

  private vTrackEl: HTMLElement;
  private vThumbEl: HTMLElement;
  private hTrackEl: HTMLElement;
  private hThumbEl: HTMLElement;
  private cornerEl: HTMLElement;

  private isDraggingV = false;
  private isDraggingH = false;
  private dragStartY = 0;
  private dragStartX = 0;
  private dragStartFractionY = 0;
  private dragStartFractionX = 0;

  // Cached geometry
  private worldMinX = 0;
  private worldWidth = 1000;
  private vpSceneWidth = 1000;

  private worldMinY = 0;
  private worldHeight = 1000;
  private vpSceneHeight = 1000;

  private vTrackLength = 0;
  private vThumbLength = 0;
  private hTrackLength = 0;
  private hThumbLength = 0;

  private boundOnWindowPointerMove: (e: PointerEvent) => void;
  private boundOnWindowPointerUp: (e: PointerEvent) => void;

  constructor(options: CanvasScrollbarsOptions) {
    this.container = options.container;
    this.renderer = options.renderer;
    this.cornerSize = options.cornerSize ?? 14;
    this.minThumbSize = options.minThumbSize ?? 36;

    this.boundOnWindowPointerMove = this.onWindowPointerMove.bind(this);
    this.boundOnWindowPointerUp = this.onWindowPointerUp.bind(this);

    // Build DOM elements
    this.vTrackEl = document.createElement("div");
    this.vTrackEl.className = "onenote-canvas-scrollbar onenote-canvas-scrollbar-vertical";
    this.vTrackEl.setAttribute("role", "scrollbar");
    this.vTrackEl.setAttribute("aria-orientation", "vertical");

    this.vThumbEl = document.createElement("div");
    this.vThumbEl.className = "onenote-canvas-scrollbar-thumb";
    this.vTrackEl.appendChild(this.vThumbEl);

    this.hTrackEl = document.createElement("div");
    this.hTrackEl.className = "onenote-canvas-scrollbar-horizontal";
    this.hTrackEl.setAttribute("role", "scrollbar");
    this.hTrackEl.setAttribute("aria-orientation", "horizontal");

    this.hThumbEl = document.createElement("div");
    this.hThumbEl.className = "onenote-canvas-scrollbar-thumb";
    this.hTrackEl.appendChild(this.hThumbEl);

    this.cornerEl = document.createElement("div");
    this.cornerEl.className = "onenote-canvas-scrollbar-corner";

    this.container.appendChild(this.vTrackEl);
    this.container.appendChild(this.hTrackEl);
    this.container.appendChild(this.cornerEl);

    this.bindEvents();
    this.update();
  }

  public destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("pointermove", this.boundOnWindowPointerMove);
      window.removeEventListener("pointerup", this.boundOnWindowPointerUp);
      window.removeEventListener("pointercancel", this.boundOnWindowPointerUp);
    }
    this.vTrackEl.remove();
    this.hTrackEl.remove();
    this.cornerEl.remove();
  }

  private bindEvents(): void {
    // Vertical track & thumb events
    this.vThumbEl.addEventListener("pointerdown", (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      this.isDraggingV = true;
      this.dragStartY = e.clientY;
      const vAvailableTravel = Math.max(0, this.vTrackLength - this.vThumbLength);
      const curOffset = this.getCurrentThumbOffsetY();
      this.dragStartFractionY = vAvailableTravel > 0 ? curOffset / vAvailableTravel : 0;
      this.vTrackEl.classList.add("is-dragging");
    });

    this.vTrackEl.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.target === this.vThumbEl) return;
      e.stopPropagation();
      e.preventDefault();
      const rect = this.vTrackEl.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const vAvailableTravel = Math.max(0, this.vTrackLength - this.vThumbLength);
      if (vAvailableTravel > 0) {
        const fraction = Math.max(
          0,
          Math.min(1, (clickY - this.vThumbLength / 2) / vAvailableTravel)
        );
        this.scrollToFractionY(fraction);
      }
    });

    // Horizontal track & thumb events
    this.hThumbEl.addEventListener("pointerdown", (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      this.isDraggingH = true;
      this.dragStartX = e.clientX;
      const hAvailableTravel = Math.max(0, this.hTrackLength - this.hThumbLength);
      const curOffset = this.getCurrentThumbOffsetX();
      this.dragStartFractionX = hAvailableTravel > 0 ? curOffset / hAvailableTravel : 0;
      this.hTrackEl.classList.add("is-dragging");
    });

    this.hTrackEl.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.target === this.hThumbEl) return;
      e.stopPropagation();
      e.preventDefault();
      const rect = this.hTrackEl.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const hAvailableTravel = Math.max(0, this.hTrackLength - this.hThumbLength);
      if (hAvailableTravel > 0) {
        const fraction = Math.max(
          0,
          Math.min(1, (clickX - this.hThumbLength / 2) / hAvailableTravel)
        );
        this.scrollToFractionX(fraction);
      }
    });

    if (typeof window !== "undefined") {
      window.addEventListener("pointermove", this.boundOnWindowPointerMove, { passive: false });
      window.addEventListener("pointerup", this.boundOnWindowPointerUp);
      window.addEventListener("pointercancel", this.boundOnWindowPointerUp);
    }
  }

  private onWindowPointerMove(e: PointerEvent): void {
    if (this.isDraggingV) {
      e.preventDefault();
      const dy = e.clientY - this.dragStartY;
      const vAvailableTravel = Math.max(0, this.vTrackLength - this.vThumbLength);
      if (vAvailableTravel > 0) {
        const deltaFraction = dy / vAvailableTravel;
        const newFraction = Math.max(0, Math.min(1, this.dragStartFractionY + deltaFraction));
        this.scrollToFractionY(newFraction);
      }
    } else if (this.isDraggingH) {
      e.preventDefault();
      const dx = e.clientX - this.dragStartX;
      const hAvailableTravel = Math.max(0, this.hTrackLength - this.hThumbLength);
      if (hAvailableTravel > 0) {
        const deltaFraction = dx / hAvailableTravel;
        const newFraction = Math.max(0, Math.min(1, this.dragStartFractionX + deltaFraction));
        this.scrollToFractionX(newFraction);
      }
    }
  }

  private onWindowPointerUp(): void {
    if (this.isDraggingV) {
      this.isDraggingV = false;
      this.vTrackEl.classList.remove("is-dragging");
    }
    if (this.isDraggingH) {
      this.isDraggingH = false;
      this.hTrackEl.classList.remove("is-dragging");
    }
  }

  private scrollToFractionY(fraction: number): void {
    const transform = this.renderer.getTransform();
    const vScrollableDist = Math.max(0, this.worldHeight - this.vpSceneHeight);
    const newVpTop = Math.max(0, this.worldMinY + fraction * vScrollableDist);
    const newY = Math.min(0, -newVpTop * transform.scale);
    this.renderer.setViewport({ ...transform, y: newY });
  }

  private scrollToFractionX(fraction: number): void {
    const transform = this.renderer.getTransform();
    const hScrollableDist = Math.max(0, this.worldWidth - this.vpSceneWidth);
    const newVpLeft = Math.max(0, this.worldMinX + fraction * hScrollableDist);
    const newX = Math.min(0, -newVpLeft * transform.scale);
    this.renderer.setViewport({ ...transform, x: newX });
  }

  private getCurrentThumbOffsetY(): number {
    const match = this.vThumbEl.style.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/);
    return match && match[1] ? parseFloat(match[1]) : 0;
  }

  private getCurrentThumbOffsetX(): number {
    const match = this.hThumbEl.style.transform.match(/translateX\((-?\d+(?:\.\d+)?)px\)/);
    return match && match[1] ? parseFloat(match[1]) : 0;
  }

  public update(currentTransform?: ViewportTransform): void {
    if (!this.container) return;

    const hostWidth = this.container.clientWidth;
    const hostHeight = this.container.clientHeight;
    if (hostWidth <= 0 || hostHeight <= 0) return;

    const transform = currentTransform || this.renderer.getTransform();
    const scale = transform.scale || 1.0;

    const scene = this.renderer.getActiveScene();
    let contentMinX = 0;
    let contentMinY = 0;
    let contentMaxX = 1200;
    let contentMaxY = 1600;

    if (scene) {
      if (scene.canvasBounds && scene.canvasBounds.width > 0) {
        contentMinX = scene.canvasBounds.x;
        contentMinY = scene.canvasBounds.y;
        contentMaxX = scene.canvasBounds.x + scene.canvasBounds.width;
        contentMaxY = scene.canvasBounds.y + scene.canvasBounds.height;
      }
      if (scene.nodes && scene.nodes.length > 0) {
        for (const node of scene.nodes) {
          if (node.bounds) {
            contentMinX = Math.min(contentMinX, node.bounds.x);
            contentMinY = Math.min(contentMinY, node.bounds.y);
            contentMaxX = Math.max(contentMaxX, node.bounds.x + node.bounds.width);
            contentMaxY = Math.max(contentMaxY, node.bounds.y + node.bounds.height);
          }
        }
      }
    }

    this.vpSceneWidth = hostWidth / scale;
    this.vpSceneHeight = hostHeight / scale;
    const vpSceneLeft = -transform.x / scale;
    const vpSceneTop = -transform.y / scale;
    const vpSceneRight = vpSceneLeft + this.vpSceneWidth;
    const vpSceneBottom = vpSceneTop + this.vpSceneHeight;

    // Authentic OneNote page canvas anchors at (0, 0); upper and left negative scrolling is prohibited
    this.worldMinX = 0;
    const worldMaxX = Math.max(1200, contentMaxX + 400, vpSceneRight + 100);
    this.worldWidth = Math.max(100, worldMaxX - this.worldMinX);

    this.worldMinY = 0;
    const worldMaxY = Math.max(1600, contentMaxY + 400, vpSceneBottom + 100);
    this.worldHeight = Math.max(100, worldMaxY - this.worldMinY);

    // Vertical track & thumb
    this.vTrackLength = Math.max(10, hostHeight - this.cornerSize);
    const vRatio = this.vpSceneHeight / this.worldHeight;
    this.vThumbLength = Math.min(
      this.vTrackLength,
      Math.max(this.minThumbSize, vRatio * this.vTrackLength)
    );
    const vAvailableTravel = Math.max(0, this.vTrackLength - this.vThumbLength);
    const vScrollableDist = Math.max(1, this.worldHeight - this.vpSceneHeight);
    const fractionY = Math.max(0, Math.min(1, (vpSceneTop - this.worldMinY) / vScrollableDist));
    const thumbOffsetY = fractionY * vAvailableTravel;

    this.vThumbEl.style.height = `${Math.round(this.vThumbLength)}px`;
    this.vThumbEl.style.transform = `translateY(${Math.round(thumbOffsetY)}px)`;

    // Horizontal track & thumb
    this.hTrackLength = Math.max(10, hostWidth - this.cornerSize);
    const hRatio = this.vpSceneWidth / this.worldWidth;
    this.hThumbLength = Math.min(
      this.hTrackLength,
      Math.max(this.minThumbSize, hRatio * this.hTrackLength)
    );
    const hAvailableTravel = Math.max(0, this.hTrackLength - this.hThumbLength);
    const hScrollableDist = Math.max(1, this.worldWidth - this.vpSceneWidth);
    const fractionX = Math.max(0, Math.min(1, (vpSceneLeft - this.worldMinX) / hScrollableDist));
    const thumbOffsetX = fractionX * hAvailableTravel;

    this.hThumbEl.style.width = `${Math.round(this.hThumbLength)}px`;
    this.hThumbEl.style.transform = `translateX(${Math.round(thumbOffsetX)}px)`;
  }
}
