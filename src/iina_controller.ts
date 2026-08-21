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

    try {
      if (typeof iina !== 'undefined') {
        if (iina.core && iina.core.window) {
          hasWindow = true;
        }

        if (iina.mpv) {
          try {
            isIdle = Boolean(iina.mpv.get('idle-active'));
          } catch {
            isIdle = true;
          }

          try {
            isPaused = Boolean(iina.mpv.get('pause'));
          } catch {}

          try {
            isBuffering = Boolean(iina.mpv.get('paused-for-cache'));
          } catch {}

          try {
            path = String(iina.mpv.get('path') || '');
            if (path) {
              hasWindow = true;
            }
          } catch {}

          try {
            title = String(iina.mpv.get('media-title') || iina.mpv.get('filename') || '');
          } catch {}

          try {
            artist = String(
              iina.mpv.get('metadata/by-key/artist') ||
                iina.mpv.get('metadata/by-key/ARTIST') ||
                iina.mpv.get('metadata/artist') ||
                ''
            );
          } catch {}

          try {
            album = String(
              iina.mpv.get('metadata/by-key/album') ||
                iina.mpv.get('metadata/by-key/ALBUM') ||
                iina.mpv.get('metadata/album') ||
                ''
            );
          } catch {}

          try {
            duration = Number(iina.mpv.get('duration')) || 0;
          } catch {}

          try {
            position = Number(iina.mpv.get('time-pos')) || 0;
          } catch {}

          try {
            volume = Number(iina.mpv.get('volume'));
            if (isNaN(volume)) volume = 100;
          } catch {}

          try {
            muted = Boolean(iina.mpv.get('mute'));
          } catch {}

          try {
            playlistPos = Number(iina.mpv.get('playlist-pos')) || 0;
          } catch {}

          try {
            playlistCount = Number(iina.mpv.get('playlist-count')) || 0;
          } catch {}

          try {
            speed = Number(iina.mpv.get('speed')) || 1.0;
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
      iina.mpv.command('cycle', 'pause');
    }
  }

  public stop(): void {
    if (typeof iina !== 'undefined' && iina.mpv) {
      iina.mpv.command('stop');
    }
  }

  public seek(position?: number, relative?: number): void {
    if (typeof iina !== 'undefined' && iina.mpv) {
      if (typeof position === 'number') {
        iina.mpv.command('seek', position, 'absolute');
      } else if (typeof relative === 'number') {
        iina.mpv.command('seek', relative, 'relative');
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
      iina.mpv.command('add', 'volume', step);
    }
  }

  public nextTrack(): void {
    if (typeof iina !== 'undefined' && iina.mpv) {
      iina.mpv.command('playlist-next', 'weak');
    }
  }

  public prevTrack(): void {
    if (typeof iina !== 'undefined' && iina.mpv) {
      iina.mpv.command('playlist-prev', 'weak');
    }
  }

  public async playMedia(url: string, enqueue: 'play' | 'replace' | 'add' | 'next' = 'play', announce = false): Promise<void> {
    if (!url) return;

    if (announce) {
      this.ttsManager.prepareAnnouncement();
    } else {
      this.ttsManager.cancelAnnouncement();
    }

    if (typeof iina !== 'undefined') {
      const idle = Boolean(iina.mpv && iina.mpv.get('idle-active'));
      const hasWindow = Boolean(iina.core && iina.core.window);
      console.log(`[HomeAssistant Bridge] playMedia: url=${url} enqueue=${enqueue} idle=${idle} hasWindow=${hasWindow}`);

      if (!hasWindow || idle || enqueue === 'play' || enqueue === 'replace') {
        if (iina.core && typeof iina.core.open === 'function') {
          console.log('[HomeAssistant Bridge] playMedia: using iina.core.open');
          iina.core.open(url);
        } else if (iina.mpv) {
          console.log('[HomeAssistant Bridge] playMedia: using mpv loadfile replace');
          iina.mpv.command('loadfile', url, 'replace');
        } else {
          console.log('[HomeAssistant Bridge] playMedia: NO open path available (no core.open, no mpv)');
        }
      } else if (enqueue === 'add') {
        if (iina.mpv) {
          iina.mpv.command('loadfile', url, 'append');
        }
      } else if (enqueue === 'next') {
        if (iina.mpv) {
          iina.mpv.command('loadfile', url, 'append');
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
        iina.mpv.command('loadfile', url, 'replace');
      }

      // Seek and set pause state after a short buffer
      setTimeout(() => {
        try {
          if (iina.mpv) {
            if (position > 0) {
              iina.mpv.command('seek', position, 'absolute');
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
