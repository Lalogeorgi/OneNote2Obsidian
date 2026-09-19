# Dependency, Provenance & Legal Licensing Report

**Audit Date:** 2026-08-21  
**Auditor:** Senior Software Architect & Open-Source Compliance Specialist  
**Target Repository:** `OneNotesToObsidian` (Evolved to `OneNote2Obsidian`)

> [!NOTE]
> **Architecture Evolution Notice**:  
> *Initial exploration (2026-08-21) considered pulling MPL-2.0 Rust crates via Cargo and compiling to WASM. However, the final production implementation chose a 100% clean-room TypeScript parser architecture directly referencing Microsoft Open Specifications (`[MS-ONE]`, `[MS-ONESTORE]`, `[MS-CAB]`, `[MS-ISF]`). Consequently, zero Rust or WASM dependencies exist in the production plugin, and the entire repository is cleanly licensed under MIT.*

---

## 1. Executive Summary & Legal Guardrails

This project involves reading proprietary and binary Microsoft document formats (`.one`, `.onetoc2`, `.onepkg`) and rendering them within the Obsidian desktop/mobile ecosystem.

To ensure **100% intellectual property cleanliness**, compliance with Obsidian Community Plugin submission rules, and freedom to license our plugin under a permissive open-source license (**MIT** or **Apache-2.0**), we have performed an in-depth audit of all upstream libraries and prior art.

---

## 2. Upstream Ecosystem Audit & Provenance

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         ECOSYSTEM PROVENANCE GRAPH                          │
 └─────────────────────────────────────────────────────────────────────────────┘
                                        │
           ┌────────────────────────────┴────────────────────────────┐
           ▼                                                         ▼
 [ msiemens/onenote.rs ]                                   [ emsi/OneNoteViewer ]
 ─────────────────────────                                 ───────────────────────
 • Crate: `onenote_parser`                                 • Desktop Linux Viewer
 • License: MPL-2.0 (Mozilla Public License 2.0)           • License: GPL-3.0-or-later
 • Scope: MS-ONE / MS-ONESTORE binary parser               • Scope: GTK4 UI, caching, index
 • Copyleft: File-Level Weak Copyleft                      • Copyleft: Strong Viral Copyleft
                                                                     │
           │                                                         │
           ▼                                                         ▼
 ┌─────────────────────────┐                               ┌───────────────────────┐
 │ PERMITTED USAGE         │                               │ RESTRICTED USAGE      │
 │ • Compile to WASM       │                               │ ❌ DO NOT COPY CODE   │
 │ • Link as dependency    │                               │ ❌ DO NOT VENDOR      │
 │ • Wrap in custom crate  │                               │ ❌ DO NOT DERIVE      │
 └─────────────────────────┘                               └───────────────────────┘
```

---

## 3. Analysis of Upstream Components

### Component A: `msiemens/onenote.rs` (`onenote_parser`)
- **Author:** Martin Siemens
- **Repository:** `https://github.com/msiemens/onenote.rs`
- **License:** **MPL-2.0 (Mozilla Public License 2.0)**
- **Legal Characteristics:**
  - MPL-2.0 is a **file-level weak copyleft license**.
  - Any direct modifications made to the source files of `onenote_parser` must remain under MPL-2.0.
  - However, when `onenote_parser` is consumed as an external dependency (via `Cargo.toml`), compiled into a WebAssembly binary, and linked against our TypeScript codebase, the surrounding project is considered a **"Larger Work"** under Section 3.3 of the MPL-2.0.
  - **Verdict:** Our plugin code, TypeScript models, PageScene layouts, and PixiJS shaders can be licensed under **MIT / Apache-2.0**.
  - **Integration Strategy:** **Linked via Cargo & Compiled to WASM**.

