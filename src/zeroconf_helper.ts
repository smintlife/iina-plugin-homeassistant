/**
 * Helper to announce the IINA WebSocket service via Bonjour/mDNS using macOS dns-sd.
 */

declare const iina: any;

export class ZeroconfHelper {
  private registered = false;
  private hostname = 'IINA Mac';

  public async getHostname(): Promise<string> {
    try {
      if (typeof iina !== 'undefined' && iina.utils && typeof iina.utils.exec === 'function') {
        const res = await iina.utils.exec('scutil', ['--get', 'ComputerName']);
        if (res && res.stdout && res.stdout.trim()) {
          this.hostname = res.stdout.trim();
          return this.hostname;
        }
      }
    } catch {
      // Fallback
    }

    try {
      if (typeof iina !== 'undefined' && iina.utils && typeof iina.utils.exec === 'function') {
        const res = await iina.utils.exec('hostname', ['-s']);
        if (res && res.stdout && res.stdout.trim()) {
          this.hostname = `IINA (${res.stdout.trim()})`;
          return this.hostname;
        }
      }
    } catch {
      // Fallback
    }

    return this.hostname;
  }

  public async startAdvertisement(port: number): Promise<void> {
    if (this.registered) {
      return;
    }

    try {
      const name = await this.getHostname();
      if (typeof iina !== 'undefined' && iina.utils && typeof iina.utils.exec === 'function') {
        // Run dns-sd registration in background
        iina.utils.exec('dns-sd', ['-R', name, '_iina-remote._tcp', 'local', port.toString()]).catch(() => {
          // Non-blocking catch
        });
        this.registered = true;
        console.log(`[HomeAssistant Plugin] Bonjour service advertised: "${name}" on port ${port}`);
      }
    } catch (err) {
      console.log('[HomeAssistant Plugin] Bonjour advertisement unavailable or failed:', err);
    }
  }
}
