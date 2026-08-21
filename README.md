# IINA Plugin for Home Assistant Bridge

Ein IINA Media Player Plugin (macOS), das einen lokalen WebSocket-Server startet, um den Player in Echtzeit über Home Assistant fernzusteuern.

## 🚀 Funktionen
- **WebSocket Server** (`iina.ws`): Unterstützt Port-Konfiguration (Standard: `8989`).
- **Bidirektionale Echtzeit-Synchronisation**: Pusht Playback-Status (`playing`, `paused`, `buffering`, `idle`), Track-Metadaten (Titel, Interpret, Album), Position, Gesamtdauer, YouTube-Cover & Lautstärke direkt an Home Assistant.
- **YouTube & Web-Streaming**: Spielt YouTube-Links und Web-Streams via mpv / yt-dlp ab.
- **Playlist & Queue Management**: Unterstützt `replace`, `play`, `add` (an Playlist anhängen) und `next`.
- **TTS-Ducking & Resume**: Pausiert bei Home Assistant TTS-Durchsagen (`announce: true`) die aktuelle Musik und setzt sie nach der Durchsage automatisch an der gemerkten Position fort.
- **Bonjour / Zeroconf**: Automatische Bekanntgabe im lokalen Netzwerk (`_iina-remote._tcp`).

---

## 🛠️ Entwicklung & Build

### Voraussetzungen
- [Node.js](https://nodejs.org/) (>= v18)

### Installation der Abhängigkeiten
```bash
npm install
```

### Plugin kompilieren
```bash
npm run build
```

### Installierbares `.iinaplgz` Paket erzeugen
```bash
npm run package
```
Das fertige Paket liegt anschließend im Ordner `build/homeassistant.iinaplgz`.

---

## 📦 Installation in IINA

1. Doppelklicken Sie auf die erzeugte Datei `build/homeassistant.iinaplgz` oder öffnen Sie **IINA -> Einstellungen -> Plugins** und installieren Sie das Plugin.
2. Aktivieren Sie das Plugin **Home Assistant Bridge**.
3. Der WebSocket Server lauscht standardmäßig auf Port `8989`.
