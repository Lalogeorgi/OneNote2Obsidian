# PixiJS v8 Spatial Rendering Engine Specification

**Author:** Senior Graphics & Spatial Engine Architect  
**Engine:** PixiJS v8 (`pixi.js` 8.x)  
**Target:** Obsidian Spatial ItemView Canvas

---

## 1. High-Level Graphics Pipeline Overview

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                      CANONICAL MODEL -> RENDERER PIPELINE                   │
 └─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                         [ PageScene Intermediate IR ]
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            ▼                                                     ▼
 [ Spatial 2D R-Tree (RBush) ]                         [ Display Node Hierarchy ]
            │                                                     │
            │ (Frustum Query: [left, top, right, bottom])         │
            ▼                                                     ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                       PIXIJS v8 RENDERING ENGINE                           │
 │                                                                             │
 │   [ Root Viewport Container ] (Position: (tx, ty), Scale: (s, s))           │
 │       │                                                                     │
 │       ├── [ Background Layer ]   ──► Custom Quad Shader (Rule/Grid Lines)   │
 │       ├── [ Bottom Ink Layer ]   ──► Multiply Blend Mesh (Highlighters)     │
 │       ├── [ Bitmap / PDF Layer ] ──► Batched Sprites (LRU GPU Textures)     │
 │       ├── [ Shapes & Tables ]    ──► Tessellated Graphics & Borders         │
 │       ├── [ Static Text Layer ]  ──► Fast Rasterized Text / HTMLText        │
 │       ├── [ Top Ink Layer ]      ──► Variable-Width Pen Stroke Mesh         │
 │       └── [ Overlay UI Layer ]   ──► Marquee Box & Transformation Handles   │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │ (Sync Matrix Transform)
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                 SYNCHRONIZED DOM INTERACTIVE OVERLAY                        │
 │                                                                             │
 │   CSS: transform: translate(tx, ty) scale(s); transform-origin: 0 0;        │
 │   - Absolute positioned editable text outlines                              │
 │   - Native OS cursor, drag-selection, IME input, spellcheck, link clicks    │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Renderer Interface & Decoupling (`IPageRenderer`)

To ensure that PixiJS never becomes the canonical source of truth, all spatial rendering operations are encapsulated behind an abstract interface:

```typescript
export interface ViewportTransform {
  x: number;          // Translation X (pixels)
  y: number;          // Translation Y (pixels)
  scale: number;      // Zoom Scale factor (e.g. 1.0 = 100%)
  rotation?: number;   // In radians (default 0)
}

export interface Point2D {
  x: number;
  y: number;
}

export interface BoundingBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface RendererOptions {
  backgroundColor?: string;
  devicePixelRatio?: number;
  preference?: 'webgl' | 'webgpu';
  enableDomOverlay?: boolean;
}

export interface IPageRenderer {
  /** Initialize canvas element and GPU context attached to host DOM node */
  initialize(hostElement: HTMLElement, options?: RendererOptions): Promise<void>;

  /** Set or update the active PageScene to be rendered */
  setScene(scene: PageScene): void;

  /** Update camera position and zoom scale */
  setViewport(transform: ViewportTransform): void;

  /** Trigger an immediate redraw (or mark dirty in requestAnimationFrame loop) */
  requestRender(): void;

  /** Coordinate conversion: Screen/DOM pixel coordinates to PageScene logical coordinates */
  screenToScene(screenPoint: Point2D): Point2D;

  /** Coordinate conversion: PageScene logical coordinates to Screen/DOM pixel coordinates */
  sceneToScreen(scenePoint: Point2D): Point2D;

  /** Perform spatial query to find top interactive element under pointer */
  hitTest(scenePoint: Point2D): SceneNode | null;

  /** Dispose all GPU textures, buffers, shaders, and event listeners */
  destroy(): void;
}
```

---

## 3. PixiJS v8 Application Initialization

PixiJS v8 uses an asynchronous `Application.init()` initialization lifecycle:

