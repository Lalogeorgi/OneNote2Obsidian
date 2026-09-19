# Obsidian Community Plugin Submission & Release Checklist

This document serves as the release audit guide for submitting **OneNote2Obsidian** to the official Obsidian Community Plugins directory (`obsidianmd/obsidian-releases`).

---

## 1. Pre-Release Technical Audit

- [x] **`manifest.json` Verification**:
  - `id`: `onenote2obsidian`
  - `name`: `OneNote2Obsidian`
  - `version`: `0.2.0-alpha` (semver compliant)
  - `minAppVersion`: `1.5.0`
  - `description`: Clear, accurate, concise (< 250 characters)
  - `isDesktopOnly`: `true` (correctly set due to CAB archive extraction and binary stream processing)
- [x] **`versions.json`**:
  - `{"0.1.0": "1.5.0", "0.2.0-alpha": "1.5.0"}`
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

When creating a GitHub Release for tag `0.2.0-alpha`, the following 3 files must be attached directly to the release:

1. `main.js` (compiled production bundle)
2. `manifest.json` (plugin manifest)
3. `styles.css` (plugin styles)

---

## 3. Obsidian Releases Pull Request Template

Submit a Pull Request to `https://github.com/obsidianmd/obsidian-releases` adding the following entry to `community-plugins.json`:

```json
{
  "id": "onenote2obsidian",
  "name": "OneNote2Obsidian",
  "author": "OneNote2Obsidian Contributors",
  "description": "High-fidelity spatial import and GPU rendering of Microsoft OneNote notebooks in Obsidian using PixiJS.",
  "repo": "Lalogeorgi/OneNote2Obsidian"
}
```

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
