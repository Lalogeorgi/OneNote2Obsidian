# Compatibility, Supported Features & Limitations

This document outlines the feature support matrix, platform availability, format compatibility, and known technical limitations for the **OneNote Spatial Engine** plugin.

---

## 1. Supported Feature Matrix

| Category | Feature | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Document Hierarchy** | Notebooks (`.onetoc2`) | ✅ Supported | Reconstructs notebook tree, sections, and section groups. |
| | Sections (`.one`) | ✅ Supported | Full parsing of OneNote 2010–2016 / 365 format. |
| | Packages (`.onepkg`) | ✅ Supported | Unpacks MSCF CAB archives safely inside a staging sandbox. |
| **Spatial Elements** | Freeform Outlines (Text) | ✅ Supported | Position, width, font size, bold, italic, color, bullet indentation hierarchy. |
| | Vector Handwriting / Ink | ✅ Supported | Pen strokes, highlighters, HIMETRIC thickness extraction, `penType` classification, authentic RGB color palette, and Catmull-Rom smoothing. |
| | Images & Graphics | ✅ Supported | PNG, JPEG, GIF, BMP with SHA-256 binary deduplication and proportional scaling. |
| | Shapes & Geometry | ✅ Supported | Rectangles, rounded rectangles, ellipses, triangles, diamonds, stars, arrows, lines, coordinate axes. |
| | Tables | ✅ Supported | Multi-row / multi-column grids with styled cell contents. |
| | File Attachments | ✅ Supported | Extracted to vault assets directory with link references. |
| | Page Canvas Rules | ✅ Supported | Solid background colors, authentic tints, and ruled / grid guide lines. |
| **Interactive Canvas** | 8-Point Transform Gizmo | ✅ Supported | Translate, resize, aspect-ratio lock, multi-selection. |
| | Element Drag-and-Drop | ✅ Supported | Reposition Pictures, Text frames, and Drawings directly from selection bounds with synchronized vector coordinates. |
| | Depth Arrangement (Z-Order)| ✅ Supported | Bring to Front, Send to Back, Bring Forward, Send Backward via ribbon Arrange group, canvas context menu, and keyboard shortcuts. |
| | In-place Text Editing | ✅ Supported | Double-click outline to edit rich text in DOM overlay. |
| | Authentic Top Ribbon | ✅ Supported | Tabbed Ribbon navigation (**Home**, **Insert**, **Draw**, **View**) mirroring OneNote desktop. |
| | Pens Shelf & Novelty Inks | ✅ Supported | 12 favorite pen presets, dynamic `+` Add Pen button, and 6 GPU novelty inks (Rainbow, Galaxy, Gold, Silver, Lava, Ocean). |
| | Ink Tools & Eraser | ✅ Supported | Freehand pens, highlighters, stroke eraser, and 3 precision point eraser modes. |
| | Ink-to-Shape Recognition | ✅ Supported | Automatic heuristic recognition and conversion of hand-drawn shapes to geometric vector shapes. |
| | Digital Canvas Ruler | ✅ Supported | Interactive translucent ruler overlay with angle dial and degree snapping. |
| | Undo / Redo Stack | ✅ Supported | Full command history with transaction grouping and vector point reversion. |
| | Spatial Clipboard | ✅ Supported | Cut, copy, paste, and duplicate with coordinate offset. |
| **Sticky Notes & Knowledge** | First-Class Sticky Notes | ✅ Supported | Full note objects with customizable color presets, collapsible titles, formatting bar. |
| | Sticky Note Opacity / Transparency | ✅ Supported | Variable opacity slider & presets (20% to 100%) synchronized into PixiJS & DOM text. |
| | Floating Sticky Note Windows | ✅ Supported | Standalone detached windows (`FloatingStickyNoteWindow`) with always-on-top pinning. |
| | Sticky Notes Hub Modal | ✅ Supported | Global note explorer and search modal (`StickyNotesHubModal`) across notebook pages. |
| | Spatial Anchors & Annotations | ✅ Supported | Anchor annotations and handwritten notes to underlying images, shapes, or outlines. |
| | Spatial Groups | ✅ Supported | Multi-element hierarchical grouping for coordinated dragging and z-ordering. |
| | Spatial Backlinks & Graph | ✅ Supported | Bi-directional links connecting canvas elements to Obsidian Markdown vault notes. |
| | Page Properties Modal | ✅ Supported | Interactive canvas frontmatter and metadata editor with real-time sync. |
| **Hybrid Workflow** | Semantic Markdown Projection | ✅ Supported | Generates clean, searchable Obsidian Markdown pages. |
| | `.onecanvas.json` Sidecars | ✅ Supported | Stores full 2.5D spatial layout with schema versioning. |
| | Split View (Spatial + MD) | ✅ Supported | Side-by-side synchronized viewing. |

