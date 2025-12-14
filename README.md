# PrismGB

<p align="center">
  <img src="assets/Logo.png" alt="PrismGB Logo" width="400">
</p>

<p align="center">
  <strong>A desktop streaming and capture application for the Mod Retro Chromatic</strong>
</p>

<p align="center">
  <a href="https://github.com/josstei/prismgb-app/releases/latest"><img src="https://img.shields.io/github/v/release/josstei/prismgb-app?label=version" alt="Latest Release"></a>
  <a href="https://github.com/josstei/prismgb-app/releases"><img src="https://img.shields.io/github/downloads/josstei/prismgb-app/total" alt="Downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="Platform">
  <a href="https://ko-fi.com/josstei"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Ko-fi"></a>
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#features">Features</a> •
  <a href="#usage">Usage</a> •
  <a href="#troubleshooting">Troubleshooting</a> •
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

PrismGB is a free, open-source desktop application that lets you stream and capture video from your [Mod Retro Chromatic](https://modretro.com) handheld gaming device. Connect your Chromatic via USB and enjoy your gameplay on a larger screen, take screenshots, or record your gaming sessions.

## Features

- **Live Video Streaming** - Stream your Chromatic's display to your desktop in real-time
- **Screenshot Capture** - Take instant screenshots of your gameplay
- **Video Recording** - Record your gaming sessions
- **Render Presets** - Choose from visual styles: True Color, Vibrant, Hi-Def, Vintage (CRT), or Pixel
- **Brightness Control** - Adjust display brightness to your preference
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

Download the latest release for your operating system from the [Releases](https://github.com/josstei/prismgb-app/releases) page:

| Platform | Download | Description |
|----------|----------|-------------|
| Windows  | `PrismGB-Setup-x.x.x.exe` | Installer with Start Menu shortcuts |
| Windows  | `PrismGB-x.x.x-portable.exe` | Portable version, no install needed |
| macOS    | `PrismGB-x.x.x-mac.dmg` | Disk image installer |
| macOS    | `PrismGB-x.x.x-mac.zip` | Compressed app bundle |
| Linux    | `PrismGB-x.x.x-x64.AppImage` | Universal Linux package |
| Linux    | `PrismGB-x.x.x-x64.deb` | For Debian/Ubuntu systems |
| Linux    | `PrismGB-x.x.x-x64.tar.gz` | Compressed archive |

> **Note:** Replace `x.x.x` with the actual version number (e.g., `1.1.1`).

### Windows Installation

**Using the Installer (recommended):**
1. Download `PrismGB-Setup-x.x.x.exe`
2. Run the installer and follow the prompts
3. Launch PrismGB from the Start Menu or desktop shortcut

**Using the Portable Version:**
1. Download `PrismGB-x.x.x-portable.exe`
2. Run the executable directly - no installation required
3. Great for USB drives or systems where you can't install software

### macOS Installation

1. Download `PrismGB-x.x.x-mac.dmg`
2. Open the DMG file
3. Drag PrismGB to your Applications folder
4. Launch PrismGB from your Applications folder or Spotlight

### Linux Installation

**Option 1: AppImage (recommended for most users)**
```bash
# Make the AppImage executable
chmod +x PrismGB-x.x.x-x64.AppImage

# Run the application
./PrismGB-x.x.x-x64.AppImage
```
> AppImages are self-contained and work on most Linux distributions without installation.

**Option 2: Debian/Ubuntu (.deb)**
```bash
# Install the package (automatically installs libusb dependency)
sudo dpkg -i PrismGB-x.x.x-x64.deb

# If there are dependency errors, run:
sudo apt-get install -f
```

**Option 3: Tar Archive**
```bash
# Extract the archive
tar -xzf PrismGB-x.x.x-x64.tar.gz

# Run PrismGB from the extracted folder
./PrismGB-x.x.x-x64/prismgb
```

**Required: USB Library**

PrismGB requires `libusb` for USB device communication. Install it if not already present:

```bash
# Debian/Ubuntu
sudo apt install libusb-1.0-0

# Fedora
sudo dnf install libusb

# Arch Linux
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

### File Locations

Screenshots and recordings are automatically saved to your **Downloads** folder:

| Platform | Location |
|----------|----------|
| Windows  | `C:\Users\<username>\Downloads\` |
| macOS    | `~/Downloads/` |
| Linux    | `~/Downloads/` |

- Screenshots: `PrismGB_Screenshot_YYYYMMDD_HHMMSS.png`
- Recordings: `PrismGB_Recording_YYYYMMDD_HHMMSS.webm`

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

If you encounter USB permission errors, you have two options:

**Option 1: Add user to plugdev group**
```bash
sudo usermod -a -G plugdev $USER
```
Log out and back in for changes to take effect.

**Option 2: Create a udev rule (recommended)**

Create a file `/etc/udev/rules.d/99-chromatic.rules` with this content:
```bash
# Mod Retro Chromatic
SUBSYSTEM=="usb", ATTR{idVendor}=="374e", ATTR{idProduct}=="0101", MODE="0666"
```

Then reload udev rules:
```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

Reconnect your Chromatic after applying the rule.

## Contributing

Contributions are welcome! See [DEVELOPMENT.md](DEVELOPMENT.md) for build instructions and [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Mod Retro](https://modretro.com) for creating the Chromatic handheld
