# Supported OneNote Producers, Versions & Format Specification

**Document Version:** 1.0  
**Status:** PRODUCTION REFERENCE  
**Target Parser:** `OneNoteParserAdapter`

---

## 1. Supported OneNote Versions & Producers

| OneNote Application / Version | Operating System | File Extensions | Internal File Format | Compatibility Level |
| :--- | :--- | :---: | :---: | :---: |
| **Microsoft 365 Desktop (OneNote)** | Windows | `.one`, `.onetoc2`, `.onepkg` | MS-ONESTORE 2010-2016 Schema | **100% Native** |
| **OneNote 2021 / 2019 / 2016** | Windows | `.one`, `.onetoc2`, `.onepkg` | MS-ONESTORE 2010-2016 Schema | **100% Native** |
| **OneNote 2013 / 2010** | Windows | `.one`, `.onetoc2`, `.onepkg` | MS-ONESTORE 2010 Schema | **100% Native** |
| **OneDrive Web Export (.onepkg)** | Web / macOS | `.onepkg` | MS-CAB bundling 2010-2016 sections | **100% Native** |
| **OneNote for Mac (Exported)** | macOS | `.onepkg` | Standard Microsoft Cabinet | **100% Native** |
| **OneNote 2007** | Windows | `.one`, `.onetoc2` | Legacy 2007 Revision Store | **Fallback Mode** |
| **OneNote 2003** | Windows | `.one` | Legacy Single-File Format | **Deprecated** |

---

## 2. File Format Header Signatures & Magic Bytes

| File Type | Magic Signature / GUID | Byte Sequence (Little-Endian Hex) |
| :--- | :--- | :--- |
| **OneNote Section 2010+ (`.one`)** | `{7B5C52E4-D88C-4DA7-AEB1-5378D02996D3}` | `E4 52 5C 7B 8C D8 A7 4D AE B1 53 78 D0 29 96 D3` |
| **Table of Contents (`.onetoc2`)** | `{43FF2DF1-EF57-4C06-9733-9526D6108381}` | `F1 2D FF 43 57 EF 06 4C 97 33 95 26 D6 10 83 81` |
| **Package Archive (`.onepkg`)** | `MSCF` (Cabinet Header) | `4D 53 43 46` |
| **Legacy Section 2007 (`.one`)** | `{44F99F07-A595-46F2-B091-B88E75C41DF0}` | `07 9F F9 44 95 A5 F2 46 B0 91 B8 8E 75 C4 1D F0` |
| **Legacy TOC 2007 (`.onetoc2`)** | `{977114D2-83FD-4767-8C7E-28F8DFCEB20C}` | `D2 14 71 97 FD 83 67 47 8C 7E 28 F8 DF CE B2 0C` |

---

## 3. Supported Object Spaces & JCID Mapping

| OneNote JCID | Semantic Entity | Canonical Type | Coordinate Normalization |
| :--- | :--- | :--- | :--- |
| `0x00060007` | Page Root | `CanonicalPage` | Title, timestamps, background paper, rule lines. |
| `0x00060008` | Title Container | `PageTitle` | Extracted into page title metadata and header. |
| `0x0006000C` / `0x0006000D` | Outline / Rich Text | `CanonicalOutline` | 96 DPI CSS coordinates; font size, bold, italic, color, checkboxes. |
| `0x00060012` | Bitmap Image | `CanonicalImage` | PNG, JPEG, GIF, BMP extracted into Vault asset BLOBs. |
| `0x00060014` | Handwriting / Ink | `CanonicalInkStrokeGroup` | ISF vector point streams, Catmull-Rom splines, highlighter multiply blending. |
| `0x0006001B` | Table | `CanonicalTable` | Multi-column grid, rows, cell outlines. |
| `0x00060020` | Attachment | `CanonicalAttachment` | Embedded file payload and original file name. |
| `0x00060024` | Geometric Shape | `CanonicalShape` | Rectangles, ellipses, arrows, stroke/fill colors. |

---

## 4. Malformed-Input & Corruption Guardrails

1. **Buffer Length Guards**: Rejects any file payload under 16 bytes immediately before parsing.
2. **Bounds-Checked Binary Reader**: All offsets, integer reads, and string decoders validate buffer bounds and raise descriptive `RangeError` / `ParserError` instances.
3. **Isolated Object Parsing**: If an individual object or ink stroke is corrupted, the parser logs a structured warning (`DiagnosticCode.MODEL_ORPHAN_ELEMENT`) and continues parsing subsequent sibling nodes without crashing the page.
4. **Cooperative Cancellation**: Long-running archive decompressions and multi-megabyte parsing loops check `cancellationToken.throwIfCancelled()` at every chunk boundary.
