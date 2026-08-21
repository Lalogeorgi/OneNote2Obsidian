# Changelog

All notable changes to the **OneNote2Obsidian** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0-alpha] - 2026-08-21

### Added
- **Core Architecture & Nominal ID Foundation**:
  - Strongly typed nominal ID system (`NotebookId`, `SectionId`, `PageId`, `ObjectId`, `AssetId`).
  - Immutable 2D geometric primitives (`Point`, `Rectangle`, `SpatialBounds`, `AffineMatrix2D`, `ViewportManager`).
  - Canonical domain model independent of rendering backends.
- **Clean-Room Binary Parsers**:
  - `.one` section format parser implementing MS-ONE / MS-ONESTORE specifications.
  - `.onetoc2` notebook table of contents discovery and hierarchy reconstruction.
  - `.onepkg` MSCF Cabinet archive parser with sandboxed decompression and traversal protection.
  - Microsoft Ink Serialized Format (`ISF`) decoder converting binary ink packets into vector strokes.
- **PixiJS v8 2.5D GPU Rendering Engine**:
  - Decoupled 9-layer rendering pipeline.
  - Catmull-Rom smoothed vector ink handwriting and highlighter blend modes.
  - 2D Spatial Hash Grid partitioning ($256\text{px}$ cell buckets) with sub-millisecond hit-testing.
  - Batched vector stroke renderer (up to 1,250x draw call reduction).
  - Delta frustum culling maintaining 60 FPS viewport navigation.
- **Dual-Representation Semantic Projection & Sidecars**:
  - Deterministic `.onecanvas.json` sidecar serializer with schema versioning and v0-to-v1 automated migrations.
  - Clean GitHub Flavored Markdown projector with frontmatter metadata, asset links, and custom tags.
  - SHA-256 binary asset deduplication.
- **Interactive Spatial Canvas Tools**:
  - 8-point interactive transform gizmo with aspect-ratio locking.
  - In-place rich text editing DOM overlay.
  - Live ink drawing tools (pens, highlighters, stroke eraser).
  - Reversible command history stack (`Undo` / `Redo`).
  - Spatial clipboard (`Copy`, `Cut`, `Paste`, `Duplicate`).
- **Obsidian UX Integration**:
  - Custom `OneNoteItemView` with glassmorphic floating toolbar, navigation bar, and diagnostics HUD.
  - `HybridViewCoordinator` supporting 1-click view switching and synchronized split-pane viewing.
  - `ImportProgressModal` with real-time progress bar, cooperative cancellation (`CancellationTokenSource`), and structured error recovery troubleshooting.
- **Governance, CI & Documentation**:
  - GitHub Actions CI workflow covering typecheck, production build, and 34 test suites (134 unit/integration tests).
  - Comprehensive documentation: `README.md`, `COMPATIBILITY.md`, `THIRD_PARTY_LICENSES.md`, `SECURITY.md`, `CONTRIBUTING.md`, and `RELEASE_CHECKLIST.md`.
