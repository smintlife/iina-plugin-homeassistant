/**
 * Global entry point for the IINA Home Assistant Plugin.
 * Runs in background lifecycle and handles WebSocket communication.
 */

import { WsRequestMessage, WsResponseMessage, WsEventMessage } from './types';
import { TTSManager } from './tts_manager';
import { ZeroconfHelper } from './zeroconf_helper';
import { IINAController } from './iina_controller';

declare const iina: any;

function log(...args: any[]): void {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  try {
    if (typeof iina !== 'undefined' && iina.console) {
      iina.console.log(`[HomeAssistant Bridge] ${msg}`);
      return;
    }
  } catch { /* fall through */ }
  console.log(`[HomeAssistant Bridge] ${msg}`);
}

log('global.js LOADED (module evaluated)');

class HomeAssistantBridgePlugin {
  private ttsManager: TTSManager;
  private zeroconfHelper: ZeroconfHelper;
  private controller: IINAController;
  private activeConnections: Set<string> = new Set();
  private activePlayers: Set<string | number> = new Set();
  private port = 8989;
  private positionUpdateInterval: any = null;
  private lastBroadcastStateJson = '';

  constructor() {
    this.ttsManager = new TTSManager();
    this.zeroconfHelper = new ZeroconfHelper();
    this.controller = new IINAController(this.ttsManager, this.zeroconfHelper);
  }

  public async start(): Promise<void> {
    log('Initializing plugin...');

    // Load port from preferences
    try {
      if (typeof iina !== 'undefined' && iina.preferences) {
        const prefPort = iina.preferences.get('port');
        if (prefPort && !isNaN(Number(prefPort))) {
          this.port = Number(prefPort);
        }
      }
    } catch (err) {
      log('Using default port:', this.port);
    }

    this.setupWebSocketServer();
    this.setupIINAEventListeners();
    this.setupMenuItems();
    this.startPeriodicPositionSync();
    this.setupPlayerRelay();

    // Start Bonjour advertisement
    await this.zeroconfHelper.startAdvertisement(this.port);
  }

  private setupWebSocketServer(): void {
    if (typeof iina === 'undefined' || !iina.ws) {
      log('ERROR: iina.ws module is not available.');
      return;
    }

    log(`Setting up WebSocket server on port ${this.port}`);

    try {
      iina.ws.createServer({ port: this.port });

      if (typeof iina.ws.onStateUpdate === 'function') {
        iina.ws.onStateUpdate((state: string) => {
          log(`WebSocket Server state: ${state}`);
        });
      }

      if (typeof iina.ws.onNewConnection === 'function') {
        iina.ws.onNewConnection((conn: string) => {
          log(`WS NEW CONNECTION: ${conn}`);
        });
      }

      if (typeof iina.ws.onConnectionStateUpdate === 'function') {
        iina.ws.onConnectionStateUpdate((conn: string, state: string) => {
          log(`WS CONN STATE: ${conn} -> ${state}`);
        });
      }

      iina.ws.onMessage((conn: string, message: { text: () => string; data: () => Uint8Array }) => {
        this.activeConnections.add(conn);
        try {
          const rawText = message.text();
          const hasData = typeof message.data === 'function' ? (message.data().length > 0) : false;
          log(`WS RECV <- conn=${conn} text="${rawText}" hasBinaryData=${hasData}`);
          if (!rawText) return;
          const req: WsRequestMessage = JSON.parse(rawText);
          this.handleIncomingRequest(conn, req);
        } catch (err: any) {
          log('ERROR: Failed to parse message:', err);
          this.sendResponse(conn, {
            id: undefined,
            success: false,
            error: err ? err.message : 'Invalid JSON format',
          });
        }
      });

      log('Calling iina.ws.startServer()...');
      iina.ws.startServer();
      log(`WebSocket server started on port ${this.port}`);
    } catch (err) {
      log('ERROR: starting WebSocket server:', err);
    }
  }