```typescript
import { Application, Container, Graphics, Sprite, Texture, Assets } from 'pixi.js';

export class PixiPageRenderer implements IPageRenderer {
  private app!: Application;
  private rootContainer!: Container;
  private backgroundLayer!: Container;
  private bottomInkLayer!: Container;
  private imageLayer!: Container;
  private shapeLayer!: Container;
  private textLayer!: Container;
  private topInkLayer!: Container;
  private uiLayer!: Container;

  private scene: PageScene | null = null;
  private transform: ViewportTransform = { x: 0, y: 0, scale: 1.0 };
  private hostElement!: HTMLElement;
  private domOverlayContainer!: HTMLElement;

  async initialize(hostElement: HTMLElement, options: RendererOptions = {}): Promise<void> {
    this.hostElement = hostElement;
    
    this.app = new Application();
    await this.app.init({
      preference: options.preference ?? 'webgl',
      autoDensity: true,
      resolution: options.devicePixelRatio ?? window.devicePixelRatio ?? 1,
      antialias: true,
      resizeTo: hostElement,
      backgroundAlpha: 0, // Allow background styling via CSS
    });

    // Mount canvas into host
    this.app.canvas.style.position = 'absolute';
    this.app.canvas.style.top = '0';
    this.app.canvas.style.left = '0';
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = '100%';
    this.app.canvas.style.zIndex = '1';
    hostElement.appendChild(this.app.canvas);

    // Initialize Viewport Scene Graph Hierarchy
    this.buildSceneGraph();

    // Initialize DOM Overlay Container
    if (options.enableDomOverlay !== false) {
      this.initDomOverlay();
    }
  }

  private buildSceneGraph(): void {
    this.rootContainer = new Container();
    this.rootContainer.eventMode = 'passive';

    this.backgroundLayer = new Container();
    this.bottomInkLayer = new Container();
    this.imageLayer = new Container();
    this.shapeLayer = new Container();
    this.textLayer = new Container();
    this.topInkLayer = new Container();
    this.uiLayer = new Container();

    this.rootContainer.addChild(
      this.backgroundLayer,
      this.bottomInkLayer,
      this.imageLayer,
      this.shapeLayer,
      this.textLayer,
      this.topInkLayer,
      this.uiLayer
    );

    this.app.stage.addChild(this.rootContainer);
  }
}
```

---

## 4. Background & Rule-Line Shader

OneNote pages frequently feature background paper styles: Plain, Narrow Rule, Standard College Rule, Wide Rule, Small Grid, and Large Grid. Generating thousands of individual line objects in the scene graph degrades draw performance. Instead, we use a single full-page quad rendered with a custom GLSL fragment shader:

```glsl
// background.frag
precision mediump float;

uniform vec2 u_resolution;
uniform vec2 u_offset;
uniform float u_zoom;
uniform vec4 u_bg_color;
uniform vec4 u_line_color;
uniform float u_line_spacing;
uniform float u_line_thickness;
uniform int u_style; // 0 = Plain, 1 = Horizontal Rule, 2 = Grid

void main() {
    vec2 worldCoord = (gl_FragCoord.xy - u_offset) / u_zoom;
    
    if (u_style == 0) {
        gl_FragColor = u_bg_color;
        return;
    }
    
    float lineDistY = mod(worldCoord.y, u_line_spacing);
    float isLineY = step(lineDistY, u_line_thickness);
    
    float isLineX = 0.0;
    if (u_style == 2) {
        float lineDistX = mod(worldCoord.x, u_line_spacing);
        isLineX = step(lineDistX, u_line_thickness);
    }
    
    float isLine = max(isLineY, isLineX);
    gl_FragColor = mix(u_bg_color, u_line_color, isLine);
}
```

---

## 5. Ink & Handwriting Vector Tessellation

OneNote ISF ink strokes contain ordered coordinate points with pressure: $P_i = (x_i, y_i, p_i)$.

### Catmull-Rom to Cubic Bézier Smoothing
Raw sampled points are smoothed into a continuous curve:
$$\mathbf{C}(t) = 0.5 \left( (2\mathbf{P}_1) + (-\mathbf{P}_0 + \mathbf{P}_2)t + (2\mathbf{P}_0 - 5\mathbf{P}_1 + 4\mathbf{P}_2 - \mathbf{P}_3)t^2 + (-\mathbf{P}_0 + 3\mathbf{P}_1 - 3\mathbf{P}_2 + \mathbf{P}_3)t^3 \right)$$

### GPU Triangle Strip Mesh Generation
For pressure-sensitive inking, each curve segment is tessellated into dynamic triangle strip vertices:

