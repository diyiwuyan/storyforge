// ============================================================
// DraftBuilder — 根据 segments + audio 构建 draft_content.json
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
  DraftContent,
  Materials,
  VideoMaterial,
  AudioMaterial,
  TextMaterial,
  Track,
  Segment,
} from './types';
import { calculateCoverScale } from './image-scaler';

// 1 秒 = 1_000_000 微秒
const MICROSECONDS = 1_000_000;

/** 秒 → 微秒 */
function toMicro(seconds: number): number {
  return Math.round(seconds * MICROSECONDS);
}

// ---- 公开接口 ----

export interface SegmentInput {
  /** 字幕文本 */
  text: string;
  /** 图片绝对路径 */
  imagePath: string;
  /** 此片段显示时长（秒） */
  duration: number;
  /** 图片原始宽度 (px)，可选，默认 1024 */
  imageWidth?: number;
  /** 图片原始高度 (px)，可选，默认 1024 */
  imageHeight?: number;
}

export interface BuildInput {
  title: string;
  segments: SegmentInput[];
  /** 配音音频绝对路径 */
  audioPath: string;
  /** 配音总时长（秒） */
  audioDuration: number;
  /** 画布宽度，默认 1080 */
  canvasWidth?: number;
  /** 画布高度，默认 1920 */
  canvasHeight?: number;
  /** BGM 音频绝对路径（可选，提供后将在 draft 中添加 BGM 轨道） */
  bgmPath?: string;
  /** BGM 音量，默认 0.3（范围 0-1） */
  bgmVolume?: number;
}

// ---- Builder ----

export class DraftBuilder {
  /**
   * 将业务层输入一次性转换为完整的 DraftContent 对象，
   * 可直接 JSON.stringify 后写入 draft_content.json。
   */
  build(input: BuildInput): DraftContent {
    const canvasW = input.canvasWidth ?? 1080;
    const canvasH = input.canvasHeight ?? 1920;

    // 1. materials
    const videoMaterials: VideoMaterial[] = [];
    const textMaterials: TextMaterial[] = [];

    for (const seg of input.segments) {
      const imgW = seg.imageWidth ?? 1024;
      const imgH = seg.imageHeight ?? 1024;

      videoMaterials.push({
        id: uuidv4(),
        path: seg.imagePath,
        type: 'photo',
        width: imgW,
        height: imgH,
        duration: toMicro(seg.duration),
        material_name: this.fileName(seg.imagePath),
      });

      textMaterials.push({
        id: uuidv4(),
        type: 'text',
        content: seg.text,
        font_path: '',
        font_size: 8.0,
        font_color: [1.0, 1.0, 1.0],
        background_color: [0.0, 0.0, 0.0],
        background_alpha: 0.6,
        alignment: 1,
      });
    }

    const audioMaterial: AudioMaterial = {
      id: uuidv4(),
      path: input.audioPath,
      type: 'extract_music',
      duration: toMicro(input.audioDuration),
      material_name: this.fileName(input.audioPath),
    };

    // 3. 总时长 = 所有图片时长之和
    const totalDuration = input.segments.reduce(
      (sum, s) => sum + toMicro(s.duration),
      0
    );

    // Build audio materials list (voiceover + optional BGM)
    const audioMaterials: AudioMaterial[] = [audioMaterial];

    // Build BGM material and track if bgmPath is provided
    let bgmMaterial: AudioMaterial | null = null;
    if (input.bgmPath) {
      bgmMaterial = {
        id: uuidv4(),
        path: input.bgmPath,
        type: 'music',
        duration: totalDuration,
        material_name: this.fileName(input.bgmPath),
      };
      audioMaterials.push(bgmMaterial);
    }

    const materials: Materials = {
      videos: videoMaterials,
      audios: audioMaterials,
      texts: textMaterials,
      material_animations: [],
      speeds: [],
      transitions: [],
      canvases: [],
      sound_channel_mappings: [],
    };

    // 2. tracks
    const videoTrack = this.buildVideoTrack(videoMaterials, canvasW, canvasH);
    const audioTrack = this.buildAudioTrack(audioMaterial);
    const textTrack = this.buildTextTrack(textMaterials, input.segments);

    const tracks: Track[] = [videoTrack, audioTrack, textTrack];

    // Add BGM track if BGM material was created
    if (bgmMaterial) {
      const bgmVolume = input.bgmVolume ?? 0.3;
      const bgmTrack = this.buildBGMTrack(bgmMaterial, totalDuration, bgmVolume);
      tracks.push(bgmTrack);
    }

    return {
      id: uuidv4(),
      name: input.title,
      type: 'draft',
      canvas_config: {
        width: canvasW,
        height: canvasH,
        ratio: 'original',
      },
      duration: totalDuration,
      materials,
      tracks,
      mutable_config: null,
      config: null,
    };
  }

