# Development Guide

This guide covers building PrismGB from source and local development setup.

## Prerequisites

- [Node.js](https://nodejs.org/) v22 LTS or higher
- npm (included with Node.js)
- Platform-specific USB libraries:
  - **Linux:** `sudo apt-get install libusb-1.0-0-dev libudev-dev`
  - **macOS:** `brew install libusb`
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

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with Electron hot reload |
| `npm run build` | Build for current platform |
| `npm run build:win` | Build for Windows |
| `npm run build:mac` | Build for macOS |
| `npm run build:linux` | Build for Linux |
| `npm run lint` | Check for linting errors |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm test` | Run tests in watch mode |
| `npm run test:run` | Run all tests once |
| `npm run test:coverage` | Run tests with coverage report |

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for code style, commit conventions, and pull request guidelines.