### Component B: `emsi/OneNoteViewer`
- **Author:** emsi
- **Repository:** `https://github.com/emsi/OneNoteViewer`
- **License:** **GPL-3.0-or-later (GNU General Public License v3.0)**
- **Legal Characteristics:**
  - GPL-3.0 is a **strong viral copyleft license**.
  - Copying, vendoring, or creating derivative TypeScript/Rust modules directly from `crates/onenote-core`, `crates/onenote-render`, or `crates/onenote-viewer` would legally obligate the entire Obsidian plugin to be licensed under GPL-3.0.
  - GPL-3.0 plugins face restrictions and community hurdles in commercial Obsidian environments.
  - **Verdict:** **Zero code reuse**. We perform an **independent clean-room implementation** of all high-level models, layout passes, and PixiJS renderers based directly on official Microsoft specifications.
  - **Permissible Knowledge Transfer:** Reading public architectural discussions, issue trackers, and Microsoft open specification citations is legally protected as independent implementation.

---

## 4. Reusability, Adaptation & Implementation Matrix

| Subsystem / Task | Upstream Source | License | Reusability Classification | Action Plan |
| :--- | :--- | :--- | :--- | :--- |
| **MS-ONESTORE Parser** | `msiemens/onenote.rs` | MPL-2.0 | **Link / Wrap** | Pull via Cargo into `crates/onenote-wasm-bridge`, compile to WASM. |
| **MS-ISF Ink Parser** | `msiemens/onenote.rs` | MPL-2.0 | **Link / Wrap** | Extract raw stroke packets from parser and pass to WASM bridge. |
| **CAB / MSZIP Extractor** | `cab` / `libflate` | MIT / Apache-2.0 | **Link / Vendor** | Compile pure Rust CAB reader into WASM module. |
| **Canonical TS Model** | Independent Architecture | MIT | **Independent Implementation** | Custom TypeScript interfaces matching modern Obsidian standards. |
| **PageScene IR** | Independent Architecture | MIT | **Independent Implementation** | Custom display list & 2D spatial layout engine. |
| **PixiJS v8 Engine** | `pixi.js` (PixiJS Foundation) | MIT | **Direct Dependency** | Standard npm package dependency. |
| **2D Spatial Index** | `rbush` / `flatbush` | MIT | **Direct Dependency** | High-speed spatial AABB bounding box indexing. |
| **Markdown Projector** | Independent Architecture | MIT | **Independent Implementation** | Generates GFM Markdown with wikilinks & frontmatter. |
| **Obsidian Plugin UI** | Obsidian API | Custom / MIT | **Independent Implementation** | Native `ItemView` and ribbon commands. |

---

## 5. Third-Party Software Dependency Manifest

```toml
# Cargo.toml (crates/onenote-wasm-bridge)
[dependencies]
# MS-ONE parser (MPL-2.0)
onenote_parser = { git = "https://github.com/msiemens/onenote.rs", rev = "8454acf2dd8217236ec17e883cbf225bd11563cd" }

# CAB extraction (MIT / Apache-2.0)
cab = "0.4.1"

# WASM bindings (MIT / Apache-2.0)
wasm-bindgen = "0.2"
js-sys = "0.3"
web-sys = "0.3"
serde = { version = "1.0", features = ["derive"] }
serde-wasm-bindgen = "0.6"
```

```json
// package.json (Plugin Root)
{
  "dependencies": {
    "pixi.js": "^8.3.0",
    "rbush": "^3.0.1",
    "dompurify": "^3.1.6"
  },
  "devDependencies": {
    "@types/dompurify": "^3.0.5",
    "@types/node": "^20.0.0",
    "@types/rbush": "^3.0.3",
    "builtin-modules": "^3.3.0",
    "esbuild": "^0.23.0",
    "obsidian": "latest",
    "typescript": "^5.5.0"
  }
}
```

---

## 6. Intellectual Property Compliance Checklist

- [x] All binary parsing is performed by MPL-2.0 or MIT crates.
- [x] No code from `emsi/OneNoteViewer` (GPL-3.0) is present in the repository.
- [x] TypeScript architecture (Canonical Model, PageScene, PixiJS Renderer) is 100% clean-room developed.
- [x] All Microsoft specification references cite official Microsoft Open Specifications (`[MS-ONE]`, `[MS-ONESTORE]`, `[MS-ISF]`) released under Microsoft's Open Specification Promise (OSP).
- [x] Plugin is eligible for clean **MIT License** publication to the Obsidian Community Plugin Directory.