  private async handleIncomingRequest(conn: string, req: WsRequestMessage): Promise<void> {
    const action = req.action;
    const params = req.params || {};
    let success = true;
    let error: string | undefined;
    let result: any = null;

    // Relay the command to all player cores (main entries). They own the
    // actual playback control and will report state back via the relay.
    // Commands that require a living player instance (e.g. play_media when
    // IINA is idle) will create a player if needed.
    this.relayCommand(action, params);

    try {
      switch (action) {
        case 'play':
          this.controller.play();
          break;

        case 'pause':
          this.controller.pause();
          break;

        case 'play_pause':
          this.controller.playPause();
          break;

        case 'stop':
          this.controller.stop();
          break;

        case 'seek':
          this.controller.seek(params.position, params.relative);
          break;

        case 'volume_set':
          if (typeof params.volume === 'number') {
            this.controller.setVolume(params.volume);
          }
          break;

        case 'volume_mute':
          if (typeof params.mute === 'boolean') {
            this.controller.setMute(params.mute);
          }
          break;

        case 'volume_step':
          if (typeof params.step === 'number') {
            this.controller.volumeStep(params.step);
          }
          break;

        case 'next':
          this.controller.nextTrack();
          break;

        case 'prev':
          this.controller.prevTrack();
          break;

        case 'play_media':
          if (!params.url) {
            success = false;
            error = 'Missing url parameter';
          }
          // Actual open/load is handled by the player core (relayed above)
          // or by createPlayerInstance when no player is active.
          break;

        case 'turn_off':
          this.controller.turnOff();
          break;

        case 'turn_on':
          this.controller.turnOn();
          break;

        case 'get_state':
          result = this.controller.getState();
          break;

        default:
          success = false;
          error = `Unknown action: ${action}`;
      }
    } catch (err: any) {
      success = false;
      error = err ? err.message : 'Unknown internal error';
    }

    // Send response back
    this.sendResponse(conn, {
      id: req.id,
      success,
      error,
      result,
    });

    // Broadcast updated state to all connected clients
    this.broadcastState();
  }

  private sendResponse(conn: string, resp: WsResponseMessage): void {
    if (typeof iina === 'undefined' || !iina.ws) return;
    try {
      iina.ws.sendText(conn, JSON.stringify(resp));
    } catch (err) {
      this.activeConnections.delete(conn);
    }
  }

  public broadcastState(force = false): void {
    if (typeof iina === 'undefined' || !iina.ws) return;
    if (this.activeConnections.size === 0) return;

    try {
      const state = this.controller.getState();
      const payload: WsEventMessage = {
        event: 'state_update',
        data: state,
      };
      const jsonStr = JSON.stringify(payload);

      // Avoid broadcasting unchanged state unless forced
      if (!force && jsonStr === this.lastBroadcastStateJson) {
        return;
      }
      this.lastBroadcastStateJson = jsonStr;

      for (const conn of this.activeConnections) {
        try {
          iina.ws.sendText(conn, jsonStr);
        } catch {
          this.activeConnections.delete(conn);
        }
      }
    } catch (err) {
      log('ERROR: broadcasting state:', err);
    }
  }

  private setupIINAEventListeners(): void {
    if (typeof iina === 'undefined' || !iina.event) return;

    const eventsToListen = [
      'mpv.pause.changed',
      'mpv.volume.changed',
      'mpv.mute.changed',
      'mpv.duration.changed',
      'mpv.media-title.changed',
      'mpv.idle-active.changed',
      'mpv.paused-for-cache.changed',
      'iina.file-loaded',
      'iina.window-closed',
      'iina.window-loaded',
    ];

    for (const evt of eventsToListen) {
      try {
        iina.event.on(evt, () => {
          this.broadcastState();
        });
      } catch (err) {
        // Event not supported in this version
      }
    }

    // Check EOF / Track finish for TTS restore
    try {
      iina.event.on('mpv.eof-reached.changed', (eof: any) => {
        if (Boolean(eof) && this.ttsManager.active) {
          this.ttsManager.restorePreviousPlayback((url, pos, paused) => {
            return this.controller.restoreMedia(url, pos, paused);
          });
        }
        this.broadcastState();
      });
    } catch {
      // ignore
    }
  }

  private startPeriodicPositionSync(): void {
    // Periodically push position update every 1 second when active playback is running
    this.positionUpdateInterval = setInterval(() => {
      const state = this.controller.getState();
      if (state.state === 'playing') {
        this.broadcastState(true);
      }
    }, 1000);
  }

