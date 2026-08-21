/**
 * DIAG 2: only WebSocket server + onMessage, like the last working version.
 */

declare const iina: any;

function log(...args: any[]): void {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  try {
    if (typeof iina !== 'undefined' && iina.console) {
      iina.console.log(`[HADIAG2] ${msg}`);
      return;
    }
  } catch { /* ignore */ }
  console.log(`[HADIAG2] ${msg}`);
}

log('DIAG2 loaded; iina.typeof=' + typeof iina + ' ws.typeof=' + (typeof iina !== 'undefined' ? typeof iina.ws : 'n/a'));

try {
  if (typeof iina !== 'undefined' && iina.ws) {
    iina.ws.createServer({ port: 8989 });
    iina.ws.onMessage((conn: string, message: any) => {
      log('WS RECV <- ' + message.text());
      try { iina.ws.sendText(conn, JSON.stringify({ id: 1, success: true })); } catch (e) {}
    });
    iina.ws.startServer();
    log('DIAG2 ws server started');
  } else {
    log('DIAG2 no iina.ws');
  }
} catch (err) {
  log('DIAG2 ERROR: ' + err);
}
