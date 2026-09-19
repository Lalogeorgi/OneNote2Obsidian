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
- **License**: Apache 2.0 / MPL 2.0 (Dual-Licensed)
- **Copyright**: (c) 2014-2026 Mario Heiderich, Cure53
- **Usage**: Strict HTML sanitization of converted OneNote rich text and paragraph HTML overlays before DOM mounting, preventing XSS and script execution.

```
Copyright 2014-2026 Mario Heiderich, Cure53

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

### RBush
- **Version**: `^4.0.1`
- **Homepage**: [https://github.com/mourner/rbush](https://github.com/mourner/rbush)
- **License**: MIT License
- **Copyright**: (c) 2013-2026 Volodymyr Agafonkin
- **Usage**: 2D R-Tree spatial indexing for bounding box candidate retrieval, selection, and viewport culling.

```
MIT License

Copyright (c) 2024 Volodymyr Agafonkin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

### Lucide & Feather Icons
- **Homepage**: [https://lucide.dev/](https://lucide.dev/) / [https://feathericons.com/](https://feathericons.com/)
- **License**: ISC License / MIT License
- **Copyright**: (c) 2022-2026 Lucide Contributors / (c) 2013-2026 Cole Bemis
- **Usage**: Geometric vector SVG icon paths embedded in ribbon navigation, text formatting toolbar, and sticky note action controls.

```
ISC License

Copyright (c) 2022-2026 Lucide Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

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