  /**
   * Relays commands from Home Assistant to the player cores and player state
   * back to the connected WebSocket clients.
   */
  private setupPlayerRelay(): void {
    if (typeof iina === 'undefined' || !iina.global) return;

    // Track player instances created/registered via the bridge.
    try {
      iina.global.onMessage('ha_player_ready', (data: any, player?: string) => {
        if (player !== undefined) {
          this.activePlayers.add(player);
          log(`RELAY: player core ready, id=${player}`);
          // Tell the player its own ID so it can register explicitly.
          try {
            iina.global.postMessage(player, 'ha_player_id', { id: player });
          } catch (err) {
            log('ERROR: replying ha_player_id:', err);
          }
        } else {
          log('RELAY: ha_player_ready without player id');
        }
      });
      iina.global.onMessage('ha_register_player', (data: any) => {
        const id = data && data.id;
        if (id !== undefined) {
          this.activePlayers.add(id);
          log(`RELAY: registered player id=${id}`);
        }
      });
    } catch {
      // global module unavailable
    }

    // Receive playback state from player cores and forward to WebSocket clients.
    try {
      iina.global.onMessage('ha_player_state', (state: any) => {
        if (typeof iina !== 'undefined' && iina.ws && this.activeConnections.size > 0) {
          const payload: WsEventMessage = { event: 'state_update', data: state };
          const jsonStr = JSON.stringify(payload);
          for (const conn of this.activeConnections) {
            try {
              iina.ws.sendText(conn, jsonStr);
            } catch {
              this.activeConnections.delete(conn);
            }
          }
        }
      });
    } catch {
      // global module unavailable
    }
  }

  /**
   * Relay a command to the managed player core(s). We use a managed player
   * instance (created via `createPlayerInstance`) so we can address it
   * directly by ID. Broadcast-style `postMessage(null, ...)` is unreliable
   * for reaching the main entry, so we always target the known player IDs.
   */
  private relayCommand(action: string, params: any, requiresPlayer = true): void {
    if (typeof iina === 'undefined' || !iina.global) {
      log('RELAY: no global module, cannot relay');
      return;
    }

    // For playback we need a living player. If none exists yet, create one.
    if (this.activePlayers.size === 0 && action === 'play_media' && params && params.url) {
      log(`RELAY: no managed player yet, creating instance for url=${params.url}`);
      try {
        const label = 'ha-bridge';
        const playerId = iina.global.createPlayerInstance({ url: params.url, label });
        this.activePlayers.add(playerId);
        log(`RELAY: created managed player id=${playerId} (it opens the URL itself)`);
        return;
      } catch (err) {
        log('ERROR: Failed to create player instance:', err);
      }
    }

    if (this.activePlayers.size === 0) {
      log(`RELAY: no managed player to receive '${action}', dropping command`);
      return;
    }

    log(`RELAY -> action=${action} to ${this.activePlayers.size} managed player(s)`);
    for (const playerId of this.activePlayers) {
      try {
        iina.global.postMessage(playerId, 'ha_command', { action, params });
        log(`RELAY: postMessage(${playerId},'ha_command') called OK`);
      } catch (err) {
        log(`ERROR: Failed to relay to player ${playerId}:`, err);
      }
    }
  }

  private setupMenuItems(): void {
    try {
      if (typeof iina !== 'undefined' && iina.menu) {
        iina.menu.addItem('Home Assistant Bridge Status', () => {
          const clientCount = this.activeConnections.size;
          const msg = `HA Bridge running on port ${this.port} (${clientCount} connected client(s))`;
          if (iina.core && typeof iina.core.osd === 'function') {
            iina.core.osd(msg);
          }
        });
      }
    } catch {
      // Menu API might be restricted in some environments
    }
  }
}

// Initialize and start the global bridge instance
log('Creating plugin instance...');
const plugin = new HomeAssistantBridgePlugin();
plugin.start().then(
  () => log('plugin.start() resolved OK'),
  (err) => log('ERROR: plugin.start() FAILED:', err),
);
