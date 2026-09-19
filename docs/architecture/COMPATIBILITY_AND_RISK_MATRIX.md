# OneNote Compatibility & Technical Risk Matrix

**Auditor:** Senior Document & Graphics Systems Engineer  
**Scope:** OneNote File Formats (`.one`, `.onetoc2`, `.onepkg`), Specifications (`[MS-ONE]`, `[MS-ONESTORE]`, `[MS-ISF]`)

---

## 1. Microsoft OneNote Version & Format Compatibility Matrix

| OneNote Version / Origin | File Extension | Internal File Format | Phase 1 Status | Technical Challenges & Mitigations |
| :--- | :---: | :---: | :---: | :--- |
| **OneNote 2016 / 2019 / 2021 / M365 Desktop** | `.one`, `.onetoc2` | OneNote 2010-2016 Revision Store (`[MS-ONESTORE]`) | **Full Support** | Modern revision tree with compact IDs. 100% supported by `onenote_parser`. |
| **OneNote 2010** | `.one`, `.onetoc2` | OneNote 2010 Revision Store | **Full Support** | Identical underlying revision store container. |
| **OneNote Packages** | `.onepkg` | Microsoft Cabinet Container (MSCF) bundling `.onetoc2` and `.one` | **Full Support** | Extracted via pure Rust/WASM MSZIP/LZX decompressor in memory. |
| **OneNote 2007** | `.one` | Legacy 2007 Storage Schema | **Beta Support** | Schema differences in property IDs. Supported with fallback property mapping. |
| **OneNote 2003** | `.one` | Legacy 2003 Single-File Schema | **Not Supported** | Obsolete format; Microsoft officially dropped support in 2016. User is prompted to convert in OneNote 2016. |
| **OneNote for Windows 10 (UWP)** | Cloud-only (OneDrive) | Cloud Graph API / Local Cache | **Via Export** | UWP app stores notes in proprietary cloud cache; user exports via Desktop OneNote or OneDrive Web export. |
| **OneNote for Mac / iPad / Web** | `.onepkg` (via OneDrive export) | Standard OneNote 2010-2016 Package | **Full Support** | Exported `.onepkg` archives from OneDrive web UI are standard CAB containers. |

---

## 2. OneNote Feature & Spatial Element Support Matrix

| Visual Element / Semantic Feature | MS Specification Node / Property | Rendering & Extraction Strategy | Fidelity Level |
| :--- | :--- | :--- | :---: |
| **Notebook Hierarchy & Sections** | `[MS-ONESTORE]` `.onetoc2` | Section groups and sections mapped to Obsidian folders. | 100% |
| **Freeform Spatial Outlines** | `jcidOutlineElement`, `jcidOutlineGroup` | Rendered at exact $(X, Y, W, H)$ bounds with synchronized DOM overlay. | 100% |
| **Rich Text Typography** | `jcidRichText`, `FontSize`, `Bold`, `Italic`, `FontColor` | CSS-styled DOM spans & PixiJS text renderers. | 98% |
| **Bullet & Numbered Lists** | `IndentLevel`, `NumberingFormat` | Native HTML hierarchical lists with OneNote indent geometry. | 100% |
| **To-Do Checkboxes & Tags** | `jcidRichText` Tag property | Interactive `- [ ]` checkboxes synchronized with Markdown. | 100% |
| **Raster Images (PNG, JPG, BMP)** | `jcidImage`, `PictureContainer` | PixiJS `Sprite` with Web Worker `ImageBitmap` texture streaming. | 100% |
| **Vector Printouts (EMF/WMF)** | `jcidImage` EMF stream | Transcoded to PNG via parser or rendered as high-res bitmap. | 95% |
| **Handwriting & Vector Ink** | `[MS-ISF]`, `jcidInk` | Catmull-Rom smoothed spline curves rendered as GPU triangle strip meshes. | 99% |
| **Highlighter Strokes** | `jcidInk` with Highlighter flag | Rendered on bottom ink layer using `BLEND_MODES.MULTIPLY`. | 100% |
| **Tables & Nested Data** | `jcidTable`, `jcidTableRow`, `jcidTableCell` | Multi-column grid containers with borders and recursive cell layout. | 98% |
| **File Attachments** | `jcidEmbeddedFileDef`, `EmbeddedFileContainer` | Extracted into Vault assets folder with clickable attachment node. | 100% |
| **Page Rule & Grid Lines** | `PageBackgroundRuleLines` | GPU fragment shader generating procedural college rule and grid lines. | 100% |
| **Overlapping Z-Order Objects** | `ZOrder`, `CreationIndex` | Explicit PixiJS container layer ordering and `zIndex` sorting. | 100% |
| **Internal Page Hyperlinks** | `HyperlinkUrl`, `OneNoteGUID` | Resolved to Obsidian internal `[[Wikilinks]]`. | 100% |
| **Password-Protected Sections** | Crypto Descriptor | Detected on parse; user prompted for password in Phase 2. | Phase 2 |

