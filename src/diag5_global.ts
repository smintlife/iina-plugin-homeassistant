/**
 * DIAG5: relay handlers WITHOUT replying ha_player_id (that call crashed IINA).
 * Tests whether createPlayerInstance + targeted postMessage alone is safe.
 */

declare const iina: any;

function log(...args: any[]): void {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  try {
    if (typeof iina !== 'undefined' && iina.console) { iina.console.log(`[HADIAG5] ${msg}`); return; }
  } catch { /* ignore */ }
  console.log(`[HADIAG5] ${msg}`);
}

log('DIAG5 loaded');

const activePlayers: Set<any> = new Set();

if (typeof iina !== 'undefined' && iina.ws) {
  try { iina.ws.createServer({ port: 8989 }); } catch (e) { log('createServer err ' + e); }
  try {
    iina.ws.onMessage((conn: string, m: any) => {
      try {
        const req = JSON.parse(m.text());
        log('WS RECV ' + req.action);
        if (req.action === 'play_media' && req.params && req.params.url) {
          try {
            log('creating player for ' + req.params.url);
            const pid = iina.global.createPlayerInstance({ url: req.params.url, label: 'ha-bridge' });
            activePlayers.add(pid);
            log('created player id=' + pid);
          } catch (e) { log('createPlayerInstance ERROR: ' + e); }
        } else {
          for (const pid of activePlayers) {
            try { iina.global.postMessage(pid, 'ha_command', { action: req.action, params: req.params || {} }); log('relayed to ' + pid); }
            catch (e) { log('relay ERROR: ' + e); }
          }
        }
      } catch (e) { log('parse err ' + e); }
    });
  } catch (e) { log('onMessage err ' + e); }
  try { iina.ws.startServer(); log('ws started'); } catch (e) { log('startServer err ' + e); }
}

if (typeof iina !== 'undefined' && iina.global) {
  try {
    iina.global.onMessage('ha_player_ready', (data: any, player?: string) => {
      log('ha_player_ready player=' + player);
      if (player !== undefined) {
        activePlayers.add(player);
        log('added player (NO ha_player_id reply)');
        // NOTE: deliberately NOT calling postMessage(player, 'ha_player_id', ...)
      }
    });
    iina.global.onMessage('ha_register_player', (data: any) => {
      if (data && data.id !== undefined) { activePlayers.add(data.id); log('registered ' + data.id); }
    });
    log('relay handlers registered (no id reply)');
  } catch (e) { log('relay handlers ERROR: ' + e); }
}

log('DIAG5 done');
