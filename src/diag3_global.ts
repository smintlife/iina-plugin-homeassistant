/**
 * DIAG3: full init EXCEPT setupPlayerRelay/createPlayerInstance.
 */

declare const iina: any;

function log(...args: any[]): void {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  try {
    if (typeof iina !== 'undefined' && iina.console) { iina.console.log(`[HADIAG3] ${msg}`); return; }
  } catch { /* ignore */ }
  console.log(`[HADIAG3] ${msg}`);
}

log('DIAG3 loaded');

function safe(label: string, fn: () => void): void {
  try { fn(); log('DIAG3 OK: ' + label); }
  catch (err) { log('DIAG3 ERROR in ' + label + ': ' + err); }
}

if (typeof iina !== 'undefined' && iina.ws) {
  safe('createServer', () => iina.ws.createServer({ port: 8989 }));
  safe('onMessage', () => iina.ws.onMessage((conn: string, m: any) => log('WS RECV ' + m.text())));
  safe('startServer', () => iina.ws.startServer());
}

safe('event listeners', () => {
  const evts = ['mpv.pause.changed','mpv.volume.changed','iina.file-loaded','iina.window-closed','iina.window-loaded'];
  for (const e of evts) { try { iina.event.on(e, () => {}); } catch {} }
});

safe('menu', () => {
  if (iina.menu) iina.menu.addItem('HA Diag3', () => { if (iina.core && iina.core.osd) iina.core.osd('diag3'); });
});

safe('periodSync', () => { setInterval(() => {}, 1000); });

safe('zeroconf', () => {
  if (iina.utils && iina.utils.exec) {
    iina.utils.exec('dns-sd', ['-R', 'IINA Mac', '_iina-remote._tcp', 'local', '8989']).catch(() => {});
  }
});

log('DIAG3 done');
