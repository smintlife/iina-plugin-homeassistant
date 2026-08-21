/**
 * TypeScript types and interfaces for the IINA <-> Home Assistant WebSocket bridge.
 */

export type PlaybackState = 'playing' | 'paused' | 'idle' | 'buffering' | 'off';

export interface PlayerStateData {
  state: PlaybackState;
  has_window: boolean;
  media_title: string;
  media_artist: string;
  media_album: string;
  media_duration: number; // in seconds
  media_position: number; // in seconds
  media_image_url: string;
  volume_level: number; // 0 - 100
  is_volume_muted: boolean;
  url: string;
  playlist_pos: number;
  playlist_count: number;
  hostname: string;
  speed: number;
}

export interface WsRequestMessage {
  id?: number | string;
  action:
    | 'play'
    | 'pause'
    | 'play_pause'
    | 'stop'
    | 'seek'
    | 'volume_set'
    | 'volume_mute'
    | 'volume_step'
    | 'next'
    | 'prev'
    | 'play_media'
    | 'turn_off'
    | 'turn_on'
    | 'get_state';
  params?: {
    url?: string;
    enqueue?: 'play' | 'replace' | 'add' | 'next';
    announce?: boolean;
    position?: number;
    relative?: number;
    volume?: number;
    mute?: boolean;
    step?: number;
    speed?: number;
  };
}

export interface WsResponseMessage {
  id?: number | string;
  success: boolean;
  error?: string;
  result?: any;
}

export interface WsEventMessage {
  event: 'state_update' | 'connected' | 'error';
  data: PlayerStateData | any;
}
