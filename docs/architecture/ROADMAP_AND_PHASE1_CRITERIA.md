# Engineering Roadmap, Phase 1 Acceptance Criteria & Testing Strategy

**Author:** Lead Software Architect & Graphics Engineer  
**Project:** `OneNotesToObsidian` (Evolved to `OneNote2Obsidian`)

> [!NOTE]
> **Engineering Progression Notice**:  
> *This document captures the initial Phase 1 criteria formulated during foundational discovery. Foundation through Release Phases 0.5–10 have since been completed, delivering clean-room TypeScript binary ingestion, PixiJS GPU rendering, authentic ribbon navigation, first-class Sticky Notes, and automated test suites. This document is retained for historical milestone tracking.*

---

## 1. Multi-Phase Engineering Roadmap

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         5-PHASE ENGINEERING ROADMAP                         │
 └─────────────────────────────────────────────────────────────────────────────┘
                                        │
 ┌──────────────────────────────────────┴──────────────────────────────────────┐
 │ PHASE 1: Core Spatial Ingestion, PixiJS Rendering Engine & Markdown Bridge  │
 │ • Rust/WASM MS-ONE & CAB Extractor                                          │
 │ • Canonical TypeScript Document Model & PageScene Layout IR                 │
 │ • PixiJS v8 GPU Renderer (Background, Sprites, Shaders, Tessellated Ink)     │
 │ • Synchronized DOM Overlay for Crisp Typography & Text Selection            │
 │ • Smooth Pan/Zoom Viewport Controller with Momentum Physics                 │
 │ • Markdown Semantic Companion File Generation (.md + .onecanvas.json)       │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │
 ┌──────────────────────────────────────┴──────────────────────────────────────┐
 │ PHASE 2: Spatial Selection, Interactive Editing & JSON Canvas Interop       │
 │ • 2D Marquee Selection Box & Transform Handles (Move/Resize/Rotate)        │
 │ • Inline Rich Text & Markdown Editing directly in Canvas Outlines           │
 │ • High-Performance Table Grid Editor                                        │
 │ • One-Click Lossless Export to Standard Obsidian Canvas (.canvas)           │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │
 ┌──────────────────────────────────────┴──────────────────────────────────────┐
 │ PHASE 3: Vector Drawing Tools, Attachments & Section Password Decryption    │
 │ • New Vector Ink Creation (Apple Pencil / Stylus / Wacom Tablet Support)    │
 │ • Embedded Attachment Drag-and-Drop & Direct Vault Asset Management         │
 │ • AES Decryption for Password-Protected OneNote Sections                    │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │
 ┌──────────────────────────────────────┴──────────────────────────────────────┐
 │ PHASE 4: Obsidian Mobile (iOS & Android) Touch Optimization                 │
 │ • Multi-touch Gesture Recognition (Pinch-to-zoom, Two-finger Pan)          │
 │ • Low-Memory Profile for iOS Safari WebKit Tab Ceilings (128MB VRAM Budget) │
 │ • Touch-optimized Toolbar and Floating Palettes                             │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │
 ┌──────────────────────────────────────┴──────────────────────────────────────┐
 │ PHASE 5: Obsidian Community Plugin Release & Cloud Integration              │
 │ • Full Automated Test Coverage & Performance Benchmarking                   │
 │ • Submission to Official Obsidian Community Plugin Registry                 │
 │ • Direct Microsoft OneDrive / SharePoint Notebook Sync                      │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase 1 Detailed Acceptance Criteria

To declare **Phase 1 Complete**, the implementation must satisfy 100% of the following requirements:

### A. Ingestion & Parsing
- [ ] **`.one` Section Ingestion**: Successfully parses binary `.one` files created by OneNote 2010, 2013, 2016, 2019, 2021, and M365 Desktop.
- [ ] **`.onetoc2` Table of Contents**: Parses notebook structure, extracting section names, colors, and hierarchical order.
- [ ] **`.onepkg` Container Extraction**: Decompresses `.onepkg` CAB packages in-memory via pure Rust/WASM, extracting all constituent `.one` sections.
- [ ] **Zero Data Loss Ingestion**: Extracts all text outlines, font metadata, raster images, vector ink strokes, tables, and attachments into the `CanonicalNotebook` model.