---

## 2. Unsupported OneNote Features & Limitations

| Unsupported Feature | Behavior / Fallback | Recommended Workaround |
| :--- | :--- | :--- |
| **Password-Protected Sections** | Skipped with `PARSER_ENCRYPTED_SECTION` warning. | Unlock the section in Microsoft OneNote and export an unencrypted copy before importing. |
| **OneNote 2003 / 2007 Format** | Rejected with legacy version error. | Open in OneNote 2016 / 365 and use *File > Info > Settings > Upgrade* to 2010–2016 format. |
| **Embedded OLE Objects** (e.g. live Excel spreadsheets, Visio diagrams) | Preserved as static file attachments. | Open attachment links in external desktop application. |
| **Audio-Synced Note Timestamps** | Audio file is extracted; precise playback synchronization markers are omitted. | Play extracted `.mp3` / `.wav` audio attachment via Obsidian audio player. |
| **Complex MathML Equations** | Rendered as text representation. | Reformat advanced math formulas using Obsidian standard `$...$` LaTeX syntax. |

---

## 3. Spatial Fidelity Expectations vs Semantic Markdown

The plugin maintains a strict separation between **Spatial Layout** and **Semantic Markdown**:

```
                       Original OneNote File (.one / .onepkg)
                                         │
                         [Read-Only Immutable Provenance]
                                         │
                     ┌───────────────────┴───────────────────┐
                     ▼                                       ▼
       Editable Spatial Representation         Searchable Semantic Representation
           (.onecanvas.json)                             (.md)
   • Exact 2D (X, Y, W, H) coordinates      • Clean GitHub Flavored Markdown
   • Pixel-perfect ink & highlighters       • Outlines & paragraphs as text
   • Overlapping shapes & annotations       • Asset links & tags
   • 60 FPS PixiJS canvas rendering         • Full-text search & graph view
```

- **Spatial View is the Fidelity Representation**: It renders exact coordinates, freeform placement, ink handwriting, and overlapping layers.
- **Markdown View is the Semantic Projection**: It extracts searchable text, headings, and asset references into standard Markdown for Obsidian search and linking.
- **Non-Destructive Ingestion**: The plugin **never writes back into Microsoft's binary `.one` format**. All user edits are saved directly into the `.onecanvas.json` sidecar.

---

## 4. Platform & Hardware Requirements

- **Platform**: **Desktop Only** (Windows, macOS, Linux).
  * *Reason*: Processing multi-gigabyte `.onepkg` archives and binary stream parsing relies on Node.js buffer and file system APIs available in Obsidian Desktop.
- **Graphics / Rendering**: Requires WebGL 2.0 support (standard across modern Chromium/Electron runtimes).
- **Minimum Obsidian Version**: `1.5.0`

---

## ⚖️ Trademark Notice & Legal Disclaimer

*Microsoft OneNote, OneNote, and Microsoft Office are trademarks or registered trademarks of Microsoft Corporation in the United States and/or other countries. OneNote2Obsidian is an independent open-source project and is neither affiliated with, endorsed by, nor sponsored by Microsoft Corporation.*

