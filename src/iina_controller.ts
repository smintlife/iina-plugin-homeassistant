/**
 * IINA / mpv controller wrapping the IINA Plugin API.
 */

import { PlayerStateData, PlaybackState } from './types';
import { TTSManager } from './tts_manager';
import { ZeroconfHelper } from './zeroconf_helper';

declare const iina: any;

export class IINAController {
  private ttsManager: TTSManager;
  private zeroconfHelper: ZeroconfHelper;
  private hostname = 'Mac mini (IINA)';

  constructor(ttsManager: TTSManager, zeroconfHelper: ZeroconfHelper) {
    this.ttsManager = ttsManager;
    this.zeroconfHelper = zeroconfHelper;
    this.initHostname();
  }

  private async initHostname(): Promise<void> {
    try {
      this.hostname = await this.zeroconfHelper.getHostname();
    } catch {
      this.hostname = 'Mac mini (IINA)';
    }
  }

  /**
   * Extracts a YouTube thumbnail URL from a given video URL if applicable.
   */
  private extractYoutubeThumbnail(url: string): string {
    if (!url) return '';
    try {
      const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      if (match && match[1]) {
        return `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg`;
      }
    } catch {
      // ignore
    }
    return '';
  }

  /**
   * Gathers full state of the IINA player.
   */
  public getState(): PlayerStateData {
    let hasWindow = false;
    let isIdle = true;
    let isPaused = false;
    let isBuffering = false;
    let path = '';
    let title = '';
    let artist = '';
    let album = '';
    let duration = 0;
    let position = 0;
    let volume = 100;
    let muted = false;
    let playlistPos = 0;
    let playlistCount = 0;
    let speed = 1.0;

    // Safe wrapper: iina.mpv.get can throw in the player-core context (e.g.
    // for 'idle-active'), so we never let it break getState().
    const mpvGet = (prop: string, fallback: any = undefined): any => {
      try {
        if (typeof iina === 'undefined' || !iina.mpv) return fallback;
        return iina.mpv.get(prop);
      } catch {
        return fallback;
      }
    };

    try {
      if (typeof iina !== 'undefined') {
        if (iina.core && iina.core.window) {
          hasWindow = true;
        }

        if (iina.mpv) {
          // Determine idle from path presence rather than 'idle-active',
          // which throws in the player-core context.
          path = String(mpvGet('path', '') || '');
          if (path) {
            hasWindow = true;
            isIdle = false;
          }

          isPaused = Boolean(mpvGet('pause', false));
          isBuffering = Boolean(mpvGet('paused-for-cache', false));

          try {
            title = String(mpvGet('media-title', '') || mpvGet('filename', '') || '');
          } catch {}

          try {
            artist = String(
              mpvGet('metadata/by-key/artist', '') ||
                mpvGet('metadata/by-key/ARTIST', '') ||
                mpvGet('metadata/artist', '') ||
                ''
            );
          } catch {}

          try {
            album = String(
              mpvGet('metadata/by-key/album', '') ||
                mpvGet('metadata/by-key/ALBUM', '') ||
                mpvGet('metadata/album', '') ||
                ''
            );
          } catch {}

          try {
            duration = Number(mpvGet('duration', 0)) || 0;
          } catch {}

          try {
            position = Number(mpvGet('time-pos', 0)) || 0;
          } catch {}

          try {
            volume = Number(mpvGet('volume', 100));
            if (isNaN(volume)) volume = 100;
          } catch {}

          try {
            muted = Boolean(mpvGet('mute', false));
          } catch {}

          try {
            playlistPos = Number(mpvGet('playlist-pos', 0)) || 0;
          } catch {}

          try {
            playlistCount = Number(mpvGet('playlist-count', 0)) || 0;
          } catch {}

          try {
            speed = Number(mpvGet('speed', 1.0)) || 1.0;
          } catch {}
        }
      }
    } catch (err) {
      console.error('[HomeAssistant Plugin] Error getting IINA state:', err);
    }

    let playbackState: PlaybackState = 'idle';
    if (!hasWindow && isIdle) {
      playbackState = 'idle';
    } else if (isBuffering) {
      playbackState = 'buffering';
    } else if (isIdle || !path) {
      playbackState = 'idle';
    } else if (isPaused) {
      playbackState = 'paused';
    } else {
      playbackState = 'playing';
    }

    const imageUrl = this.extractYoutubeThumbnail(path);

    return {
      state: playbackState,
      has_window: hasWindow,
      media_title: title,
      media_artist: artist,
      media_album: album,
      media_duration: Math.round(duration * 10) / 10,
      media_position: Math.round(position * 10) / 10,
      media_image_url: imageUrl,
      volume_level: Math.round(volume),
      is_volume_muted: muted,
      url: path,
      playlist_pos: playlistPos,
      playlist_count: playlistCount,
      hostname: this.hostname,
      speed,
    };
  }

  public debugDumpState(): void {
    try {
      const raw: any = {
        hasIina: typeof iina !== 'undefined',
        hasMpv: typeof iina !== 'undefined' && !!iina.mpv,
        hasCore: typeof iina !== 'undefined' && !!iina.core,
        hasCoreWindow: typeof iina !== 'undefined' && !!(iina.core && iina.core.window),
      };
      if (typeof iina !== 'undefined' && iina.mpv) {
        const props = ['path', 'media-title', 'filename', 'pause', 'idle-active', 'time-pos', 'duration', 'volume', 'playlist-count'];
        for (const p of props) {
          try { raw['mpv.' + p] = iina.mpv.get(p); } catch (e) { raw['mpv.' + p] = 'ERR:' + e; }
        }
      }
      iina.console.log('[HomeAssistant Bridge] DEBUG getState raw: ' + JSON.stringify(raw));
    } catch (err) {
      iina.console.log('[HomeAssistant Bridge] DEBUG getState error: ' + err);
    }
  }

