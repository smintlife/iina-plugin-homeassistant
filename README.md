# IINA Plugin for Home Assistant Bridge

An IINA Media Player plugin (macOS) that starts a local WebSocket server to remotely control the player in real time via Home Assistant.

## 🚀 Features
- **WebSocket Server** (`iina.ws`): Supports configurable port (default: `8989`).
- **Bi-directional Real-time Sync**: Pushes playback state (`playing`, `paused`, `buffering`, `idle`), track metadata (title, artist, album), position, total duration, YouTube cover art, and volume directly to Home Assistant.
- **YouTube & Web Streaming**: Plays YouTube links and web streams via mpv / yt-dlp.
- **Playlist & Queue Management**: Supports `replace`, `play`, `add` (append to playlist), and `next`.
- **TTS Ducking & Resume**: Pauses currently playing music during Home Assistant TTS announcements (`announce: true`) and automatically resumes playback at the saved position afterwards.
- **Bonjour / Zeroconf**: Automatic advertisement on the local network (`_iina-remote._tcp`).

---

## 🛠️ Development & Build

### Prerequisites
- [Node.js](https://nodejs.org/) (>= v18)

### Installing Dependencies
```bash
npm install
```

### Compiling the Plugin
```bash
npm run build
```

### Creating Installable `.iinaplgz` Package
```bash
npm run package
```
The ready-to-use package will be located at `build/homeassistant.iinaplgz`.

---

## 📦 Installation in IINA

1. Double-click the generated `build/homeassistant.iinaplgz` file, or open **IINA -> Settings -> Plugins** and install the plugin package.
2. Enable the **Home Assistant Bridge** plugin.
3. The WebSocket server listens on port `8989` by default.
