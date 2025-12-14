# PrismGB

<p align="center">
  <img src="assets/Logo.png" alt="PrismGB Logo" width="400">
</p>

<p align="center">
  <strong>A desktop streaming and capture application for the Mod Retro Chromatic</strong>
</p>

<p align="center">
  <a href="https://github.com/josstei/prismgb-app/actions/workflows/release.yml"><img src="https://github.com/josstei/prismgb-app/actions/workflows/release.yml/badge.svg?branch=main" alt="Release"></a>
  <a href="https://github.com/josstei/prismgb-app/actions/workflows/pr.yml"><img src="https://github.com/josstei/prismgb-app/actions/workflows/pr.yml/badge.svg" alt="PR Validation"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="Platform">
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#features">Features</a> •
  <a href="#usage">Usage</a> •
  <a href="#building-from-source">Building</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

---

> **DISCLAIMER**
>
> This is an **unofficial**, community-developed application.
>
> PrismGB is not affiliated with, endorsed by, or sponsored by [Mod Retro](https://modretro.com).
> The Chromatic is a product of Mod Retro.
>
> For official Chromatic support and information, please visit [modretro.com](https://modretro.com).

---

## What is PrismGB?

PrismGB is a free, open-source desktop application that lets you stream and capture video from your [Mod Retro Chromatic](https://modretro.com) handheld gaming device. 

Connect your Chromatic via USB and enjoy your gameplay on a larger screen, take screenshots, or record your gaming sessions.

## Features

- **Live Video Streaming** - Stream your Chromatic's display to your desktop in real-time
- **Screenshot Capture** - Take instant screenshots of your gameplay
- **Video Recording** - Record your gaming sessions
- **Volume Control** - Adjust audio levels with an intuitive slider
- **Cinematic Mode** - Distraction-free fullscreen viewing
- **Fullscreen Support** - Expand to fullscreen for the best viewing experience
- **System Tray Integration** - Runs quietly in your system tray
- **Cross-Platform** - Available for Windows, macOS, and Linux

## Requirements

- A [Mod Retro Chromatic](https://modretro.com) device
- USB connection to your computer
- Windows 10+, macOS 10.15+, or Linux (Ubuntu 18.04+, Fedora, Arch, etc.)

## Installation

### Download Pre-built Releases

Download the latest release for your operating system from the [Releases](../../releases) page:

| Platform | Download |
|----------|----------|
| Windows  | `PrismGB-Setup-x.x.x.exe` (installer) or `PrismGB-x.x.x-portable.exe` |
| macOS    | `PrismGB-x.x.x-mac.dmg` |
| Linux    | `PrismGB-x.x.x-x64.AppImage`, `.deb`, or `.tar.gz` |

### Windows Installation

1. Download the installer (`.exe`) or portable version
2. Run the installer and follow the prompts
3. Launch PrismGB from the Start Menu or desktop shortcut

### macOS Installation

1. Download the `.dmg` file
2. Open the DMG and drag PrismGB to your Applications folder
3. On first launch, you may need to right-click and select "Open" to bypass Gatekeeper

### Linux Installation

**AppImage (recommended):**
```bash
chmod +x PrismGB-*.AppImage
./PrismGB-*.AppImage
```

**Debian/Ubuntu (.deb):**
```bash
sudo dpkg -i PrismGB-*.deb
sudo apt-get install -f  # Install dependencies if needed
```

**Note for Linux users:** You may need to install `libusb-1.0-0` for USB device detection:
```bash
# Debian/Ubuntu
sudo apt install libusb-1.0-0

# Fedora
sudo dnf install libusb

# Arch
sudo pacman -S libusb
```

## Usage

1. **Connect your Chromatic** to your computer via USB
2. **Launch PrismGB**
3. **Click the video area** to start streaming
4. Use the control buttons to:
   - Take a **screenshot**
   - Start/stop **video recording**
   - Adjust **volume**
   - Enter **fullscreen** mode
   - Toggle **cinematic mode** for a cleaner viewing experience

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Fullscreen | `F11` or `F` |
| Screenshot | `S` |
| Record | `R` |

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) v22 LTS or higher
- npm (included with Node.js)
- Platform-specific USB libraries (for development):
  - **Linux:** `sudo apt-get install libusb-1.0-0-dev libudev-dev`
  - **macOS:** `brew install libusb`

### Build Steps

```bash
# Clone the repository
git clone https://github.com/josstei/prismgb-app.git
cd prismgb-app

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for your current platform
npm run build

# Build for specific platforms
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## Troubleshooting

### Device Not Detected

1. Ensure your Chromatic is powered on and connected via USB
2. Try a different USB port or cable
3. On Linux, you may need to configure udev rules for USB access
4. Restart the application after connecting the device

### Video Not Displaying

1. Click on the video area to initiate the stream
2. Check that no other application is using the Chromatic's video feed
3. Try disconnecting and reconnecting the device

### Permission Issues (Linux)

If you encounter USB permission errors, add your user to the appropriate group:
```bash
sudo usermod -a -G plugdev $USER
```
Then log out and back in for changes to take effect.

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our development process, code style, and how to submit pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Mod Retro](https://modretro.com) for creating the amazing Chromatic handheld
- The Game Boy community for keeping retro gaming alive

---

<p align="center">
  <sub>
    <strong>This is an unofficial community project.</strong><br>
    The Chromatic and Mod Retro are trademarks of Mod Retro LLC.<br>
    PrismGB is not affiliated with or endorsed by Mod Retro.
  </sub>
</p>
