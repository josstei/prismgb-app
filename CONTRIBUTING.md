# Contributing to PrismGB

Thank you for your interest in contributing to PrismGB! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
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

```bash
# Debian/Ubuntu
sudo apt-get install libusb-1.0-0-dev libudev-dev

# Fedora
sudo dnf install libusb-devel systemd-devel

# Arch
sudo pacman -S libusb
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
npm run build            # Build for current platform
npm run lint             # Check for linting errors
npm run lint:fix         # Auto-fix linting issues
npm test                 # Run tests in watch mode
npm run test:run         # Run tests once
npm run test:coverage    # Run tests with coverage report
```

### Project Structure

```
src/
├── app/                # Electron processes
│   ├── main/           # Main process (Node.js)
│   ├── renderer/       # Renderer process (browser)
│   │   ├── application/  # AppOrchestrator, AppState
│   │   └── assets/       # Styles, fonts
│   └── preload/        # Preload bridge
├── features/           # Domain features
│   ├── capture/        # Screenshot and recording
│   ├── devices/        # Device detection, adapters
│   ├── settings/       # User preferences
│   ├── streaming/      # Video streaming, rendering
│   └── updates/        # Auto-update
├── infrastructure/     # Shared infrastructure
│   ├── browser/        # Browser API abstractions
│   ├── di/             # ServiceContainer
│   ├── events/         # EventBus
│   ├── ipc/            # IPC channels
│   └── logging/        # Logger factories
├── shared/             # Shared utilities
│   ├── base/           # BaseService, BaseOrchestrator
│   ├── config/         # Constants, selectors
│   ├── interfaces/     # Core interfaces
│   ├── lib/            # Errors, file-download
│   └── utils/          # Formatters, caches
└── ui/                 # UI layer
    ├── components/     # Reusable components
    ├── controller/     # UIController, factories
    ├── effects/        # Visual effects
    └── orchestration/  # UI setup, event handler
```

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

- **pre-commit**: Runs the full test suite
- **commit-msg**: Validates commit message format

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
   npm run test:run
   ```

4. **Push your branch** and open a pull request

5. **Fill out the PR template** with all relevant information

6. **Address review feedback** promptly

### PR Requirements

All PRs must pass:

- Linting (`npm run lint`)
- Tests (`npm run test:run`)
- Security audit (`npm audit --audit-level=high`)
- Commit message validation (conventional commits)

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

### File Naming Convention

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
- If filename contains type word with hyphen, use dot: `profile-registry.js` → `profile.registry.js`
- Entry points (`index.js`) and DI containers (`container.js`) are exceptions

### Example Service

```javascript
import { BaseService } from '@/shared/base/service.js';

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
npm run test:run         # Single run
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run test:coverage    # With coverage report
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
