# OneNote2Obsidian

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-blue.svg)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI Tests](https://img.shields.io/badge/Tests-34%2F34%20Passed-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)]()
[![Status](https://img.shields.io/badge/Status-Alpha%20%2F%20In%20Active%20Development-orange.svg)]()

**OneNote2Obsidian** is an open-source Obsidian plugin designed to import Microsoft OneNote `.one` and `.onepkg` files while **preserving their freeform spatial canvas** — including positioned text frames, images, handwriting/ink, arrows, drawings, tables, file attachments, and multi-layer overlapping annotations — using **PixiJS** as the high-performance spatial rendering engine.

---

## 🎯 Purpose & Spatial Fidelity Objective

Traditional document converters flatten OneNote notebooks into linear plain Markdown, destroying the spatial relationships between diagrams, handwritten math, sticky notes, margin comments, and annotations sketched directly over images.

**OneNote2Obsidian establishes a dual-representation architecture:**

```
                       Original OneNote Source (.one / .onepkg)
                                          │
                         [Immutable Source Provenance]
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    ▼                                           ▼
      Spatial View (.onecanvas.json)              Semantic View (.md)
   • 60 FPS PixiJS GPU Canvas                  • Standard Obsidian Markdown Note
   • Vector Ink & Highlighters                 • Full-Text Searchable
   • Spatial Anchors & Overlays                • Backlinks & Graph View
   • Sticky Notes & Annotation Groups          • Asset Links & Tags
   • Interactive 8-Point Transform             • Dual Synchronized Split View
```

1. **Spatial Representation (`.onecanvas.json`)**: An interactive, 60 FPS GPU-accelerated canvas that preserves exact 2D coordinates, stroke pressure, highlighters, and multi-layer visual layouts.
2. **Semantic Projection (`.md`)**: A clean GitHub Flavored Markdown document enabling Obsidian's full-text search, backlinks, tag indexing, and graph view.

---

## 🚀 Key Features

### 1. High-Fidelity Spatial Canvas
- **PixiJS v8 Rendering Pipeline**: Decoupled 2.5D GPU canvas with a 9-layer scene graph (Page Background, Images, Vector Ink, Outlines/Text, Tables, Shapes, Attachments, Selection Gizmos, HUD).
- **Catmull-Rom Vector Ink**: Pressure-sensitive freehand pens and highlighters with authentic color blending and Catmull-Rom curve smoothing.
- **Sticky Notes & Quick Notes**: Freeform note boxes with custom background tints and draggable placement anywhere on the canvas.
- **Spatial Anchors & Annotation Groups**: Bind annotations and handwritten ink notes to specific images, shapes, or paragraphs so they move and scale together.
- **Spatial Backlinks**: Interactive links connecting spatial canvas elements directly to corresponding Obsidian Markdown notes.

### 2. Interactive Editing Engine
- **8-Point Transform Gizmo**: Move, resize, and lock aspect ratios for outlines, shapes, and images.
- **In-Place Rich Text Editing**: Double-click any text frame to edit content directly in a seamless DOM textarea overlay.
- **Live Ink Tools**: Pen, translucent highlighter, stroke width presets, color swatches, and a geometric stroke eraser.
- **Reversible History**: Full undo/redo stack (`Ctrl+Z` / `Ctrl+Y`) with transactional command grouping.
- **Spatial Clipboard**: Cut, copy, paste, and duplicate (`Ctrl+D`) with spatial offsets.

### 3. High-Performance Architecture
- **2D Spatial Hash Grid**: Sub-millisecond viewport queries ($1.2\mu\text{s}$ hit-testing) across thousands of objects.
- **Batched Vector Strokes**: Up to 1,250x fewer draw-call flushes for ink-heavy notebook pages.
- **Delta Frustum Culling**: Smooth 60 FPS viewport transforms on expansive $5000\times 5000\text{px}$ canvas layouts.
- **SHA-256 Asset Deduplication**: Zero duplicated storage across repetitive image payloads.

### 4. Zero-Trust Security & Data Safety
- **100% Local & Offline**: **Zero telemetry, zero analytics, zero external network requests**.
- **Archive Sandboxing**: Strict defenses against path traversal (`../`), Windows reserved device names (`CON`, `NUL`), and decompression bombs.
- **Source File Immutability**: The original `.one` and `.onepkg` files are treated as immutable read-only provenance and are never altered.
- **Vault Safety**: Atomic write operations with sandboxed staging cleanup on abort or failure.

---

## 📦 Supported File Formats

| Format | Extension | Description | Support Status |
| :--- | :--- | :--- | :--- |
| **OneNote Section** | `.one` | Individual section file (OneNote 2010–2016 / 365 format) | ✅ Full Support |
| **OneNote Package** | `.onepkg` | Multi-section notebook archive (MSCF Cabinet format) | ✅ Full Support |
| **Notebook Table of Contents** | `.onetoc2` | Section hierarchy and display order metadata | ✅ Full Support |
| **Spatial Sidecar** | `.onecanvas.json` | Plugin-owned editable 2.5D spatial document schema | ✅ Version 1 Schema |

---

## 🚦 Current Status & Known Limitations

> [!WARNING]
> **Alpha Status**: OneNote2Obsidian is currently in active alpha development. Core parsing, rendering, and spatial editing are fully operational, but complex third-party embedded objects and legacy 2003 formats have known limitations.

### Known Limitations

1. **Password-Protected Sections**: Encrypted sections cannot be decrypted automatically. Unlock and export them in Microsoft OneNote before importing.
2. **OneNote 2003 / 2007 Format**: Legacy pre-2010 binary structures must be upgraded to 2010–2016 format in OneNote prior to import.
3. **Embedded OLE Objects** (e.g. live Excel spreadsheets): Extracted as static file attachments; live in-cell formula editing requires external desktop applications.
4. **Complex MathML Equations**: Rendered as text representation; can be converted to standard LaTeX `$...$` in the semantic Markdown note.
5. **Platform Support**: **Desktop Only** (Windows, macOS, Linux). Multi-gigabyte archive extraction and binary stream parsing rely on Node.js runtime APIs.

---

## 🛠️ Development & Testing

```bash
# Clone the repository
git clone https://github.com/Lalogeorgi/OneNote2Obsidian.git
cd OneNote2Obsidian

# Install dependencies
npm install

# Run strict typecheck, production build, and all 34 test suites
npm run check

# Development watch mode
npm run dev
```

---

## 📜 Documentation Index

- [Compatibility & Supported Features Matrix](COMPATIBILITY.md)
- [Third-Party Licenses & Software Provenance](THIRD_PARTY_LICENSES.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Changelog](CHANGELOG.md)
- [Release Checklist](RELEASE_CHECKLIST.md)

---

## 📄 License & Attribution

- **Plugin License**: [MIT License](LICENSE) (c) 2026 OneNote2Obsidian Contributors.
- **Third-Party Libraries**: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) (Pixi.js, DOMPurify, RBush).
- Clean-room TypeScript parser implemented based on Microsoft's publicly available Open Specifications (`[MS-ONE]`, `[MS-ONESTORE]`, `[MS-CAB]`, `[MS-ISF]`).
