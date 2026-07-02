// ============================================================
// 剪映 (CapCut Desktop) draft_content.json 类型定义
// 时间单位：微秒 (1 秒 = 1_000_000 μs)
// ============================================================

/** 时间范围，start 和 duration 均为微秒 */
export interface TimeRange {
  start: number;
  duration: number;
}

/** 二维缩放 */
export interface Scale {
  x: number;
  y: number;
}

/** 空间变换 */
export interface Transform {
  x: number;
  y: number;
  rotation?: number;
  scale?: Scale;
}

/** 片段的裁剪/变换/透明度信息 */
export interface Clip {
  alpha?: number;
  transform?: Transform;
}

// ---- Materials ----

export interface VideoMaterial {
  id: string;
  path: string;
  type: 'photo' | 'video';
  width: number;
  height: number;
  duration: number;
  material_name: string;
}

export interface AudioMaterial {
  id: string;
  path: string;
  type: 'extract_music' | 'music';
  duration: number;
  material_name: string;
}

export interface TextMaterial {
  id: string;
  type: 'text';
  content: string;
  font_path: string;
  font_size: number;
  font_color: [number, number, number];
  background_color: [number, number, number];
  background_alpha: number;
  alignment: number;
}

export interface Materials {
  videos: VideoMaterial[];
  audios: AudioMaterial[];
  texts: TextMaterial[];
  material_animations: unknown[];
  speeds: unknown[];
  transitions: unknown[];
  canvases: unknown[];
  sound_channel_mappings: unknown[];
}

// ---- Tracks & Segments ----

export interface Segment {
  id: string;
  material_id: string;
  target_timerange: TimeRange;
  source_timerange?: TimeRange;
  clip?: Clip;
  visible: boolean;
  speed?: number;
  volume?: number;
}

export type TrackType = 'video' | 'audio' | 'text';

export interface Track {
  id: string;
  type: TrackType;
  attribute?: number;
  flag?: number;
  segments: Segment[];
}

// ---- Canvas ----

export interface CanvasConfig {
  width: number;
  height: number;
  ratio: string;
}

// ---- Top-level draft_content.json ----

export interface DraftContent {
  id: string;
  name: string;
  type: 'draft';
  canvas_config: CanvasConfig;
  duration: number;
  materials: Materials;
  tracks: Track[];
  mutable_config: null;
  config: null;
}

// ---- draft_info.json ----

export interface DraftInfo {
  name: string;
  id: string;
  create_time: number;   // 毫秒时间戳
  modify_time: number;   // 毫秒时间戳
  draft_root_path: string;
}

// ---- draft_meta_info.json ----

export interface DraftMetaInfo {
  draft_id: string;
  draft_name: string;
  draft_fold_path: string;
  tm_draft_create: number;
  tm_draft_modified: number;
}
