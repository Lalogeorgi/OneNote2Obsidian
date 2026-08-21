# Compatibility, Supported Features & Limitations

This document outlines the feature support matrix, platform availability, format compatibility, and known technical limitations for the **OneNote Spatial Engine** plugin.

---

## 1. Supported Feature Matrix

| Category | Feature | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Document Hierarchy** | Notebooks (`.onetoc2`) | ✅ Supported | Reconstructs notebook tree, sections, and section groups. |
| | Sections (`.one`) | ✅ Supported | Full parsing of OneNote 2010–2016 / 365 format. |
| | Packages (`.onepkg`) | ✅ Supported | Unpacks MSCF CAB archives safely inside a staging sandbox. |
| **Spatial Elements** | Freeform Outlines (Text) | ✅ Supported | Position, width, font size, bold, italic, color, and bullet lists. |
| | Vector Handwriting / Ink | ✅ Supported | Pen strokes, highlighters, pressure, and Catmull-Rom smoothing. |
| | Images & Graphics | ✅ Supported | PNG, JPEG, GIF, BMP with SHA-256 binary deduplication. |
| | Shapes & Geometry | ✅ Supported | Rectangles, ellipses, arrows, lines, callout boxes. |
| | Tables | ✅ Supported | Multi-row / multi-column grids with styled cell contents. |
| | File Attachments | ✅ Supported | Extracted to vault assets directory with link references. |
| | Page Canvas Rules | ✅ Supported | Solid background colors and ruled / grid guide lines. |
| **Interactive Canvas** | 8-Point Transform Gizmo | ✅ Supported | Translate, resize, aspect-ratio lock, multi-selection. |
| | In-place Text Editing | ✅ Supported | Double-click outline to edit rich text in DOM overlay. |
| | Live Ink Drawing & Eraser | ✅ Supported | Freehand pen, highlighter, and geometric stroke eraser. |
| | Undo / Redo Stack | ✅ Supported | Full command history with transaction grouping. |
| | Spatial Clipboard | ✅ Supported | Cut, copy, paste, and duplicate with coordinate offset. |
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
