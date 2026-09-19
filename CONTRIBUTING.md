# Contributing to OneNote2Obsidian

Thank you for your interest in contributing to **OneNote2Obsidian**! We welcome bug reports, feature suggestions, documentation improvements, and pull requests.

---

## 🏗️ Architecture Principles & Module Boundaries

Before submitting code changes, please review the project's core architectural guidelines:

1. **Decoupled Renderer Abstraction**: The domain model (`src/model/`) and binary ingestion (`src/parser/`) must have **zero dependency on PixiJS concrete types**.
2. **Dual-Representation Model**:
   - The spatial canvas representation (`.onecanvas.json`) is the fidelity source of truth.
   - The Markdown projection (`.md`) is a semantic projection for Obsidian search and linking.
3. **Immutable Source Provenance**: Never attempt to write modifications back into Microsoft's proprietary binary `.one` files.
4. **Zero-Trust Security**: Treat all incoming archives and binary streams as untrusted. Never bypass path sanitization or payload limits.
5. **No Native Binary Bloat**: All parsers must remain clean TypeScript without requiring unapproved Rust/C++ native addons or network dependencies.

---

## 🛠️ Local Development Setup

### Prerequisites
- Node.js `20.x` or later
- `npm`

### Setup Instructions
```bash
# Clone the repository
git clone https://github.com/Lalogeorgi/OneNote2Obsidian.git
cd OneNote2Obsidian

# Install dependencies
npm install

# Run continuous watch mode during development
npm run dev

# Run all test suites
npm test

# Run strict typecheck and production verification
npm run check
```

---

## 🧪 Testing Guidelines

- Every new parser capability, command, or gizmo feature must be accompanied by unit tests in `tests/`.
- Run `npm test` to execute the full 67-suite automated test matrix (340 tests) before creating a Pull Request.
- **Do not commit real, private, or copyrighted OneNote files as test fixtures.** Use synthetic binary fixtures created with `BinaryFixtureGenerator` and `AdversarialCabGenerator`.

---

## 📋 Pull Request Process

1. Fork the repository and create a descriptive feature branch (e.g. `feat/pen-smoothing-preset` or `fix/cab-boundary-check`).
2. Ensure code passes formatting (`npm run format`), linting (`npm run lint`), and typechecking (`npm run typecheck`).
3. Ensure all tests pass (`npm test`).
4. Write a clear, concise Pull Request description explaining what the change accomplishes and any architectural considerations.
5. Link any related GitHub issues.

---

## 🤝 Code of Conduct

All contributors are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Please be respectful and constructive in all community interactions.
