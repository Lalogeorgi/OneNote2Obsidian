# Changelog

All notable changes to the **OneNote2Obsidian** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0-alpha] - 2026-09-05

### Added
- **Authentic OneNote Top Ribbon Parity**:
  - Full tabbed ribbon navigation (**Home**, **Insert**, **Draw**, **View**).
  - **Draw Tab**: Favorite Pens Shelf (12 OneNote presets + dynamic `+` Add Pen button), 6 signature GPU novelty inks (Rainbow, Galaxy, Gold, Silver, Lava, Ocean), Color & Thickness inspector flyout (24-color palette, 7 thickness steps), Multi-Mode Eraser (Stroke and 3 Point eraser radii), Shapes Gallery (11 geometric stamps), Automatic Ink-to-Shape recognition, Digital Canvas Ruler, and Arrange group.
  - **Home Tab**: Basic text formatting bar (**B**, *I*, <u>U</u>, ~~S~~, Bulleted & Numbered lists, To-Do checkboxes, Highlight), note containers, and sticky note creation with customizable default color preferences.
  - **Insert Tab**: Quick tables (2x2, 3x3), proportional aspect-ratio preserving image insertion, wikilinks/URLs, and timestamps.
  - **View Tab**: Rule lines (None, Ruled, Grid), page tints (White, Cream, Mint, Rose, Dark), and zoom controls.
  - **Distraction-Free Top Bar UI**: Removed all "OneNote" brand text from the top bar header, replaced controls with crisp SVG vector icons, added an interactive 1-click 100% zoom reset badge, and automated popup dismissal on outside clicks.
- **High-Fidelity Drawing Import Extraction**:
  - Direct 24-bit RGB stroke color extraction from OneNote binary properties (`0x340f`).
  - Conversion of HIMETRIC float units (`0x340c`) to CSS screen pixels.
  - Intelligent `penType` classification (`"highlighter"`, `"ballpoint"`, `"gel"`, `"pencil"`).
  - Full support for OneNote highlighter palette colors and blend modes.
- **Interactive Drag-and-Drop & Depth Arrangement (Z-Order)**:
  - Drag-and-drop repositioning for Pictures, Text frames, and Drawings directly from their selection bounding boxes.
  - Synchronized vector coordinates in `stroke.points` during translation in `MoveNodesCommand`, preventing coordinate drift and SVG distortion.
  - Disabled native browser HTML5 drag ghosting on canvas images for uninterrupted pointer event streams.
  - Complete Z-order controls ("Bring to Front", "Send to Back", "Bring Forward", "Send Backward") supported via top ribbon Arrange group, right-click canvas context menu, and keyboard shortcuts (`Ctrl+Shift+]`, `Ctrl+Shift+[`).
- **Multi-Page Section Import Separation**:
  - Clean separation of multi-page `.one` sections into individual spatial canvases and markdown notes.
  - Accurate bullet list indentation hierarchy and top-left alignment.
- **First-Class Spatial Sticky Notes & Floating Windows**:
  - Native spatial sticky note model (`CanonicalStickyNote`) with 7 color presets (Yellow, Green, Blue, Purple, Pink, Orange, Charcoal).
  - Mandatory variable opacity/transparency controls (slider and quick presets from 20% to 100%) synchronized in real-time between PixiJS GPU rendering and DOM text overlays.
  - Floating Sticky Note Manager (`FloatingStickyNoteManager`) supporting detached standalone desktop windows (`FloatingStickyNoteWindow`) with always-on-top pinning and live two-way canvas synchronization.
  - Global Sticky Notes Hub modal (`StickyNotesHubModal`) and dockable view (`OneNoteStickyNoteView`) for searching and jumping to any note.
- **Spatial Anchors & Knowledge Graph**:
  - Spatial Anchors (`SpatialAnchorManager`) and Annotations (`SpatialAnnotationManager`) locking ink/text annotations to underlying images or diagrams during repositioning.
  - Hierarchical Spatial Groups (`SpatialGroupManager`) for coordinated movement and z-ordering.
  - Spatial Backlinks (`SpatialLinkGraph`, `SpatialLinkRenderer`) connecting spatial elements to Obsidian vault markdown notes.
  - Page Properties Modal (`PagePropertiesModal`) with real-time YAML frontmatter synchronization.
- **Expanded Automated Test Suite**:
  - Scaled automated Vitest suite to **67 test files and 340 tests** covering parser parity, spatial indexing, opacity regressions, floating window UX, and security hardening.

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