  // ---- private helpers ----

  private buildVideoTrack(
    mats: VideoMaterial[],
    canvasW: number,
    canvasH: number
  ): Track {
    let cursor = 0;
    const segments: Segment[] = mats.map((m) => {
      const seg: Segment = {
        id: uuidv4(),
        material_id: m.id,
        target_timerange: { start: cursor, duration: m.duration },
        source_timerange: { start: 0, duration: m.duration },
        clip: this.buildClip(m.width, m.height, canvasW, canvasH),
        visible: true,
        speed: 1.0,
        volume: 1.0,
      };
      cursor += m.duration;
      return seg;
    });

    return {
      id: uuidv4(),
      type: 'video',
      attribute: 0,
      flag: 0,
      segments,
    };
  }

  private buildAudioTrack(mat: AudioMaterial): Track {
    const seg: Segment = {
      id: uuidv4(),
      material_id: mat.id,
      target_timerange: { start: 0, duration: mat.duration },
      source_timerange: { start: 0, duration: mat.duration },
      visible: true,
      speed: 1.0,
      volume: 1.0,
    };

    return {
      id: uuidv4(),
      type: 'audio',
      segments: [seg],
    };
  }

  /**
   * Build a BGM audio track. The BGM spans the entire video duration
   * and its volume is set to the specified level (default 0.3).
   */
  private buildBGMTrack(
    mat: AudioMaterial,
    totalDuration: number,
    volume: number
  ): Track {
    const seg: Segment = {
      id: uuidv4(),
      material_id: mat.id,
      target_timerange: { start: 0, duration: totalDuration },
      source_timerange: { start: 0, duration: totalDuration },
      visible: true,
      speed: 1.0,
      volume,
    };

    return {
      id: uuidv4(),
      type: 'audio',
      segments: [seg],
    };
  }

  private buildTextTrack(
    mats: TextMaterial[],
    inputs: SegmentInput[]
  ): Track {
    let cursor = 0;
    const segments: Segment[] = mats.map((m, i) => {
      const dur = toMicro(inputs[i].duration);
      const seg: Segment = {
        id: uuidv4(),
        material_id: m.id,
        target_timerange: { start: cursor, duration: dur },
        clip: {
          transform: { x: 0.0, y: 0.35 },
        },
        visible: true,
      };
      cursor += dur;
      return seg;
    });

    return {
      id: uuidv4(),
      type: 'text',
      segments,
    };
  }

  /** 根据图片尺寸和画布尺寸生成 cover 模式的 clip */
  private buildClip(
    imgW: number,
    imgH: number,
    canvasW: number,
    canvasH: number
  ) {
    const s = calculateCoverScale(imgW, imgH, canvasW, canvasH);
    return {
      alpha: 1.0,
      transform: {
        x: s.offsetX,
        y: s.offsetY,
        rotation: 0.0,
        scale: { x: s.scaleX, y: s.scaleY },
      },
    };
  }

  /** 从绝对路径中提取文件名 */
  private fileName(p: string): string {
    const sep = p.lastIndexOf('\\');
    const sep2 = p.lastIndexOf('/');
    const idx = Math.max(sep, sep2);
    return idx === -1 ? p : p.substring(idx + 1);
  }
}
