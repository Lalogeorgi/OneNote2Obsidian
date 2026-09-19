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
2. Please report the vulnerability privately by submitting a [GitHub Security Advisory](https://github.com/Lalogeorgi/OneNote2Obsidian/security/advisories/new).
3. If you cannot access GitHub Security Advisories, contact the repository maintainer directly through the GitHub profile at [https://github.com/Lalogeorgi](https://github.com/Lalogeorgi).
4. Please include:
   - A description of the vulnerability and its potential impact.
   - Minimal reproduction steps or a synthetic proof-of-concept file (do not submit files containing private personal data).
   - Any suggested remediations or mitigations.

### Response Commitment
- **Initial Acknowledgement**: Within 48 hours of receipt.
- **Assessment & Triage**: Within 5 business days.
- **Remediation & Patch**: Coordinated disclosure release published as soon as a verified fix is validated.

