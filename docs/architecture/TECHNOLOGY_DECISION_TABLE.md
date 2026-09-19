# Technology Decision Table & Architectural Trade-offs

This document outlines all core architectural, technology, and framework decisions evaluated for the **OneNote to Obsidian** spatial engine plugin.

---

## Technology Evaluation Matrix

| Subsystem / Layer | Selected Technology | Alternative Evaluated | Trade-offs & Rationale | Decision |
| :--- | :--- | :--- | :--- | :---: |
| **Spatial 2D Rendering Engine** | **PixiJS v8 (`pixi.js`)** | HTML5 Canvas 2D API | Canvas 2D suffers CPU-bound path tessellation, lacks batching for thousands of ink strokes/sprites, and lacks WebGPU/WebGL shader pipelines. PixiJS v8 provides auto-batching, high-DPI scaling, texture caching, WebGL2/WebGPU backends, and container hierarchy. | **SELECTED (MANDATORY)** |
| **Alternative Graphics Engine** | **PixiJS v8** | Three.js / Fabric.js / Konva.js | Three.js is 3D-heavy with high overhead for 2D spatial text/ink. Fabric.js and Konva.js are Canvas 2D based and choke on 10,000+ stroke points. PixiJS v8 is the industry standard for high-performance 2.5D canvas applications. | **SELECTED** |
| **OneNote Binary Parser** | **Rust `onenote_parser` (MPL-2.0) compiled to WASM** | Pure TypeScript parser from scratch | MS-ONESTORE involves complex 64-bit transaction logs, CRC checksums, and revision trees. Writing a pure TS parser from scratch would delay the project by 6-9 months. `onenote_parser` in Rust is battle-tested, correct, and compiles to fast WebAssembly. | **SELECTED** |
| **Parser Wrapper & Glue** | **Custom `crates/onenote-wasm-bridge`** | Direct link to `emsi/OneNoteViewer` (`onenote-core`) | `emsi/OneNoteViewer` is licensed under **GPL-3.0-or-later**. Linking it directly would taint the Obsidian plugin with GPL viral copyleft. `onenote_parser` is **MPL-2.0** (file-level copyleft), allowing our Rust bridge and TS plugin to remain permissively licensed (MIT / Apache-2.0). | **SELECTED** |
| **WASM-to-JS Serialization** | **Zero-Copy Uint8Array Slices + Compact MessagePack / rkyv** | JSON.stringify / JSON.parse | Transferring 50MB of image blobs or 100,000 ink points as Base64 JSON strings kills V8 performance and doubles RAM usage. Zero-copy memory access for binary assets with compact binary serialization for metadata achieves sub-10ms parse transfers. | **SELECTED** |
| **`.onepkg` Container Extraction** | **Rust `cab` (WASM) + Node.js Worker (Desktop Streamer)** | External OS CLI `cabextract` or `7z` | Relying on external command-line utilities breaks cross-platform reliability (especially macOS/mobile) and requires user shell permissions. In-memory pure Rust/WASM MSZIP/LZX decompression works everywhere. | **SELECTED** |
| **Spatial Indexing & Culling** | **Flatbush / RBush (2D R-Tree)** | Brute-force iterating display objects | An average OneNote page has 500 to 5,000 visual primitives. Evaluating every object on every mouse move or camera pan is $O(N)$. An R-Tree provides $O(\log N)$ spatial queries for frustum culling and $<1\text{ms}$ hit-testing. | **SELECTED** |
| **Text Interactivity & Typography** | **Synchronized HTML/DOM Overlay over WebGL Canvas** | Pixi Canvas `Text` / `BitmapText` only | Canvas text lacks native cursor positioning, OS IME input, right-click spellcheck, native drag-selection, accessibility screen readers, and crisp OS subpixel font rendering. A synchronized DOM overlay gives native document ergonomics with GPU performance. | **SELECTED** |
| **Handwriting / Ink Vectorization** | **Catmull-Rom Spline Interpolation + GPU Mesh Ribbons** | Native Canvas 2D `bezierCurveTo` | Canvas 2D curves cannot handle variable pressure or highlighter blend modes efficiently. Generating GPU triangle strip meshes allows dynamic pen widths, chisel-tip calligraphy angles, and hardware `MULTIPLY` blending. | **SELECTED** |
| **Obsidian Integration Target** | **Dual-Format: `.onecanvas.json` + Projected `.md`** | Markdown only OR Canvas only | Markdown alone destroys spatial layouts; Canvas alone hides notes from Obsidian search, graph view, and backlinks. The dual-representation preserves 100% spatial fidelity while exposing clean Markdown for graph indexing. | **SELECTED** |
| **Platform Target** | **Desktop-First (macOS, Windows, Linux) with Mobile Foundation** | Mobile-First | OneNote backup packages (`.onepkg`) are typically generated on Desktop. Desktop Electron provides memory headroom for multi-gigabyte archives. Mobile support will follow once the core engine is stabilized. | **SELECTED** |

---

## Detailed Evaluation of Graphics & Rendering Stacks

### Why PixiJS v8 Over Other Rendering Backends

```
                              ┌────────────────────────────────────────────────────────┐
                              │                 RENDERING ENGINE AUDIT                 │
                              └────────────────────────────────────────────────────────┘
                                                         │
             ┌───────────────────────────┬───────────────┴───────────────┬───────────────────────────┐
             ▼                           ▼                               ▼                           ▼
     [ HTML5 Canvas 2D ]           [ Three.js ]                    [ Konva / Fabric ]         [ PixiJS v8 (Selected) ]
  ─────────────────────────   ─────────────────────────       ─────────────────────────   ───────────────────────────────
  ❌ CPU-bound rasterizer     ❌ Overkill 3D scenegraph       ❌ Canvas 2D bottleneck     ✅ WebGL2 + WebGPU pipelines
  ❌ Stalls on 5000+ strokes  ❌ Heavy matrix overhead        ❌ High memory per node     ✅ Auto-batching sprite/mesh
  ❌ No custom shaders        ❌ Text rendering awkward       ❌ Limited shader support   ✅ Low-overhead 2.5D container
  ❌ No WebGPU acceleration   ❌ High bundle size (>600KB)    ❌ Slow on large canvases   ✅ Subpixel High-DPI support
```

### Why Rust/WASM Over Pure TypeScript for Ingestion

```
  Metric                  Pure TypeScript Parser    Rust WASM (onenote_parser)
  ──────────────────────  ────────────────────────  ──────────────────────────
  Decompression Speed     Medium (pako/flate)       Ultra-Fast (Native SIMD/LLVM)
  Memory Safety           V8 GC spikes on 1GB files Isolated linear memory sandbox
  Development Time        6-9 months                Immediate (Mature MPL-2.0 crate)
  Format Accuracy         Risk of edge-case bugs    Verified across MS-ONE test suites
  Maintenance Burden      High                      Shared with upstream Rust community
```