---

## 3. Comprehensive Technical Risk Register

```
┌─────────┬──────────────────────────────────┬──────────┬────────┬──────────────────────────────────────────┐
│ Risk ID │ Risk Description                 │ Severity │ Prob.  │ Mitigation Strategy                      │
├─────────┼──────────────────────────────────┼──────────┼────────┼──────────────────────────────────────────┤
│ RSK-01  │ GPU VRAM Exhaustion on Large PDF │ HIGH     │ HIGH   │ Frustum culling, LRU 256MB VRAM limit,   │
│         │ Printout Notebooks (100+ pages)  │          │        │ off-screen texture unloading via RBush.  │
├─────────┼──────────────────────────────────┼──────────┼────────┼──────────────────────────────────────────┤
│ RSK-02  │ GPL License Contamination from   │ CRITICAL │ LOW    │ Zero code reuse from OneNoteViewer; use  │
│         │ Linux viewer components          │          │        │ MPL-2.0 parser in isolated WASM crate.   │
├─────────┼──────────────────────────────────┼──────────┼────────┼──────────────────────────────────────────┤
│ RSK-03  │ Text Layout & Word-Wrap Metric   │ MEDIUM   │ HIGH   │ DOM overlay handles active text layout;  │
│         │ Discrepancies between OSs        │          │        │ font metrics pre-measured via Canvas 2D. │
├─────────┼──────────────────────────────────┼──────────┼────────┼──────────────────────────────────────────┤
│ RSK-04  │ WASM 32-bit Memory Ceiling on    │ HIGH     │ MEDIUM │ Stream large `.onepkg` files chunk-by-   │
│         │ Multi-Gigabyte `.onepkg` Files   │          │        │ chunk; offload decompression to Node.js. │
├─────────┼──────────────────────────────────┼──────────┼────────┼──────────────────────────────────────────┤
│ RSK-05  │ WebGL Context Loss on Sleep /    │ MEDIUM   │ MEDIUM │ Implement auto-recovery recreating scene │
│         │ Display Sleep in Electron        │          │        │ graph from immutable PageScene state.    │
├─────────┼──────────────────────────────────┼──────────┼────────┼──────────────────────────────────────────┤
│ RSK-06  │ Corrupted or Truncated OneNote   │ MEDIUM   │ MEDIUM │ Safe Rust error handling (Result/Option) │
│         │ Files Causing Panics             │          │        │ with clear UI error recovery notices.    │
├─────────┼──────────────────────────────────┼──────────┼────────┼──────────────────────────────────────────┤
│ RSK-07  │ Handwriting / Text Layer Mis-    │ MEDIUM   │ LOW    │ Implement exact coordinate matrix scale  │
│         │ alignment in Complex Transformed │          │        │ matching [MS-ISF] Section 2.2 transforms.│
└─────────┴──────────────────────────────────┴──────────┴────────┴──────────────────────────────────────────┘
```
