/**
 * Player core entry point for the IINA Home Assistant Bridge Plugin.
 * Loaded by IINA for each player instance.
 *
 * This main entry controls the player that is associated with this window.
 * It communicates with the global entry (which owns the WebSocket server and
 * the zeroconf advertisement) by relaying playback state and commands via the
 * `global` module's message passing mechanism.
 */

import { IINAController } from './iina_controller';
import { TTSManager } from './tts_manager';
import { ZeroconfHelper } from './zeroconf_helper';

declare const iina: any;

const ttsManager = new TTSManager();
const zeroconfHelper = new ZeroconfHelper();
const controller = new IINAController(ttsManager, zeroconfHelper);

// Serial command queue: prevents rapid synchronous mpv calls from freezing
// IINA. Each command runs one at a time with a tiny gap between them.
type QueuedCommand = () => void;
const commandQueue: QueuedCommand[] = [];
let queueRunning = false;

function enqueueCommand(fn: QueuedCommand): void {
  commandQueue.push(fn);
  if (!queueRunning) {
    runQueue();
  }
}

function runQueue(): void {
  if (commandQueue.length === 0) {
    queueRunning = false;
    return;
  }
  queueRunning = true;
  const fn = commandQueue.shift()!;
  try {
    fn();
  } catch (err) {
    iina.console.log('[HomeAssistant Bridge] queued command error: ' + err);
  }
  // Small gap so the player core event loop can breathe between commands.
  setTimeout(runQueue, 20);
}

let lastStateJson = '';

function broadcastState(force = false): void {
  try {
    const state = controller.getState();
    const json = JSON.stringify(state);
    if (!force && json === lastStateJson) {
      return;
    }
    lastStateJson = json;
    iina.console.log(`[HomeAssistant Bridge] CORE broadcastState: state=${state.state} force=${force}`);
    if (typeof iina !== 'undefined' && iina.global) {
      iina.global.postMessage('ha_player_state', state);
    }
  } catch (err) {
    console.error('[HomeAssistant Bridge] Error broadcasting player state:', err);
  }
}

// Notify the global bridge that this player core is ready to receive commands.
// The global entry receives (data, playerID) and uses playerID to address us.
iina.console.log('[HomeAssistant Bridge] CORE: registering ha_command listener; global type=' + typeof iina.global);
if (typeof iina !== 'undefined' && iina.global) {
  try {
    iina.global.postMessage('ha_player_ready', {});
    iina.console.log('[HomeAssistant Bridge] CORE: sent ha_player_ready');
  } catch (err) {
    iina.console.log('[HomeAssistant Bridge] CORE ERROR sending ha_player_ready: ' + err);
  }
}

// Listen for commands coming from the global entry.
if (typeof iina !== 'undefined' && iina.global) {
  iina.global.onMessage('ha_command', (data: any) => {
    try {
      if (!data || !data.action) return;
      iina.console.log(`[HomeAssistant Bridge] CORE RECV <- action=${data.action} params=${JSON.stringify(data.params)}`);
      switch (data.action) {
        case 'play':
          enqueueCommand(() => controller.play());
          break;
        case 'pause':
          enqueueCommand(() => controller.pause());
          break;
        case 'play_pause':
          enqueueCommand(() => controller.playPause());
          break;
        case 'stop':
          enqueueCommand(() => controller.stop());
          break;
        case 'seek':
          enqueueCommand(() => controller.seek(data.params && data.params.position, data.params && data.params.relative));
          break;
        case 'volume_set':
          if (data.params && typeof data.params.volume === 'number') {
            enqueueCommand(() => controller.setVolume(data.params.volume));
          }
          break;
        case 'volume_mute':
          if (data.params && typeof data.params.mute === 'boolean') {
            enqueueCommand(() => controller.setMute(data.params.mute));
          }
          break;
        case 'volume_step':
          if (data.params && typeof data.params.step === 'number') {
            enqueueCommand(() => controller.volumeStep(data.params.step));
          }
          break;
        case 'next':
          enqueueCommand(() => controller.nextTrack());
          break;
        case 'prev':
          enqueueCommand(() => controller.prevTrack());
          break;
        case 'play_media':
          if (data.params && data.params.url) {
            iina.console.log(`[HomeAssistant Bridge] CORE play_media: opening url=${data.params.url}`);
            enqueueCommand(() => {
              try {
                controller.playMedia(data.params.url, data.params.enqueue || 'play', Boolean(data.params.announce));
              } catch (err) {
                iina.console.log('[HomeAssistant Bridge] CORE play_media ERROR: ' + err);
              }
            });
          } else {
            iina.console.log('[HomeAssistant Bridge] CORE play_media: missing url');
          }
          break;
        case 'turn_off':
          enqueueCommand(() => controller.turnOff());
          break;
        case 'turn_on':
          enqueueCommand(() => controller.turnOn());
          break;
        case 'get_state':
          broadcastState(true);
          break;
        default:
          break;
      }
      broadcastState(true);
    } catch (err) {
      console.error('[HomeAssistant Bridge] Error handling command in player core:', err);
    }
  });
}

// Forward relevant player events to the global entry.
if (typeof iina !== 'undefined' && iina.event) {
  const eventsToListen = [
    'mpv.pause.changed',
    'mpv.volume.changed',
    'mpv.mute.changed',
    'mpv.duration.changed',
    'mpv.media-title.changed',
    'mpv.idle-active.changed',
    'mpv.paused-for-cache.changed',
    'mpv.eof-reached.changed',
    'iina.file-loaded',
    'iina.window-closed',
    'iina.window-loaded',
  ];

  for (const evt of eventsToListen) {
    try {
      iina.event.on(evt, () => broadcastState());
    } catch {
      // Event not supported in this version
    }
  }
}

  // Periodic position sync while playing.
  setInterval(() => {
    const state = controller.getState();
    if (state.state === 'playing' || state.state === 'paused') {
      broadcastState(true);
    }
  }, 1000);

iina.console.log('[HomeAssistant Bridge] Player core instance loaded.');
broadcastState(true);
