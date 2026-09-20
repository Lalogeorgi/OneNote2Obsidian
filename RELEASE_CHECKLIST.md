# Obsidian Community Plugin Submission & Release Checklist

This document serves as the release audit guide for submitting **OneNote2Obsidian** to the official Obsidian Community Plugins directory (`obsidianmd/obsidian-releases`).

---

## 1. Pre-Release Technical Audit

- [x] **`manifest.json` Verification**:
  - `id`: `on2od` (Obsidian compliant: lowercase, no "obsidian" substring, does not end in "plugin")
  - `name`: `On2Od`
  - `version`: `0.2.0` (SemVer numeric compliant: x.y.z)
  - `minAppVersion`: `1.5.0`
  - `description`: Clear, accurate, concise (< 250 characters)
  - `author`: `Lalogeorgi`
  - `isDesktopOnly`: `true` (correctly set due to CAB archive extraction and binary stream processing)
- [x] **`versions.json`**:
  - `{"0.1.0": "1.5.0", "0.2.0": "1.5.0"}`
- [x] **Bundled Dependencies**:
  - Bundled into a single `main.js` via esbuild with externalized `obsidian` module.
  - Zero unbundled runtime `require()` calls to non-builtin modules.
- [x] **Network & Privacy**:
  - Zero external network requests or fetch calls.
  - Zero telemetry, analytics, or remote tracking.
  - 100% local, offline vault execution.
- [x] **Data Safety**:
  - Original `.one` / `.onepkg` source files remain immutable read-only provenance.
  - Vault writes use atomic temporary file buffers.
  - Path traversal and archive bomb defenses prevent unauthorized disk access.

---

## 2. Release Assets Verification

When creating a GitHub Release for tag `0.2.0`, the following 3 files must be attached directly to the release:

1. `main.js` (compiled production bundle)
2. `manifest.json` (plugin manifest)
3. `styles.css` (plugin styles)

---

## 3. Obsidian Community Directory Submission

Obsidian manages plugin submissions directly through the official developer dashboard:

1. Go to **[https://community.obsidian.md](https://community.obsidian.md)** and sign in with your GitHub account (`Lalogeorgi`).
2. Navigate to **Plugins** > **New plugin**.
3. Provide your repository URL: `https://github.com/Lalogeorgi/OneNote2Obsidian`.
4. Review policies and submit for automated validation and publishing.

---

## 4. Quality & Compatibility Verification Run

```bash
# 1. Typecheck
npm run typecheck

# 2. Linting & Code Style
npm run lint
npx prettier --check "src/**/*.{ts,css,json}"

# 3. Build production bundle
npm run build
```