### B. Graphics & Rendering (PixiJS v8)
- [ ] **PixiJS v8 Integration**: Renderer initializes cleanly inside an Obsidian `ItemView` with WebGL2 hardware acceleration and High-DPI subpixel scaling.
- [ ] **Background Grid/Rule Lines**: Custom fragment shader renders college-rule lines and grid backgrounds without degrading frame rates.
- [ ] **Image & Printout Rendering**: Pasted images and PDF printouts render with correct spatial positions, dimensions, and aspect ratios.
- [ ] **Vector Ink Fidelity**: Handwriting and drawings render via Catmull-Rom smoothed spline curves with pressure-sensitive stroke widths.
- [ ] **Highlighter Blending**: Highlighter strokes render with `BLEND_MODES.MULTIPLY` on the bottom ink layer, appearing beneath text runs.
- [ ] **Table Layout**: Multi-column, multi-row tables render with accurate cell boundaries, background fills, and nested outline text.

### C. Interactivity & Viewport Navigation
- [ ] **Smooth Pan & Zoom**: Butter-smooth 60+ FPS navigation using Middle-Click drag, Spacebar drag, trackpad pinch, and Ctrl + Mousewheel zoom.
- [ ] **Zoom Centering**: Zoom transformations remain mathematically anchored to the user's cursor position.
- [ ] **Synchronized DOM Overlay**: Crisp, OS-native text rendering placed in lockstep over the WebGL canvas, allowing native text drag-selection and clipboard copying (`Ctrl+C`).
- [ ] **Hyperlink Navigation**: Clicking web URLs opens external browser; clicking internal OneNote links navigates to target pages within Obsidian.

### D. Obsidian Vault & Semantic Integration
- [ ] **Dual-Storage Generation**: Importing a page creates both `PageName.onecanvas.json` (spatial fidelity) and `PageName.md` (semantic Markdown projection).
- [ ] **Backlink & Graph Visibility**: Extracted text, headers, and wikilinks inside `.md` are indexed by Obsidian `MetadataCache` and visible in Graph View.
- [ ] **Embedded Assets**: Images and file attachments are stored cleanly in the user's configured Obsidian attachment folder.

---

## 3. Comprehensive Testing Strategy

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         TESTING PYRAMID & PIPELINE                          │
 └─────────────────────────────────────────────────────────────────────────────┘
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
  [ Rust / WASM Unit ]       [ Visual Regression ]        [ Performance Bench ]
  ────────────────────       ─────────────────────        ─────────────────────
  • 100+ MS-ONE binary       • Headless Playwright        • 60 FPS under 5000
    parsing fixtures           Pixelmatch against           elements
  • CAB decompressor           OneNote Desktop            • < 256MB VRAM memory
    integrity checks           captures                     ceiling
  • Fuzz testing for         • Subpixel ink and           • < 500ms cold parse
    malformed inputs           table alignment checks       on 50MB notebook
```

### 1. Automated Rust & WASM Unit Tests
- Execute `cargo test` verifying byte-level accuracy against reference OneNote binaries.
- Validate MS-ISF ink coordinate unpackers and transform matrix multiplication.

### 2. Golden Master Visual Regression Tests
- Playwright-driven test runner opens reference `.one` test pages in an automated Chromium instance.
- Takes canvas screenshot and compares against ground-truth OneNote Desktop export using `pixelmatch` (Threshold: $\Delta < 0.5\%$).

### 3. Memory & Performance Benchmarking
- Automated test script loads a stress-test page containing 500 images and 10,000 ink strokes.
- Asserts memory usage remains stable under continuous pan/zoom cycles with zero memory leaks across 50 consecutive page switches.
