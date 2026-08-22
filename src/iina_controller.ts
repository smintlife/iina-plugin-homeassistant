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

    // IINA's mpv API has no generic .get(); use typed accessors.
    // getString for strings, getNumber for numbers, getFlag for booleans.
    const mpvStr = (p: string, fb = ''): string => {
      try { return iina.mpv && iina.mpv.getString ? String(iina.mpv.getString(p) || '') : fb; }
      catch { return fb; }
    };
    const mpvNum = (p: string, fb = 0): number => {
      try { const v = iina.mpv && iina.mpv.getNumber ? iina.mpv.getNumber(p) : fb; return Number(v) || fb; }
      catch { return fb; }
    };
    const mpvFlag = (p: string, fb = false): boolean => {
      try { return iina.mpv && iina.mpv.getFlag ? Boolean(iina.mpv.getFlag(p)) : fb; }
      catch { return fb; }
    };

    try {
      if (typeof iina !== 'undefined') {
        if (iina.core && iina.core.window) {
          hasWindow = true;
        }

        if (iina.mpv) {
          // idle-active is a flag; if we can't read it, infer idle from path.
          try { isIdle = mpvFlag('idle-active', false); } catch { isIdle = true; }
          path = mpvStr('path');
          if (path) {
            hasWindow = true;
            isIdle = false;
          }

          isPaused = mpvFlag('pause', false);
          isBuffering = mpvFlag('paused-for-cache', false);

          try {
            title = mpvStr('media-title') || mpvStr('filename');
          } catch {}

          try {
            artist = mpvStr('metadata/by-key/artist') || mpvStr('metadata/by-key/ARTIST') || mpvStr('metadata/artist');
          } catch {}

          try {
            album = mpvStr('metadata/by-key/album') || mpvStr('metadata/by-key/ALBUM') || mpvStr('metadata/album');
          } catch {}

          try {
            duration = mpvNum('duration', 0);
          } catch {}

          try {
            position = mpvNum('time-pos', 0);
          } catch {}

          try {
            volume = mpvNum('volume', 100);
            if (isNaN(volume)) volume = 100;
          } catch {}

          try {
            muted = mpvFlag('mute', false);
          } catch {}

          try {
            playlistPos = mpvNum('playlist-pos', 0);
          } catch {}

          try {
            playlistCount = mpvNum('playlist-count', 0);
          } catch {}

          try {
            speed = mpvNum('speed', 1.0);
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
    if (typeof iina === 'undefined' || !iina.mpv) return;
    try {
      const clamped = Math.max(0, Math.min(100, Math.round(volume)));
      // Use a command instead of mpv.set to avoid potential blocking and
      // feedback loops through the volume-changed event.
      if (typeof iina.mpv.command === 'function') {
        iina.mpv.command('set', ['volume', String(clamped)]);
      } else if (iina.mpv.set) {
        iina.mpv.set('volume', clamped);
      }
      iina.console.log('[HomeAssistant Bridge] setVolume -> ' + clamped);
    } catch (err) {
      iina.console.log('[HomeAssistant Bridge] setVolume ERROR: ' + err);
    }
  }

  public setMute(mute: boolean): void {
    if (typeof iina === 'undefined' || !iina.mpv) return;
    try {
      iina.mpv.set('mute', mute);
    } catch (err) {
      iina.console.log('[HomeAssistant Bridge] setMute ERROR: ' + err);
    }
  }

  public volumeStep(step: number): void {
    if (typeof iina === 'undefined' || !iina.mpv) return;
    try {
      iina.mpv.command('add', ['volume', step]);
    } catch (err) {
      iina.console.log('[HomeAssistant Bridge] volumeStep ERROR: ' + err);
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
      try { idle = iina.mpv && iina.mpv.getFlag ? Boolean(iina.mpv.getFlag('idle-active')) : false; } catch { idle = true; }
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
    if (typeof iina !== 'undefined' && iina.mpv && iina.mpv.getFlag) {
      const isPaused = Boolean(iina.mpv.getFlag('pause'));
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