  public play(): void {
    if (typeof iina !== 'undefined' && iina.mpv) {
      iina.mpv.set('pause', false);
    }
  }

  public pause(): void {
    if (typeof iina !== 'undefined' && iina.mpv) {
      iina.mpv.set('pause', true);
    }
  }

  public playPause(): void {
    if (typeof iina !== 'undefined' && iina.mpv) {
      iina.mpv.command('cycle', ['pause']);
    }
  }

  public stop(): void {
    if (typeof iina !== 'undefined' && iina.mpv) {
      iina.mpv.command('stop', []);
    }
  }

  public seek(position?: number, relative?: number): void {
    if (typeof iina !== 'undefined' && iina.mpv) {
      if (typeof position === 'number') {
        iina.mpv.command('seek', [position, 'absolute']);
      } else if (typeof relative === 'number') {
        iina.mpv.command('seek', [relative, 'relative']);
      }
    }
  }

  public setVolume(volume: number): void {
    if (typeof iina !== 'undefined' && iina.mpv) {
      const clamped = Math.max(0, Math.min(100, volume));
      iina.mpv.set('volume', clamped);
    }
  }

  public setMute(mute: boolean): void {
    if (typeof iina !== 'undefined' && iina.mpv) {
      iina.mpv.set('mute', mute);
    }
  }

  public volumeStep(step: number): void {
    if (typeof iina !== 'undefined' && iina.mpv) {
      iina.mpv.command('add', ['volume', step]);
    }
  }

  public nextTrack(): void {
    if (typeof iina !== 'undefined' && iina.mpv) {
      iina.mpv.command('playlist-next', ['weak']);
    }
  }

  public prevTrack(): void {
    if (typeof iina !== 'undefined' && iina.mpv) {
      iina.mpv.command('playlist-prev', ['weak']);
    }
  }

  public async playMedia(url: string, enqueue: 'play' | 'replace' | 'add' | 'next' = 'play', announce = false): Promise<void> {
    iina.console.log(`[HomeAssistant Bridge] playMedia ENTERED url=${url}`);
    if (!url) return;

    if (announce) {
      this.ttsManager.prepareAnnouncement();
    } else {
      this.ttsManager.cancelAnnouncement();
    }

    if (typeof iina !== 'undefined') {
      let idle = true;
      let hasWindow = false;
      try { idle = Boolean(iina.mpv && iina.mpv.get('idle-active')); } catch { idle = true; }
      try { hasWindow = Boolean(iina.core && iina.core.window); } catch { hasWindow = false; }
      iina.console.log(`[HomeAssistant Bridge] playMedia: url=${url} enqueue=${enqueue} idle=${idle} hasWindow=${hasWindow}`);

      if (!hasWindow || idle || enqueue === 'play' || enqueue === 'replace') {
        // Prefer mpv's loadfile (async, safe) over iina.core.open which can
        // block/freeze the player core in this context.
        // IINA's mpv bridge expects args as an array: command(name, [args]).
        if (iina.mpv && typeof iina.mpv.command === 'function') {
          iina.console.log('[HomeAssistant Bridge] playMedia: using mpv loadfile replace');
          try { iina.mpv.command('loadfile', [url, 'replace']); } catch (e) { iina.console.log('[HomeAssistant Bridge] mpv loadfile ERROR: ' + e); }
        } else if (iina.core && typeof iina.core.open === 'function') {
          iina.console.log('[HomeAssistant Bridge] playMedia: using iina.core.open (fallback)');
          try { iina.core.open(url); } catch (e) { iina.console.log('[HomeAssistant Bridge] core.open ERROR: ' + e); }
        } else {
          iina.console.log('[HomeAssistant Bridge] playMedia: NO open path available (no core.open, no mpv)');
        }
      } else if (enqueue === 'add') {
        if (iina.mpv) {
          iina.mpv.command('loadfile', [url, 'append']);
        }
      } else if (enqueue === 'next') {
        if (iina.mpv) {
          iina.mpv.command('loadfile', [url, 'append']);
        }
      }
    }
  }

  public turnOff(): void {
    this.ttsManager.cancelAnnouncement();
    if (typeof iina !== 'undefined') {
      if (iina.mpv) {
        iina.mpv.command('stop');
      }
      if (iina.core && iina.core.window && typeof iina.core.window.close === 'function') {
        iina.core.window.close();
      }
    }
  }

  public turnOn(): void {
    if (typeof iina !== 'undefined' && iina.mpv) {
      const isPaused = Boolean(iina.mpv.get('pause'));
      if (isPaused) {
        iina.mpv.set('pause', false);
      }
    }
  }

  public async restoreMedia(url: string, position: number, paused: boolean): Promise<void> {
    if (typeof iina !== 'undefined') {
      if (iina.core && typeof iina.core.open === 'function') {
        iina.core.open(url);
      } else if (iina.mpv) {
        iina.mpv.command('loadfile', [url, 'replace']);
      }

      // Seek and set pause state after a short buffer
      setTimeout(() => {
        try {
          if (iina.mpv) {
            if (position > 0) {
              iina.mpv.command('seek', [position, 'absolute']);
            }
            iina.mpv.set('pause', paused);
          }
        } catch (err) {
          console.error('[HomeAssistant Plugin] Error restoring position:', err);
        }
      }, 500);
    }
  }
}