```typescript
export function tessellateStrokeToMesh(
  points: { x: number; y: number; pressure: number }[],
  baseWidth: number
): { vertices: Float32Array; indices: Uint16Array } {
  const numPoints = points.length;
  const vertices = new Float32Array(numPoints * 4); // 2 vertices per point (left/right normal)
  const indices = new Uint16Array((numPoints - 1) * 6); // 2 triangles per quad

  for (let i = 0; i < numPoints; i++) {
    const curr = points[i];
    const next = points[Math.min(i + 1, numPoints - 1)];
    const prev = points[Math.max(i - 1, 0)];

    // Tangent vector
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1.0;
    dx /= len;
    dy /= len;

    // Perpendicular normal vector
    const nx = -dy;
    const ny = dx;

    // Dynamic width based on square-root pressure response curve
    const radius = (baseWidth * Math.sqrt(curr.pressure || 0.5)) / 2;

    const vIdx = i * 4;
    // Left vertex
    vertices[vIdx] = curr.x + nx * radius;
    vertices[vIdx + 1] = curr.y + ny * radius;
    // Right vertex
    vertices[vIdx + 2] = curr.x - nx * radius;
    vertices[vIdx + 3] = curr.y - ny * radius;

    // Generate indices
    if (i < numPoints - 1) {
      const iIdx = i * 6;
      const base = i * 2;
      indices[iIdx] = base;
      indices[iIdx + 1] = base + 1;
      indices[iIdx + 2] = base + 2;
      indices[iIdx + 3] = base + 1;
      indices[iIdx + 4] = base + 3;
      indices[iIdx + 5] = base + 2;
    }
  }

  return { vertices, indices };
}
```

---

## 6. Synchronized DOM Overlay Implementation

To enable native Obsidian selection, copy/paste, link navigation, and markdown editing while maintaining GPU performance:

```typescript
export class DomOverlayManager {
  private overlayElement: HTMLElement;

  constructor(hostElement: HTMLElement) {
    this.overlayElement = document.createElement('div');
    this.overlayElement.className = 'onenote-dom-overlay';
    this.overlayElement.style.position = 'absolute';
    this.overlayElement.style.top = '0';
    this.overlayElement.style.left = '0';
    this.overlayElement.style.width = '100%';
    this.overlayElement.style.height = '100%';
    this.overlayElement.style.transformOrigin = '0 0';
    this.overlayElement.style.pointerEvents = 'none'; // Child text containers re-enable pointer-events
    this.overlayElement.style.zIndex = '2';
    this.overlayElement.style.overflow = 'hidden';
    hostElement.appendChild(this.overlayElement);
  }

  public updateTransform(transform: ViewportTransform): void {
    // Synchronize CSS transform matrix with Pixi viewport transform
    const { x, y, scale } = transform;
    this.overlayElement.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  }

  public mountOutline(outlineNode: PageSceneOutlineNode): void {
    const el = document.createElement('div');
    el.className = 'onenote-outline-container';
    el.style.position = 'absolute';
    el.style.left = `${outlineNode.bounds.minX}px`;
    el.style.top = `${outlineNode.bounds.minY}px`;
    el.style.width = `${outlineNode.bounds.maxX - outlineNode.bounds.minX}px`;
    el.style.pointerEvents = 'auto';
    el.innerHTML = outlineNode.renderedHtml;
    this.overlayElement.appendChild(el);
  }
}
```

---

## 7. Viewport Camera Mathematics

```typescript
export class ViewportController {
  private transform: ViewportTransform = { x: 0, y: 0, scale: 1.0 };
  private minScale = 0.05;
  private maxScale = 10.0;

  public pan(deltaX: number, deltaY: number): void {
    this.transform.x += deltaX;
    this.transform.y += deltaY;
  }

  public zoomAtPoint(zoomFactor: number, screenPoint: Point2D): void {
    const oldScale = this.transform.scale;
    const newScale = Math.min(this.maxScale, Math.max(this.minScale, oldScale * zoomFactor));
    if (newScale === oldScale) return;

    // Zoom anchored at pointer location
    this.transform.x = screenPoint.x - (screenPoint.x - this.transform.x) * (newScale / oldScale);
    this.transform.y = screenPoint.y - (screenPoint.y - this.transform.y) * (newScale / oldScale);
    this.transform.scale = newScale;
  }

  public screenToScene(p: Point2D): Point2D {
    return {
      x: (p.x - this.transform.x) / this.transform.scale,
      y: (p.y - this.transform.y) / this.transform.scale,
    };
  }

  public sceneToScreen(p: Point2D): Point2D {
    return {
      x: p.x * this.transform.scale + this.transform.x,
      y: p.y * this.transform.scale + this.transform.y,
    };
  }
}
```
