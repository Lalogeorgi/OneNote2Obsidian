# ARCHITECTURE DECISION RECORD (ADR-001)
## OneNote to Obsidian Spatial Engine & Ingestion Architecture

**Status:** APPROVED / IN-AUDIT  
**Date:** 2026-08-21  
**Authors:** Senior Graphics Engineer, Binary Formats & TypeScript/Rust Architect  
**Target Platform:** Obsidian Plugin (Desktop First: macOS, Windows, Linux; Mobile Capable via Web Standards)

> [!NOTE]
> **Architecture Evolution Notice**:  
> *Initial architectural exploration (2026-08-21) evaluated a Rust/WASM monorepo architecture (`OneNotesToObsidian`). During subsequent implementation, a 100% clean-room pure-TypeScript architecture was successfully built (`OneNote2Obsidian`), eliminating WASM complexity, build toolchain overhead, and platform-specific compilation hurdles while achieving full 60 FPS performance and binary parsing parity. This historical design document is preserved for architectural provenance.*

---

### Table of Contents
1. [Executive Summary & Core Mandate](#1-executive-summary--core-mandate)
2. [Section A: OneNote Ingestion Architecture](#section-a-onenote-ingestion-architecture)
3. [Section B: Parser Integration Strategy](#section-b-parser-integration-strategy)
4. [Section C: Rust / WASM Boundary & Memory Architecture](#section-c-rust--wasm-boundary--memory-architecture)
5. [Section D: `.onepkg` / CAB Container Extraction](#section-d-onepkg--cab-container-extraction)
6. [Section E: Canonical OneNote Document Model](#section-e-canonical-onenote-document-model)
7. [Section F: PageScene Intermediate Representation](#section-f-pagescene-intermediate-representation)
8. [Section G: PixiJS v8 Rendering Engine Architecture](#section-g-pixijs-v8-rendering-engine-architecture)
9. [Section H: PixiJS Scene Graph & Display List Structure](#section-h-pixijs-scene-graph--display-list-structure)
10. [Section I: Spatial Indexing & Hit-Testing (R-Tree / BVH)](#section-i-spatial-indexing--hit-testing-r-tree--bvh)
11. [Section J: Texture & Image Lifecycle Management](#section-j-texture--image-lifecycle-management)
12. [Section K: Ink, Vector Strokes & ISF Rendering](#section-k-ink-vector-strokes--isf-rendering)
13. [Section L: Text Layout, Typography & Synchronized DOM Overlays](#section-l-text-layout-typography--synchronized-dom-overlays)
14. [Section M: Viewport, Pan & Zoom Architecture](#section-m-viewport-pan--zoom-architecture)
15. [Section N: Large-Page Performance & Culling Strategy](#section-n-large-page-performance--culling-strategy)
16. [Section O: WebGL2 & WebGPU Acceleration Strategy](#section-o-webgl2--webgpu-acceleration-strategy)
17. [Section P: Markdown Semantic Projection & Search Integration](#section-p-markdown-semantic-projection--search-integration)
18. [Section Q: `.onecanvas.json` Document Specification](#section-q-onecanvasjson-document-specification)
19. [Section R: JSON Canvas Interoperability Bridge](#section-r-json-canvas-interoperability-bridge)
20. [Section S: Obsidian Plugin Architecture & ItemView Lifecycle](#section-s-obsidian-plugin-architecture--itemview-lifecycle)
21. [Section T: Security & Sandboxing Architecture](#section-t-security--sandboxing-architecture)
22. [Section U: Licensing, Provenance & Clean-Room Boundaries](#section-u-licensing-provenance--clean-room-boundaries)
23. [Section V: Comprehensive Testing Strategy](#section-v-comprehensive-testing-strategy)
24. [Section W: MS-ONE / MS-ONESTORE Compatibility Matrix](#section-w-ms-one--ms-onestore-compatibility-matrix)
25. [Section X: Major Technical Risks & Mitigation Matrix](#section-x-major-technical-risks--mitigation-matrix)

---

### 1. Executive Summary & Core Mandate

Microsoft OneNote is fundamentally a **2.5D infinite-canvas spatial document editor**, not a linear markdown document. A single OneNote page contains independently positioned text outlines, pasted bitmaps, multi-page PDF printouts, pressure-sensitive handwriting/ink, geometric shapes, data tables, file attachments, and overlapping layers.

Converting a OneNote notebook into flat Markdown destroys its spatial semantics, collapses critical handwriting-text relationships, and strips away freeform visual organization.

#### The Uncompromising Architectural Mandate
1. **PixiJS v8 is mandatory from Day 1** as the high-performance GPU-accelerated spatial rendering engine. No Canvas 2D MVP will be built.
2. **Strict Unidirectional Data Flow**:
   ```
   [OneNote Source (.one/.onepkg)]
                 │
                 ▼
     [Rust / WASM Parser Engine]
                 │
                 ▼
    [Canonical OneNote Model (Pure TS)]
                 │
                 ▼
     [PageScene Graph IR (Pure TS)]
                 │
        ┌────────┴──────────────────┐
        ▼                           ▼
   [Renderer Interface]      [Semantic Projection]
        │                           │
        ▼                           ▼
   [PixiJS v8 Engine]        [Obsidian Markdown / Index / Canvas]
   ```
3. **PixiJS is strictly downstream**: The rendering engine is a swappable consumer behind a strict `IPageRenderer` interface. PixiJS display objects are never the source of truth.
4. **Desktop-First Execution**: The plugin targets Obsidian Desktop (Electron/Node) for Phase 1 to guarantee high-performance CAB extraction, large-file memory headroom, and multi-threaded WASM workers, while preserving zero-dependency web standards for Phase 3 mobile support.

---

### Section A: OneNote Ingestion Architecture

OneNote files exist in three primary disk representations:
1. **`.one`**: Individual Section binary file (containing multiple pages, revisions, and embedded assets).
2. **`.onetoc2`**: Table of Contents file (stores section hierarchy, order, colors, and notebook metadata).
3. **`.onepkg`**: OneNote Package archive (a Microsoft Cabinet format container packaging `.onetoc2` and all `.one` section files).

```
   ┌─────────────────────────────────────────────────────────────┐
   │                     INGESTION PIPELINE                      │
   └─────────────────────────────────────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
        [ .onepkg Archive ]              [ .one / .onetoc2 ]
                 │                               │
                 ▼                               │
     [ CAB Container Extractor ]                 │
                 │ (In-memory / Temp-extract)    │
                 ▼                               │
        [ Virtual File System / VFS Map ]        │
                 │                               │
                 └───────────────┬───────────────┘
                                 │
                                 ▼
                 [ MS-ONESTORE Revision Parser ]
                                 │
                 [ MS-ONE Semantic Deserializer ]
                                 │
                                 ▼
                 [ Canonical Document Tree (TS) ]
```

#### Ingestion Workflow
1. **User Drag-and-Drop / Import Trigger**:
   - User drops `.one`, `.onetoc2`, or `.onepkg` into Obsidian Vault or selects an external file via the Import Modal.
2. **Format Recognition**:
   - Inspect first 16 bytes:
     - Cabinet file magic: `MSCF` (`0x4D 0x53 0x43 0x46`).
     - OneNote file header GUID: `{7B5C52E4-D88C-4DA7-AEB1-5378D02996D3}` (Section `.one`) or `{43FF2DF1-EF57-4C06-9733-9526D6108381}` (TOC `.onetoc2`).
3. **Memory Pipeline**:
   - Stream file buffer into WebAssembly linear memory via chunked allocation to avoid V8 heap fragmentation.
4. **Batch Extraction**:
   - Notebooks are ingested into a unified `NotebookArchive` structure, maintaining Section Groups, Sections, Pages, and Sub-pages.

---

### Section B: Parser Integration Strategy

Parsing `[MS-ONESTORE]` (Revision Store format) and `[MS-ONE]` (OneNote semantic structures) requires handling 64-bit chunk transaction tables, CRC checks, compact IDs, property bags, and revision graph traversal.

#### Evaluation of Parser Alternatives
| Approach | Parser Candidate | Pros | Cons | Decision |
| :--- | :--- | :--- | :--- | :--- |
| **Pure TypeScript Parser** | Custom TS rewrite | No WASM boundary; easy to debug in DevTools. | Extremely high development cost (6+ months); slower binary decompression and parsing on 500MB notebooks. | **Rejected** for core parsing. |
| **Direct GPL Crate Link** | `emsi/OneNoteViewer` (`onenote-core`) | Rich Linux viewer logic already written. | **License Contamination**: Licensed under GPL-3.0; forces entire Obsidian plugin to GPL-3.0. Monolithic GTK dependencies. | **Rejected** for direct reuse. |
| **Rust WASM Parser Engine** | `msiemens/onenote_parser` (MPL-2.0) wrapped in custom crate | Pure Rust, zero C-FFI, compiles to `wasm32-unknown-unknown`, clean MPL-2.0 license, proven correctness. | Requires high-speed serialization layer across WASM boundary. | **SELECTED ARCHITECTURE** |

#### Integration Pipeline
We build a dedicated Rust crate: `crates/onenote-wasm-bridge`.
- **Core Dependency**: `onenote_parser = { git = "https://github.com/msiemens/onenote.rs" }` (MPL-2.0).
- **Compilation Target**: `wasm32-unknown-unknown` built via `wasm-pack` with `wasm-opt -O4`.
- **Packaging**: Embedded as a base64-encoded WebAssembly module inside `main.js` for zero-install friction, or loaded asynchronously via `WebAssembly.instantiateStreaming`.

---

### Section C: Rust / WASM Boundary & Memory Architecture

Bridging multi-megabyte OneNote documents between WebAssembly and the JavaScript V8 engine requires minimizing serialization overhead, garbage collection pressure, and memory copies.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WASM LINEAR MEMORY                              │
│                                                                        │
│  [ Binary File Buffer ] ──► [ Parser Engine ] ──► [ AST Generation ]   │
│                                                          │             │
│                                                          ▼             │
│                                                [ Binary Chunk Slices ] │
└──────────────────────────────────────────────────────────┬─────────────┘
                                                           │ Zero-Copy Shared /
                                                           │ Compact Transfer
                                                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        V8 JAVASCRIPT HEAP                              │
│                                                                        │
│  [ Canonical Document TS ] ◄── [ Deserializer (rkyv / MsgPack / JSON) ] │
│            │                                                           │
│            ▼                                                           │
│  [ Image / Attachment Map: ArrayBuffer / Blob URL Cache ]             │
└────────────────────────────────────────────────────────────────────────┘
```

#### Memory Transfer Protocol
1. **Input Transfer (JS -> WASM)**:
   - Allocate buffer in WASM memory via exported `allocate_input_buffer(size: usize) -> *mut u8`.
   - `Uint8Array.set()` writes file bytes directly into WASM linear memory.
2. **Output Transfer (WASM -> JS)**:
   - **Document Structure**: Serialized via high-speed binary protocol (Compact MessagePack or `rkyv`/Bincode), decoded directly into TypeScript objects.
   - **Binary Blobs (Images, PDFs, Attachments)**: Extracted into a zero-copy pointer table:
     ```rust
     pub struct ExtractedAssetHeader {
         pub asset_id: u32,
         pub offset: u32,
         pub length: u32,
         pub mime_type: u8,
     }
     ```
   - TypeScript reads asset buffers via `new Uint8Array(wasmMemory.buffer, offset, length)` and creates `Blob` / `ImageBitmap` instances, bypassing JSON base64 string overhead.

---

### Section D: `.onepkg` / CAB Container Extraction

A `.onepkg` file is a standard Microsoft Cabinet archive (`MSCF`) containing `.onetoc2` and `.one` section files compressed with MSZIP (Deflate variant) or LZX.

#### Multi-Tier Extraction Strategy
1. **Tier 1 (WASM-Native Extractor - Universal)**:
   - Rust-based CAB decompressor utilizing `cab` crate with MSZIP and LZX decompressor support compiled directly into the WASM module.
   - Operates completely in-memory without touching the host filesystem, ensuring 100% compatibility with Obsidian sandbox and future mobile targets.
2. **Tier 2 (Desktop Accelerated Extractor - Electron/Node)**:
   - For giant archives (>500 MB), leverage streaming worker threads in Node.js to decompress entries directly to temporary Vault storage, preventing V8 memory bloat.

---

### Section E: Canonical OneNote Document Model

The Canonical Model is the immutable, technology-agnostic TypeScript representation of OneNote data. It preserves all semantic information, spatial coordinates, revision timelines, and binary references without any PixiJS or DOM coupling.

```typescript
// Core Canonical Schema Excerpt
export interface CanonicalNotebook {
  id: string;
  title: string;
  structure: NotebookStructureNode[];
  metadata: Record<string, unknown>;
}

export interface CanonicalSection {
  id: string;
  title: string;
  color?: string;
  pages: CanonicalPageSummary[];
}

export interface CanonicalPage {
  id: string;
  title: string;
  createdTime: number;
  lastModifiedTime: number;
  pageWidth?: number;
  pageHeight?: number;
  backgroundColor?: string;
  ruleLines?: PageRuleLines;
  elements: CanonicalElement[];
  revisions: PageRevisionHistory[];
}

export type CanonicalElement =
  | CanonicalOutline
  | CanonicalImage
  | CanonicalInkStrokeGroup
  | CanonicalTable
  | CanonicalMedia
  | CanonicalEmbeddedFile
  | CanonicalShape;

export interface SpatialBounds {
  x: number;      // 96 DPI logical points
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex: number;
}
```

---

### Section F: PageScene Intermediate Representation

`PageScene` is the spatial layout graph optimized for rendering, viewport clipping, selection hit-testing, and dynamic reflow. It translates raw OneNote properties (e.g., twips, half-points, indent distances, nested outline tags) into an absolute 2.5D rendering display list.

```
       [ Canonical Page Model ]
                  │
                  ▼
         [ Scene Layout Pass ]
    (Reflow Outlines, Resolve Font Sizes,
     Compute Table Grid Bounding Boxes,
     Tessellate Ink Curves, Order Z-Stack)
                  │
                  ▼
             [ PageScene ]
      ┌───────────┴───────────┐
      ▼                       ▼
 [ Display List (Z-Order) ] [ Spatial 2D R-Tree ]
```

#### PageScene Responsibilities
- Resolves relative indentations and text block heights.
- Normalizes OneNote's coordinate space (converting points/twips into 96 DPI CSS logical units).
- Flattens nested outline paragraphs into absolute spatial bounding boxes while retaining parent-child hierarchy.
- Pre-computes AABB (Axis-Aligned Bounding Boxes) for every visual primitive for instant $O(\log N)$ R-Tree spatial indexing.

---

### Section G: PixiJS v8 Rendering Engine Architecture

PixiJS v8 is introduced immediately as the primary rendering engine. It runs behind a strict interface to ensure modular decoupling.

```typescript
export interface IPageRenderer {
  initialize(hostElement: HTMLElement, options: RendererOptions): Promise<void>;
  setScene(scene: PageScene): void;
  updateViewport(transform: ViewportTransform): void;
  render(): void;
  destroy(): void;
  screenToScenePoint(x: number, y: number): Point2D;
  sceneToScreenPoint(x: number, y: number): Point2D;
}
```

#### PixiJS v8 Engine Configuration
- **Application Core**: `new Application()` initialized with `autoDensity: true`, `resolution: window.devicePixelRatio || 1`, `antialias: true`.
- **Renderer Selection**: Default to WebGL2 (`preference: 'webgl'`) with seamless automatic WebGPU fallback/upgrade based on Electron hardware acceleration.
- **Background Shader**: Custom high-performance quad shader rendering OneNote page background colors, horizontal college-rule lines, and grid graph lines without generating thousands of line graphics objects.

---

### Section H: PixiJS Scene Graph & Display List Structure

The PixiJS display hierarchy uses isolated, typed containers structured by semantic Z-layers to eliminate unnecessary draw calls and isolate matrix transformations:

```
[ Stage (pixi.stage) ]
   │
   └── [ Root Transform Viewport Container ] (Position: (tx, ty), Scale: (s, s))
          │
          ├── [ Layer 0: Page Background & Rule Lines (Custom Shader Mesh) ]
          │
          ├── [ Layer 1: Bottom Ink / Highlighters (BLEND_MODES.MULTIPLY) ]
          │
          ├── [ Layer 2: Bitmaps, Printouts & Background Images (Sprite Batch) ]
          │
          ├── [ Layer 3: Shapes, Connectors & Tables (Graphics / Containers) ]
          │
          ├── [ Layer 4: Text Outline Run Sprites / BitmapText ]
          │
          ├── [ Layer 5: Top Ink / Pen Annotations (Tessellated Mesh / Graphics) ]
          │
          ├── [ Layer 6: Selection Marquee, Bounding Box Handles (Interactive) ]
          │
          └── [ Layer 7: Cursor & Spatial Hover Cards ]
```

---

### Section I: Spatial Indexing & Hit-Testing (R-Tree / BVH)

Handling massive OneNote pages containing thousands of text paragraphs, strokes, and images requires sub-millisecond hit-testing and viewport frustum culling.

#### Spatial Index Implementation
- We integrate **Flatbush / RBush**, a lightning-fast 2D Spatial Index in JavaScript.
- Every `PageSceneNode` registers its bounding box `[minX, minY, maxX, maxY]` into the spatial index upon scene construction.
- **Hit-Testing**:
  - Pointer click at `(x, y)` performs an R-Tree query returning $O(k)$ overlapping nodes.
  - Nodes are evaluated from highest `zIndex` to lowest `zIndex` with pixel-level shape/stroke hit detection.
- **Marquee Selection**:
  - Dragging a selection box queries the R-Tree for all intersecting AABBs in $<1\text{ms}$.

---

### Section J: Texture & Image Lifecycle Management

OneNote pages frequently embed large uncompressed bitmaps and multi-page scanned PDF printouts that can exceed 1 GB of raw VRAM if loaded simultaneously.

#### Texture Pipeline & VRAM Budgeting
1. **LRU Texture Cache**:
   - Fixed VRAM ceiling (configurable: 256MB - 512MB).
2. **Worker-Based Decoding**:
   - Raw binary bytes are decoded via `createImageBitmap(blob)` inside a Web Worker to keep the 60fps main UI thread unblocked.
3. **Frustum-Driven Eviction**:
   - When an image leaves the viewport frustum plus an overdraw buffer (500px margin), its GPU texture is eligible for eviction.
   - When scrolling into view, textures are streamed in asynchronously with a subtle cross-fade placeholder.

---

### Section K: Ink, Vector Strokes & ISF Rendering

OneNote stores ink in Microsoft **Ink Serialized Format (ISF)**, encoding coordinates, pen tip attributes, pressure values, and matrix transforms.

#### Ink Processing Pipeline
1. **ISF Parsing**:
   - `onenote_parser` extracts stroke packet arrays $\left\{(x_i, y_i, p_i)\right\}$.
2. **Curve Smoothing**:
   - Raw stroke points are smoothed using Catmull-Rom spline interpolation to generate smooth cubic Bézier curves.
3. **Geometry Generation**:
   - **Ballpoint / Felt-Tip Pen**: Tessellated into triangle strips with variable width $W_i = \text{BaseWidth} \times \sqrt{p_i}$.
   - **Highlighter**: Flat ribbon mesh with fixed aspect ratio, alpha transparency, and `BLEND_MODES.MULTIPLY` compositing layer, placed beneath text runs.

---

### Section L: Text Layout, Typography & Synchronized DOM Overlays

Text rendering on a spatial canvas requires solving two conflicting requirements:
1. **GPU Rendering Performance**: Fast 60fps smooth zooming and panning of thousands of text nodes.
2. **Standard Document Interactivity**: Native text selection, copy/paste, right-click spellcheck, search highlighting, IME input, and clickable URLs.

#### The Dual-Layer Architecture: Synchronized DOM Overlay

```
┌─────────────────────────────────────────────────────────────┐
│                 VIEWPORT CONTAINER (.view-content)           │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  PixiJS Canvas Element (z-index: 1)                   │  │
│  │  - Renders Background, Images, Ink, Table Borders     │  │
│  │  - Fast rasterized Text runs during rapid pan/zoom    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  DOM Overlay Container (z-index: 2, pointer-events)   │  │
│  │  - Synchronized CSS Transform:                        │  │
│  │    transform: translate(tx, ty) scale(s);            │  │
│  │  - Absolute positioned HTML Outlines & Paragraphs     │  │
│  │  - Native selection, font rendering, hyperlinks       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

#### DOM Overlay Lifecycle
- **Pan / Zoom Action**: Updates CSS `transform: matrix(a, b, c, d, tx, ty)` of the DOM overlay in lockstep with the Pixi viewport matrix using `requestAnimationFrame`.
- **Culling**: HTML elements outside the viewport bounding box are toggled `display: none` or detached to preserve DOM node count $< 100$.

---

### Section M: Viewport, Pan & Zoom Architecture

The viewport controller manages spatial camera transformations:
- **Transform State**: Matrix $M = \begin{pmatrix} s & 0 & tx \\ 0 & s & ty \\ 0 & 0 & 1 \end{pmatrix}$, where $s \in [0.1, 5.0]$.
- **Interactions**:
  - Middle-click / Spacebar + Left-click drag $\rightarrow$ Smooth Pan.
  - Trackpad pinch / Mouse wheel + Ctrl $\rightarrow$ Zoom centered on mouse pointer position $(p_x, p_y)$:
    $$tx' = p_x - (p_x - tx) \frac{s'}{s}, \quad ty' = p_y - (p_y - ty) \frac{s'}{s}$$
  - Momentum physics with cubic deceleration.

---

### Section N: Large-Page Performance & Culling Strategy

To maintain 60-120 FPS on massive pages with 5,000+ objects:
1. **Hierarchical Frustum Culling**:
   - Query 2D R-Tree on every camera move.
   - Set `renderable = false` on all Pixi containers outside visible bounds.
2. **Display Chunking (Spatial Tiles)**:
   - Group static elements (background drawings, historical notes) into $1024 \times 1024$ coordinate spatial tiles.
3. **Render-Texture Baking**:
   - Complex static clusters (e.g., an intricate sketch with 2,000 ink points) can be baked into a single `RenderTexture` sprite when zoom scale is constant.

---

### Section O: WebGL2 & WebGPU Acceleration Strategy

PixiJS v8 introduces a unified renderer backend.
- **Primary Target**: WebGL2 (universally available across all Electron versions and OS platforms).
- **WebGPU Readiness**: Configured via `preference: 'webgl'` with fallback detection. As Obsidian upgrades Chromium/Electron baselines, WebGPU will automatically enable compute shaders for ink tessellation without code refactoring.
- **Context Loss Handling**: Robust recovery listening to `webglcontextlost` and `webglcontextrestored`, reloading active textures from the LRU cache.

---

### Section P: Markdown Semantic Projection & Search Integration

While the spatial canvas renders freeform layouts, Obsidian requires semantic Markdown for search indexing, backlinks, graph view, and Dataview integration.

#### Dual-Representation Model
For every OneNote page imported:
1. **`NoteName.onecanvas.json`**: Full fidelity spatial document model (stores exact positions, ink, shapes, z-orders).
2. **`NoteName.md`**: Projected companion Markdown document containing:
   - Frontmatter metadata (`title`, `created`, `tags`, `source_onenote_guid`).
   - Clean, ordered Markdown projection of all text outlines, tables, task lists, and linked images.
   - Embedded link back to the Spatial Canvas: `![[NoteName.onecanvas.json]]`.
   - Real-time or batch synchronization between spatial edits and Markdown body.

---

### Section Q: `.onecanvas.json` Document Specification

A clean, open JSON format storing the OneNote page's spatial scene:

```json
{
  "$schema": "https://raw.githubusercontent.com/onenote-to-obsidian/spec/v1/schema.json",
  "version": 1,
  "metadata": {
    "title": "Project Architecture",
    "createdTime": 1724218800000,
    "lastModifiedTime": 1724222400000,
    "sourceGuid": "{84B42E10-6C23-441A-9BA3-112233445566}"
  },
  "canvas": {
    "backgroundColor": "#FFFFFF",
    "ruleLines": { "type": "college", "spacing": 24, "color": "#E5E7EB" },
    "bounds": { "minX": 0, "minY": 0, "maxX": 3200, "maxY": 4800 }
  },
  "nodes": [
    {
      "id": "node_01h8",
      "type": "outline",
      "x": 120,
      "y": 180,
      "width": 640,
      "height": 320,
      "zIndex": 10,
      "content": {
        "paragraphs": [
          {
            "id": "p_01",
            "runs": [{ "text": "Core Principles", "bold": true, "fontSize": 18 }]
          }
        ]
      }
    }
  ],
  "assets": {
    "img_01": { "path": "assets/diagram1.png", "mime": "image/png" }
  }
}
```

---

### Section R: JSON Canvas Interoperability Bridge

Obsidian's native Canvas uses the JSON Canvas specification (`.canvas`).
- **Bridge Exporter**: Provides a 1-click lossless exporter from `PageScene` to `.canvas`.
- **Mapping**:
  - Outlines $\rightarrow$ Text Nodes (`type: "text"`).
  - Images $\rightarrow$ File Nodes (`type: "file"`).
  - Groups / Containers $\rightarrow$ Group Nodes (`type: "group"`).
- **Ink Representation**: Freeform ink strokes are exported as embedded vector SVGs within `.canvas` card nodes to preserve handwriting visibility in native Obsidian Canvas.

---

### Section S: Obsidian Integration & ItemView Lifecycle

The plugin integrates deeply with Obsidian APIs:
1. **Custom `ItemView`**:
   - Registers `VIEW_TYPE_ONENOTE_CANVAS = "onenote-spatial-view"`.
   - Binds to `.onecanvas.json` and `.one` file extensions.
2. **Vault & File Watchers**:
   - Listens to `vault.on('modify')` and `vault.on('delete')` to refresh open canvases.
3. **MetadataCache & Backlinks**:
   - Parses `[[Wikilinks]]` within OneNote text runs and registers them with Obsidian's `MetadataCache`, seamlessly linking imported pages into the user's Obsidian Knowledge Graph.

---

### Section T: Security & Sandboxing Architecture

1. **Zero External Network Access**: Complete local offline execution; zero telemetry or telemetry leaks.
2. **Buffer Validation**: WebAssembly parser enforces strict bounds checking against corrupted MS-ONESTORE chunk pointers to prevent buffer overruns.
3. **DOM Sanitization**: Any rich HTML extracted from OneNote is sanitized via DOMPurify before mounting into DOM overlays, preventing XSS injection.

---

### Section U: Licensing, Provenance & Clean-Room Boundaries

To guarantee clean intellectual property and open distribution on the Obsidian Community Plugin registry:
1. **`msiemens/onenote.rs` (MPL-2.0)**: Used as a compiled WebAssembly library. MPL-2.0 is a file-level copyleft license; our TypeScript codebase and custom wrapper crates remain under **MIT / Apache-2.0**.
2. **`emsi/OneNoteViewer` (GPL-3.0)**: **No code is vendored or copied**. All TypeScript models, PageScene layouts, and PixiJS shaders are independently architected clean-room implementations based on official Microsoft Open Specifications (`[MS-ONE]`, `[MS-ONESTORE]`, `[MS-ISF]`).
3. **PixiJS v8 (MIT)**: Permissive open-source graphics library.

---

### Section V: Comprehensive Testing Strategy

- **Golden Master Visual Regression**: Automated headless Chromium tests comparing PixiJS canvas screenshots against official Microsoft OneNote Desktop rendering captures.
- **WASM Unit Testing**: Rust `cargo test` verifying byte-level MS-ONESTORE parsing across legacy (2007, 2010, 2013, 2016, M365) test suites.
- **Fuzz Testing**: `cargo-fuzz` testing the parser against corrupted and truncated `.one` binaries.
- **Memory Leak CI**: Playwright automated runs loading 100 consecutive pages, asserting VRAM and JS heap return to baseline.

---

### Section W: MS-ONE / MS-ONESTORE Compatibility Matrix

| Feature | MS Spec ID / Property | Phase 1 Support | Phase 2 Support |
| :--- | :--- | :--- | :--- |
| Notebook TOC / Hierarchy | `[MS-ONESTORE]` `.onetoc2` | Full | Full |
| Sections & Section Groups | `[MS-ONE]` Section Node | Full | Full |
| Freeform Text Outlines | `jcidOutlineElement`, `jcidRichText` | Full | Full |
| Paragraph Formatting & Lists | `IndentLevel`, `Bullet`, `Numbering` | Full | Full |
| Raster Images (PNG, JPEG, BMP) | `jcidImage`, `PictureContainer` | Full | Full |
| Vector Printouts (EMF/WMF) | `jcidImage` EMF Data | PNG Transcoded | Native SVG |
| Freeform Ink & Handwriting | `[MS-ISF]`, `jcidInk` | Full | Full |
| Highlighter Ink Layers | `jcidInk` + `ISF DrawingAttributes` | Full (Multiply) | Full |
| Tables & Nested Cells | `jcidTable`, `jcidTableRow` | Full | Full |
| File Attachments & Icons | `jcidEmbeddedFileDef` | Extracted | In-canvas preview |
| Internal Page Hyperlinks | `HyperlinkUrl`, `OneNoteGUID` | Full (Wikilinks) | Full |
| Password-Protected Sections | Crypto Provider | Error Notice | AES Decryption |

---

### Section X: Major Technical Risks & Mitigation Matrix

| Risk | Severity | Impact | Mitigation Strategy |
| :--- | :---: | :--- | :--- |
| **VRAM Exhaustion on Image-Heavy Notebooks** | **High** | WebGL context crash on large PDF printouts. | Frustum-based texture eviction, LRU memory budget (256MB), worker-based downscaled ImageBitmaps. |
| **Text Layout Discrepancies** | **Medium** | Text wrapping slightly differently than OneNote desktop. | Accurate font metric pre-computation, DOM overlay fallback for 100% native typography. |
| **WASM Memory Limit on Giant `.onepkg`** | **Medium** | 32-bit WASM 4GB limit hit on huge archives. | Chunked streaming extraction; use Node.js worker threads on Desktop. |
| **GPL License Contamination** | **High** | Plugin rejected from Obsidian registry or forced GPL. | Strict clean-room implementation; rely only on MPL-2.0 parser crate compiled to WASM; zero code taken from GPL viewer. |
| **ISF Ink Coordinate Offset Errors** | **Medium** | Handwriting misaligned with text background. | Exact matrix transform application according to `[MS-ISF]` and `[MS-ONE]` section 2.2 transform descriptors. |
