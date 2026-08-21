/**
 * MINIMAL diagnostic global entry - only logs, does nothing else.
 * Used to isolate load-time crashes.
 */

declare const iina: any;

function log(...args: any[]): void {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  try {
    if (typeof iina !== 'undefined' && iina.console) {
      iina.console.log(`[HADIAG] ${msg}`);
      return;
    }
  } catch { /* ignore */ }
  console.log(`[HADIAG] ${msg}`);
}

log('DIAGNOSTIC global entry loaded. iina typeof=' + typeof iina);
if (typeof iina !== 'undefined') {
  log('iina keys: ' + Object.keys(iina).join(','));
  log('iina.ws typeof=' + typeof iina.ws);
  log('iina.global typeof=' + typeof iina.global);
  log('iina.menu typeof=' + typeof iina.menu);
}
