# Proposed Repository & Monorepo Architecture

**Project:** `OneNotesToObsidian`  
**Toolchain:** pnpm + Cargo + wasm-pack + esbuild + TypeScript 5.5+ (Evolved to npm + esbuild + TypeScript 5.7+ clean-room package)

> [!NOTE]
> **Architecture Evolution Notice**:  
> *The proposed monorepo layout with `crates/onenote-wasm-bridge` was superseded by a unified single-package architecture (`OneNote2Obsidian`) located entirely within `src/`. All binary extraction and rendering is handled directly in TypeScript, eliminating Cargo, wasm-pack, and pnpm monorepo overhead while preserving modular domain boundaries.*

---

## 1. Monorepo Directory Tree

```
OneNotesToObsidian/
├── .github/
│   └── workflows/
│       ├── build-test.yml              # Multi-platform CI (Linux, macOS, Windows)
│       └── visual-regression.yml       # Automated Playwright visual diffs
│
├── crates/
│   └── onenote-wasm-bridge/            # Rust WebAssembly binary parser & CAB extractor
│       ├── Cargo.toml                  # Dependencies: onenote_parser, cab, wasm-bindgen
│       ├── src/
│       │   ├── lib.rs                  # WASM module entry point & export API
│       │   ├── cab_extractor.rs        # In-memory CAB/MSZIP decompression logic
│       │   ├── onestore_adapter.rs     # MS-ONESTORE object tree visitor
│       │   ├── ink_deserializer.rs     # MS-ISF packet unpacker & matrix transforms
│       │   └── memory_protocol.rs      # High-speed binary transfer & asset buffer pool
│       └── tests/                      # Rust unit tests with binary test fixtures
│
├── src/                                # TypeScript Plugin Source Code
│   ├── index.ts                        # Obsidian Plugin Entry Point (Plugin Lifecycle)
│   │
│   ├── parser/                         # Parser & WASM Ingestion Layer
│   │   ├── WasmLoader.ts               # Base64/Streaming WASM instantiation
│   │   ├── IngestionPipeline.ts        # .one, .onetoc2, .onepkg ingestion coordinator
│   │   └── WasmBridgeTypes.ts          # Low-level WASM transfer types
│   │
│   ├── model/                          # Canonical OneNote Document Model (Pure TS)
│   │   ├── CanonicalNotebook.ts        # Notebook, Section, Page interfaces
│   │   ├── CanonicalElements.ts        # Outline, Image, Ink, Table, Attachment schemas
│   │   └── CoordinateMath.ts           # 96 DPI CSS pixel conversion mathematics
│   │
│   ├── pagescene/                      # Spatial Layout & Intermediate Representation (IR)
│   │   ├── PageScene.ts                # Display list & scene graph container
│   │   ├── SceneBuilder.ts             # Canonical model -> PageScene compiler
│   │   ├── SpatialIndex.ts             # 2D R-Tree (RBush) bounding box indexing
│   │   └── LayoutReflow.ts             # Text height estimation & table cell grid sizing
│   │
│   ├── renderer/                       # Graphics & Rendering Subsystem
│   │   ├── IPageRenderer.ts            # Abstract renderer contract & types
│   │   ├── pixi/                       # PixiJS v8 Engine Implementation
│   │   │   ├── PixiPageRenderer.ts     # Main PixiJS Application lifecycle & stage
│   │   │   ├── SceneGraphBuilder.ts    # Builds typed layer containers (0 to 7)
│   │   │   ├── shaders/
│   │   │   │   ├── BackgroundShader.ts # Quad shader for college-rule & grid lines
│   │   │   │   └── InkMultiplyFilter.ts# Highlighter blending filter
│   │   │   ├── textures/
│   │   │   │   ├── TextureManager.ts   # LRU VRAM cache & worker-based ImageBitmap loader
│   │   │   │   └── WorkerBitmapDecoder.ts # Web Worker image decoder
│   │   │   ├── geometry/
│   │   │   │   ├── InkTessellator.ts   # Catmull-Rom spline to triangle strip mesh
│   │   │   │   └── ShapePrimitives.ts  # Arrows, callouts, rectangles, lines
│   │   │   └── culling/
│   │   │       └── FrustumCuller.ts    # Viewport AABB visibility culling
│   │   │
│   │   └── dom/                        # Synchronized DOM Overlay Subsystem
│   │       ├── DomOverlayManager.ts    # Absolute positioned HTML container & transform sync
│   │       ├── OutlineElementView.ts   # Rich text outline renderer (native typography)
│   │       └── LinkInterceptor.ts      # Web URL & internal [[Wikilink]] click handler
│   │
│   ├── viewport/                       # Viewport Camera & User Navigation
│   │   ├── ViewportController.ts       # Matrix transform math (Pan, Zoom, Rotate)
│   │   └── GestureHandler.ts           # Wheel, middle-click, spacebar, pinch listeners
│   │
│   ├── semantic/                       # Markdown & Knowledge Graph Projection
│   │   ├── MarkdownProjector.ts        # Canonical model -> GFM Markdown generator
│   │   ├── OneCanvasSerializer.ts      # PageScene -> .onecanvas.json serializer
│   │   └── JsonCanvasBridge.ts         # PageScene -> Obsidian .canvas exporter
│   │
│   ├── obsidian/                       # Obsidian UI & Workspace Integration
│   │   ├── OneNoteItemView.ts          # Custom ItemView implementation
│   │   ├── ImportModal.ts              # Drag-and-drop & file selection modal
│   │   ├── SettingsTab.ts              # Plugin configuration & VRAM slider
│   │   └── VaultSyncManager.ts         # Vault file writing & attachment folder manager
│   │
│   └── utils/                          # Shared Utilities
│       ├── BinaryReader.ts             # ArrayBuffer helpers
│       ├── ColorConverter.ts           # OneNote BGR/RGB to Hex/CSS color converter
│       └── Logger.ts                   # Structured diagnostic logger
│
├── docs/                               # Architectural & Technical Documentation
│   └── architecture/                   # Architecture Decision Records & Specifications
│       ├── ARCHITECTURE_DECISION_RECORD.md
│       ├── TECHNOLOGY_DECISION_TABLE.md
│       ├── PIXIJS_RENDERING_ENGINE.md
│       ├── CANONICAL_MODEL_AND_PAGESCENE.md
│       ├── DEPENDENCY_AND_PROVENANCE_REPORT.md
│       ├── COMPATIBILITY_AND_RISK_MATRIX.md
│       ├── ROADMAP_AND_PHASE1_CRITERIA.md
│       └── REPOSITORY_STRUCTURE.md
│
│
├── esbuild.config.mjs                  # Fast bundler packaging main.js & inlining WASM
├── manifest.json                       # Obsidian plugin manifest
├── package.json                        # pnpm dependencies & build scripts
├── tsconfig.json                       # Strict TypeScript 5.5+ configuration
└── styles.css                          # Obsidian theme-adaptive styles & DOM overlay
```

---

## 2. Build Pipeline & Tooling

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                           UNIFIED BUILD PIPELINE                            │
 └─────────────────────────────────────────────────────────────────────────────┘
                                        │
           ┌────────────────────────────┴────────────────────────────┐
           ▼                                                         ▼
 [ Rust WASM Compilation ]                                 [ TypeScript Bundling ]
 • wasm-pack build --target web                            • esbuild src/index.ts
 • wasm-opt -O4                                            • Tree-shake PixiJS v8
 • Base64 inlining / Binary wrapper                        • Bundle styles.css
                                                                     │
                                                                     ▼
                                                           [ Distributable Bundle ]
                                                           ├── main.js
                                                           ├── manifest.json
                                                           └── styles.css
```
