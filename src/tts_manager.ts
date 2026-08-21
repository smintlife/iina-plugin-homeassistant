/**
 * Manages TTS announcements with audio ducking/pausing and automatic resumption of previous playback.
 */

declare const iina: any;

interface SavedPlaybackState {
  url: string;
  position: number;
  paused: boolean;
  volume: number;
}

export class TTSManager {
  private isAnnouncing = false;
  private savedState: SavedPlaybackState | null = null;
  private onFinishedCallback?: () => void;

  public get active(): boolean {
    return this.isAnnouncing;
  }

  /**
   * Captures current playback state before starting the announcement.
   */
  public prepareAnnouncement(): SavedPlaybackState | null {
    try {
      if (typeof iina === 'undefined' || !iina.mpv) {
        return null;
      }

      const path = iina.mpv.get('path') || '';
      const idle = iina.mpv.get('idle-active');

      if (!path || idle) {
        this.savedState = null;
        return null;
      }

      const position = Number(iina.mpv.get('time-pos')) || 0;
      const paused = Boolean(iina.mpv.get('pause'));
      const volume = Number(iina.mpv.get('volume')) || 100;

      this.savedState = {
        url: path,
        position,
        paused,
        volume,
      };

      this.isAnnouncing = true;
      return this.savedState;
    } catch (err) {
      console.error('[HomeAssistant Plugin] Error saving playback state for TTS:', err);
      this.savedState = null;
      return null;
    }
  }

  /**
   * Called when an announcement ends to restore the previous playback state.
   */
  public async restorePreviousPlayback(restoreMediaCallback: (url: string, pos: number, paused: boolean) => Promise<void>): Promise<void> {
    if (!this.isAnnouncing || !this.savedState) {
      this.isAnnouncing = false;
      this.savedState = null;
      return;
    }

    const stateToRestore = { ...this.savedState };
    this.isAnnouncing = false;
    this.savedState = null;

    try {
      console.log(`[HomeAssistant Plugin] Resuming previous media: ${stateToRestore.url} at ${stateToRestore.position}s`);
      await restoreMediaCallback(stateToRestore.url, stateToRestore.position, stateToRestore.paused);
    } catch (err) {
      console.error('[HomeAssistant Plugin] Error restoring media after TTS:', err);
    }
  }

  public cancelAnnouncement(): void {
    this.isAnnouncing = false;
    this.savedState = null;
  }
}
