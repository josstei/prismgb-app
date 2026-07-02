# Development Guide

This guide covers building PrismGB from source and local development setup.

## Prerequisites

- [Node.js](https://nodejs.org/) v22 LTS or higher
- npm (included with Node.js)
- Platform-specific build tools and USB libraries:
  - **Linux:** `sudo apt-get install build-essential python3 libusb-1.0-0-dev libudev-dev`
  - **macOS:** `brew install libusb` (Xcode Command Line Tools required)
  - **Windows:** No additional dependencies required

## Getting Started

```bash
# Clone the repository
git clone https://github.com/josstei/prismgb-app.git
cd prismgb-app

# Install dependencies
npm install

# Start development server
npm run dev
```

## Project Docs

- Feature map: `docs/feature-map.md`
- Naming conventions: `docs/naming-conventions.md`
- CI/CD workflows: `docs/ci-cd-workflows.md`
- Architecture diagrams: `docs/architecture-diagrams.md`
- Architecture onboarding: `docs/architecture-diagrams-onboarding.md`

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with Electron hot reload (port 3000) |
| `npm run preview` | Preview the renderer build |
| `npm run start` | Launch Electron from `dist/` output |
| `npm run build` | Build and package for current platform |
| `npm run build:vite` | Build renderer bundle only |
| `npm run build:win` | Build for Windows |
| `npm run build:mac` | Build for macOS |
| `npm run build:linux` | Build for Linux |
| `npm run lint` | ESLint + architecture boundary checks (JS/TS import boundaries) |
| `npm run lint:fix` | Auto-fix linting issues + boundary checks |
| `npm run typecheck:app` | Typecheck app sources using `tsconfig.app.json` |
| `npm run typecheck:gpu` | Typecheck `@prismgb/gpu` workspace |
| `npm run typecheck` | Run app + GPU typecheck gates |
| `npm test` | Run tests in watch mode |
| `npm run test:ui` | Run Vitest UI |
| `npm run test:run` | Run all tests once |
| `npm run test:unit` | Run unit tests only |
| `npm run test:integration` | Run integration tests only |
| `npm run test:integration:watch` | Watch integration tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:smoke` | Run smoke test against built app |
| `npm run generate-icons` | Regenerate app icons |

## Building for Distribution

```bash
# Build for your current platform
npm run build

# Build for specific platforms
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

Build artifacts are output to the `release/` directory.

## Environment Variables

- `PRISMGB_DISABLE_GPU=1` disables hardware acceleration (useful for GPU issues).

## Build Outputs

- `dist/` contains the renderer, main, and preload bundles.
- `release/` contains packaged application artifacts.

## Smoke Test

Run after a local build to validate startup behavior:

```bash
npm run build
npm run test:smoke
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for code style, commit conventions, and pull request guidelines.
