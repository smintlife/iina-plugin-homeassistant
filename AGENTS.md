# AGENTS.md — iina-plugin-homeassistant (IINA Plugin, macOS)

## What this repo is
An **IINA media player plugin** (macOS) that exposes a local **WebSocket server** (`ws://0.0.0.0:<port>`)
so Home Assistant can control IINA in real time. It is the **server** side; the HA integration
(`ha-iina-media-player`) is the client.

- Repo root: `iina-plugin-homeassistant/`
- Source: `src/*.ts` — TypeScript, bundled with esbuild into `dist/global.js` (global entry)
  and `dist/main.js` (player core entry).
- `Info.json`: `entry: dist/main.js`, `globalEntry: dist/global.js`, identifier `io.iina.homeassistant`.
- Build: `npm run build` → `npm run package` produces `build/homeassistant.iinaplgz`.
- Install on macOS: double-click `homeassistant.iinaplgz` (or IINA → Settings → Plugins).
- Logs: IINA **Log Window** (Plugin → Developer Tool), not the macOS system `Console.app`.
  Use `iina.console.log(...)` for logs — plain `console.log` may not appear in the Log Window.

## Architecture (IMPORTANT)
- **Global entry (`global.js`)**: runs in IINA's background lifecycle. Owns the **WebSocket server**,
  Bonjour/Zeroconf advertisement, and relays commands from HA to player cores.
  It has **NO access to `iina.mpv` / `iina.core`** (those exist only in the player-core/main context).
- **Player core (`main.js` / `index.ts`)**: one instance per player window. Owns real playback
  control via `iina.mpv` / `iina.core`. Reports state back to the global entry.
- Communication between them: `iina.global.postMessage(name, data)` / `iina.global.onMessage(name, cb)`.
  The player core's `onMessage` callback receives `(data, playerID)` — the playerID is the 2nd arg.
- Global entry addresses a specific player via `iina.global.postMessage(playerID, 'ha_command', {...})`.

## CRITICAL IINA plugin API learnings (READ BEFORE WRITING ANY CODE)
1. **`iina.mpv.get(prop)` does NOT exist.** It throws `iina.mpv.get is not a function`.
   Use the typed accessors instead:
   - `iina.mpv.getString(name)` — strings (`path`, `media-title`, `filename`, `metadata/...`)
   - `iina.mpv.getNumber(name)` — numbers (`time-pos`, `duration`, `volume`, `playlist-count`, `speed`)
   - `iina.mpv.getFlag(name)` — booleans (`pause`, `idle-active`, `mute`)
   - `iina.mpv.getNative(name)` — objects
   NEVER call `iina.mpv.get(...)` — it crashes `getState()` and returns only `idle`.
2. **`iina.mpv.command(name, args)` takes args as an ARRAY**: `iina.mpv.command('loadfile', [url, 'replace'])`.
   Calling `iina.mpv.command('loadfile', url, 'replace')` throws
   `TypeError: Cannot convert primitive to NSArray`. Same for `seek`, `add`, `cycle`, `playlist-next`, etc.
3. **Do NOT call `iina.global.postMessage(playerID, 'ha_player_id', ...)`** as a reply to crashe IINA
   natively (hard app crash on open). Use the playerID from the `ha_player_ready` callback instead.
4. **`iina.core.open(url)` can freeze/block the player core** in this context. Prefer
   `iina.mpv.command('loadfile', [url, 'replace'])` for playback.
5. **`ws.sendText(conn, json)` sends BINARY frames** from IINA's side — the HA client must decode
   `WSMsgType.BINARY`. (Documented in the HA integration AGENTS.md.)

## Freeze / crash fixes from the session (do not regress)
- **Volume feedback loop**: do NOT bind `mpv.volume.changed` / `mpv.mute.changed` event listeners to
  `broadcastState()` — reading volume inside that callback recurses and **freezes IINA** after the
  first volume change (all later commands then time out). Use the 1s `setInterval` as the primary
  state source instead. (See `index.ts` event list — `volume`/`mute` intentionally excluded.)
- **Command queue**: route all playback commands through a serial queue (`enqueueCommand` in
  `index.ts`) with a ~20ms gap, so rapid/synchronous mpv calls don't freeze IINA.
- **`handleIncomingRequest` in `global.ts` MUST send its response BEFORE calling `relayCommand`**
  (fire-and-forget response). Otherwise, if `postMessage` to the core blocks, HA never gets the ack.
- `setVolume` uses `iina.mpv.command('set', ['volume', String(clamped)])` (with `mpv.set` fallback),
  wrapped in try/catch.
- Wrap ALL `iina.mpv` / `iina.core` access in try/catch — the global entry has none of them.

## Diagnostics pattern used during debugging
- When isolating load-time crashes, build minimal diagnostic plugins (Diag1..Diag5) that enable
  features one-by-one, each logging via `iina.console.log` and wrapped in `try/catch`. This
  pinpointed the `ha_player_id` reply crash and the `mpv.get` issue.
- Always log `WS RECV`, `WS NEW CONNECTION`, `WS CONN STATE`, and `RELAY ->` in the global entry.

## Interaction with the HA integration repo (`ha-iina-media-player`)
- This plugin is the **server**. The HA integration is the **client** (WebSocket, default port 8989).
- Protocol contract: see `types.ts` (`WsRequestMessage`, `WsResponseMessage`, `WsEventMessage`,
  `PlayerStateData`). Keep `PlayerStateData` field names in sync with the HA client's expectations.
- If HA shows `Address already in use` / no connection: ensure no other plugin or a stale IINA
  process holds port 8989 (`lsof -i :8989` or change the port in settings on macOS; quit IINA fully before restarting).
