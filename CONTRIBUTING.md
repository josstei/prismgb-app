# Contributing to PrismGB

Thank you for your interest in contributing to PrismGB! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Dependency Updates](#dependency-updates)
- [Code Style](#code-style)
- [Naming Conventions](#naming-conventions)
- [Testing](#testing)

## Code of Conduct

Please be respectful and constructive in all interactions. We aim to foster a welcoming environment for all contributors.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Set up the development environment (see below)
4. Create a feature branch from `main`
5. Make your changes
6. Submit a pull request

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v22 LTS or higher
- npm (included with Node.js)
- Git

### Linux Dependencies

Native modules (like `usb-detection`) require build tools and development libraries:

```bash
# Debian/Ubuntu
sudo apt-get install build-essential python3 libusb-1.0-0-dev libudev-dev

# Fedora
sudo dnf install gcc gcc-c++ make python3 libusb-devel systemd-devel

# Arch
sudo pacman -S base-devel python libusb
```

### macOS Dependencies

```bash
brew install libusb
```

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/prismgb-app.git
cd prismgb-app

# Install dependencies
npm install

# Start development server
npm run dev
```

## Development Workflow

### Available Scripts

```bash
npm run dev              # Start Vite dev server with Electron
npm run build            # Build and package for current platform
npm run lint             # Check for linting errors
npm run test:coverage    # Run tests with coverage report
npm run test:integration # Run integration tests
npm run test:smoke        # Run smoke test against built app
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for the full script list and local setup notes.

## Project Structure

```
src/
├── main/               # Electron main process
├── preload/            # Context bridge APIs
├── renderer/           # Renderer process and UI
│   ├── application/    # App orchestrators and state
│   ├── assets/         # Styles, fonts, images
│   ├── features/       # Domain features (capture, devices, notes, settings, streaming, updates)
│   ├── infrastructure/ # Event bus, logging, adapters
│   ├── ui/             # Templates, components, orchestration
│   └── lib/            # Renderer-only utilities
├── shared/             # Shared utilities and config
tests/                  # Unit and integration tests
docs/                   # Architecture and feature docs
scripts/                # Build and tooling scripts
```

## Documentation

- Development guide: `DEVELOPMENT.md`
- Feature map: `docs/feature-map.md`
- Naming conventions: `docs/naming-conventions.md`
- Architecture diagrams: `docs/architecture-diagrams.md`
- Architecture onboarding: `docs/architecture-diagrams-onboarding.md`

## Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages. This enables automated changelog generation and semantic versioning.

### Commit Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Commit Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes |
| `style` | Code style changes (formatting, semicolons, etc.) |
| `refactor` | Code changes that neither fix bugs nor add features |
| `perf` | Performance improvements |
| `test` | Adding or updating tests |
| `build` | Build system or dependency changes |
| `ci` | CI/CD configuration changes |
| `chore` | Other changes that don't modify src or test files |
| `revert` | Reverts a previous commit |

### Examples

```bash
feat(streaming): add support for custom resolutions
fix(devices): resolve USB detection on Linux
docs: update installation instructions
ci: add security scanning to PR workflow
```

### Git Hooks

This project uses Husky to enforce commit conventions:

- **pre-commit**: Runs `npm test` (Vitest watch mode)
- **commit-msg**: Validates commit message format via commitlint

If commits fail validation, check your commit message format against the guidelines above.

## Pull Request Process

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes** following our code style and commit guidelines

3. **Run quality checks** before pushing:
   ```bash
   npm run lint
   npm run test:coverage
   npm run test:integration
   ```

4. **Push your branch** and open a pull request

5. **Fill out the PR template** with all relevant information

6. **Address review feedback** promptly

### PR Requirements

All PRs must pass:

- Linting (`npm run lint`)
- Tests with coverage (`npm run test:coverage`)
- Integration tests (`npm run test:integration`)
- Build smoke check (`npm run build:vite`)
- Conventional commit validation (PR title and commits)

Optional: add the `full-ci` label on a PR to run macOS and Windows validation.

## Dependency Updates

Routine dependency bumps are handled automatically by Dependabot (`.github/dependabot.yml`). Patch updates auto-merge; minor and major updates are labeled `needs-review`.

### Packages excluded from automatic major bumps

Major-version updates for these packages are **ignored** by Dependabot and must be performed manually as coordinated upgrades:

- `electron`, `electron-builder`, `electron-vite`, `vite` — desktop build toolchain
- `typescript`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` — type-check toolchain

### Upgrading TypeScript (major)

A TypeScript major bump touches three things at once: the compiler, the lint toolchain, and the strict type-debt baseline. Do it in one branch:

1. **Verify ecosystem support.** Check the peer-dependency ranges on `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `vitest`, `@vitest/coverage-v8`, and `happy-dom`. If any of them does not yet support the new TS major, wait — do not partially upgrade.
2. **Bump in lockstep.** Update `typescript` in both `package.json` and `packages/prismgb-gpu/package.json`, and bump the lint/test peers in the same commit. The two workspace `typescript` ranges must agree on a major.
3. **Review tsconfig.** Inspect `tsconfig.base.json`, `tsconfig.app.json`, and `packages/prismgb-gpu/tsconfig.json` for `target` / `lib` / `module` values deprecated by the new release.
4. **Re-baseline the type-debt allowlist.** Run `npm run typecheck:app:allowlist` to regenerate `scripts/type-debt-allowlist.json`. Manually review any new diagnostic codes — do not silently widen the allowlist.
5. **Run the full local gate before pushing:**
   ```bash
   npm run lint
   npm run typecheck
   npm run build:vite
   npm run test:coverage
   npm run test:integration
   ```

## Code Style

We use ESLint for code style enforcement:

- 2-space indentation
- Single quotes for strings
- Semicolons required
- Unix line endings (LF)

### Key Patterns

- **Services** extend `BaseService` for business logic
- **Orchestrators** extend `BaseOrchestrator` for coordination
- Use `EventBus` for cross-service communication
- Use dependency injection via the container

## Naming Conventions

See `docs/naming-conventions.md` for the full guide. Highlights are below.

### File Naming

All JavaScript files follow the pattern: `{name}.{type}.js`

| Suffix | Purpose |
|--------|---------|
| `.service.js` | Business logic (extends `BaseService`) |
| `.orchestrator.js` | Lifecycle coordination (extends `BaseOrchestrator`) |
| `.adapter.js` | External API wrappers |
| `.component.js` | UI components |
| `.handler.js` | IPC handlers |
| `.factory.js` | Instance creation |
| `.bridge.js` | Cross-module coordination |
| `.registry.js` | Collection management |
| `.interface.js` | Interface definitions |
| `.worker.js` | Web Workers |
| `.state.js` | State management |
| `.config.js` | Configuration constants |
| `.profile.js` | Device profiles |
| `.utils.js` | Pure utility functions |
| `.class.js` | Plain classes (no DI) |
| `.base.js` | Abstract base classes |

**Rules:**
- Use kebab-case for filenames
- Type suffix uses dot separator: `device-profile.registry.js`, `streaming-worker-protocol.config.js`
- Abstract base classes use `{type}.base.js` pattern: `service.base.js`, `orchestrator.base.js`
- Entry points (`index.js`) and DI containers (`container.js`) are exceptions

### Example Service

```javascript
import { BaseService } from '@shared/base/service.base.js';

export class MyService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory', 'requiredDep'], 'MyService');
  }

  myMethod() {
    this.logger.info('Doing something');
    this.eventBus.publish('my:event', { data: 'value' });
  }
}
```

## Testing

We use [Vitest](https://vitest.dev/) for testing.

### Running Tests

```bash
npm test                 # Watch mode
npm run test:ui          # Vitest UI
npm run test:run         # Single run
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run test:integration:watch # Watch integration tests
npm run test:coverage    # With coverage report
npm run test:smoke       # Smoke test (requires build)
```

### Coverage Requirements

- Lines: 80%
- Functions: 80%
- Statements: 80%
- Branches: 75%

### Writing Tests

Tests should be placed in:
- `tests/unit/` for unit tests
- `tests/integration/` for integration tests
- Or co-located with source files as `*.test.js`

```javascript
import { describe, it, expect, vi } from 'vitest';
import { MyService } from './MyService.js';

describe('MyService', () => {
  it('should do something', () => {
    const mockDeps = {
      eventBus: { publish: vi.fn(), subscribe: vi.fn() },
      loggerFactory: { createLogger: () => ({ info: vi.fn() }) }
    };

    const service = new MyService(mockDeps);
    expect(service).toBeDefined();
  });
});
```

## Questions?

If you have questions about contributing, please open an issue for discussion.

Thank you for contributing to PrismGB!
