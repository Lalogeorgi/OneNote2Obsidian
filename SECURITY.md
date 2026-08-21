# Security Policy

## 🔒 Supported Versions

| Version | Supported |
| :--- | :--- |
| `0.1.x` (Alpha) | ✅ Yes |
| `< 0.1.0` | ❌ No |

---

## 🛡️ Security Architecture & Threat Model

OneNote2Obsidian enforces a strict **Zero-Trust Security Model** when ingesting and parsing external files:

1. **Untrusted Archive Sandbox**:
   - Extraction of `.onepkg` MSCF Cabinet archives takes place in an isolated temporary directory.
   - All extracted entries are sanitized against directory traversal attacks (`../`, `..\`), absolute paths (`/`, `\\`), and Windows drive letters (`C:\`).
   - Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) and control characters (`\x00-\x1F`) are strictly blocked.
2. **Decompression Bomb Defense**:
   - Enforces strict upper thresholds: Max 5,000 files, max 100x compression expansion ratio, max 2GB single file, and max 16 directory nesting levels.
3. **Local-Only Privacy**:
   - The plugin operates 100% locally and offline.
   - No analytics, telemetry, remote crash reporting, or external network requests are executed.
4. **DOM XSS Sanitization**:
   - Converted OneNote HTML overlays are sanitized with DOMPurify before DOM insertion to prevent script execution.

---

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability or potential exploit in OneNote2Obsidian:

1. **Do NOT open a public GitHub issue.**
2. Please report the vulnerability privately by opening a [GitHub Security Advisory](https://github.com/Lalogeorgi/OneNote2Obsidian/security/advisories/new) or contacting the maintainers directly via email.
3. Include:
   - A description of the vulnerability and its potential impact.
   - Minimal reproduction steps or a proof-of-concept file (sanitize any private information).
   - Any suggested remediations.

We will review reports promptly and publish patches in a timely release.
