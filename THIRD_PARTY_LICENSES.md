# Third-Party Licenses & Software Provenance

This document provides copyright, license notices, and specification provenance for third-party open-source components and standards used by the **OneNote Spatial Engine** plugin for Obsidian.

---

## 1. Bundled Dependencies

### Pixi.js
- **Version**: `^8.8.1`
- **Homepage**: [https://pixijs.com/](https://pixijs.com/)
- **License**: MIT License
- **Copyright**: (c) 2013-2026 Mat Groves, Chad Engler
- **Usage**: GPU-accelerated 2D WebGL canvas scene rendering, Catmull-Rom vector ink, viewport transforms, and sprite rendering.

```
The MIT License (MIT)

Copyright (c) 2013-2026 Mat Groves, Chad Engler

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
```

---

### DOMPurify
- **Version**: `^3.2.4`
- **Homepage**: [https://github.com/cure53/DOMPurify](https://github.com/cure53/DOMPurify)
- **License**: Apache 2.0 / MPL 2.0
- **Copyright**: (c) 2014-2026 Mario Heiderich, Cure53
- **Usage**: Strict HTML sanitization of converted OneNote rich text and paragraph HTML overlays before DOM mounting, preventing XSS and script execution.

---

### RBush
- **Version**: `^4.0.1`
- **Homepage**: [https://github.com/mourner/rbush](https://github.com/mourner/rbush)
- **License**: MIT License
- **Copyright**: (c) 2013-2026 Vladimir Agafonkin
- **Usage**: 2D R-Tree spatial indexing for bounding box candidate retrieval, selection, and viewport culling.

---

## 2. Specification References & Clean-Room Ingestion

The binary file parsers (`.one`, `.onetoc2`, `.onepkg`) and Ink Serialized Format (`ISF`) decoder in this plugin were implemented in TypeScript based solely on publicly available technical specifications published under Microsoft's Open Specifications Promise:

1. **`[MS-ONE]`**: OneNote File Format Structure Specification
2. **`[MS-ONESTORE]`**: OneNote Revision Store File Format Structure Specification
3. **`[MS-CAB]`**: Cabinet File Format Structure Specification
4. **`[MS-ISF]`**: Ink Serialized Format Specification

*Note: Microsoft OneNote is a trademark of Microsoft Corporation. This plugin is an independent open-source project and is not affiliated with, sponsored, or endorsed by Microsoft.*

---

## 3. Dependency & Security Audit Summary

- **Native Binaries / WASM**: None. 100% clean TypeScript running directly in Obsidian's standard Electron / Node runtime.
- **Network Access**: None. The plugin operates entirely offline with zero outgoing network telemetry, analytics, or remote API queries.
- **Source File Immutability**: The original `.one` and `.onepkg` files are treated as immutable read-only provenance and are never modified or rewritten.
