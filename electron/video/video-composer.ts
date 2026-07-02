// ============================================================
// VideoComposer — 用 fluent-ffmpeg 将图片+音频+字幕合成为 MP4
// 对标 Storybound 原方案的 video_compose.py (MoviePy + FFmpeg)
// 支持 Ken Burns 动画效果（zoompan 缩放/平移）
// ============================================================

import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';

// 设置 ffmpeg / ffprobe 二进制路径（使用静态打包版本）
const ffmpegPath: string = require('ffmpeg-static');
const ffprobePath: string = require('ffprobe-static').path;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

export interface ComposeSegment {
  /** 图片绝对路径 */
  imagePath: string;
  /** 该分镜显示时长（秒） */
  duration: number;
  /** 字幕文本（可选） */
  text?: string;
}

export interface ComposeInput {
  /** 分镜片段列表 */
  segments: ComposeSegment[];
  /** 配音音频绝对路径 */
  audioPath: string;
  /** 配音总时长（秒） */
  audioDuration: number;
  /** SRT 字幕文件路径（可选，提供后烧录字幕） */
  srtPath?: string;
  /** BGM 音频路径（可选） */
  bgmPath?: string;
  /** BGM 音量 0-1（默认 0.15） */
  bgmVolume?: number;
  /** 输出视频路径 */
  outputPath: string;
  /** 画布宽度（默认 1080） */
  width?: number;
  /** 画布高度（默认 1920） */
  height?: number;
  /** 帧率（默认 30） */
  fps?: number;
  /** 进度回调 */
  onProgress?: (percent: number, message: string) => void;
  /** 取消信号 */
  signal?: AbortSignal;
}

/**
 * Ken Burns 动画模式：
 * - zoom_in:  缓慢放大（从 100% → 115%），聚焦中心
 * - zoom_out: 缓慢缩小（从 115% → 100%），展示全貌
 * - pan_right: 从左到右平移
 * - pan_left:  从右到左平移
 */
type KenBurnsEffect = 'zoom_in' | 'zoom_out' | 'pan_right' | 'pan_left';

const KB_EFFECTS: KenBurnsEffect[] = ['zoom_in', 'zoom_out', 'pan_right', 'pan_left'];

/**
 * 将图片序列 + 音频 + 字幕合成为 MP4 视频文件。
 *
 * 三步走：
 * Step A: 为每张图片生成带 Ken Burns 动画的视频片段
 * Step B: 用 concat 协议拼接所有片段 → 无声 slideshow 视频
 * Step C: slideshow + 配音 + BGM + 字幕 → 最终 MP4
 */
export async function composeVideo(input: ComposeInput): Promise<string> {
  const {
    segments,
    audioPath,
    srtPath,
    bgmPath,
    bgmVolume = 0.15,
    outputPath,
    width = 1080,
    height = 1920,
    fps = 30,
    onProgress,
    signal,
  } = input;

  if (segments.length === 0) {
    throw new Error('没有可合成的分镜片段');
  }

  const tmpDir = path.join(path.dirname(outputPath), '.tmp_compose');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  try {
    // ---- Step A: 为每张图片生成带动画的视频片段 ----
    onProgress?.(5, '生成动画片段...');
    if (signal?.aborted) throw new Error('已取消');

    const clipPaths: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      if (signal?.aborted) throw new Error('已取消');

      const seg = segments[i];
      const effect = KB_EFFECTS[i % KB_EFFECTS.length];
      const clipPath = path.join(tmpDir, `clip_${i.toString().padStart(3, '0')}.mp4`);

      onProgress?.(
        5 + Math.round((i / segments.length) * 30),
        `生成片段 ${i + 1}/${segments.length}（${effectLabel(effect)}）...`
      );

      await buildKenBurnsClip(seg.imagePath, clipPath, seg.duration, width, height, fps, effect, signal);
      clipPaths.push(clipPath);
    }

    // ---- Step B: concat 拼接所有片段 ----
    onProgress?.(38, '拼接所有片段...');
    if (signal?.aborted) throw new Error('已取消');

    const slideshowPath = path.join(tmpDir, 'slideshow.mp4');
    await concatClips(clipPaths, slideshowPath, tmpDir, signal);

    onProgress?.(50, '图片动画已合成，正在叠加音频...');
    if (signal?.aborted) throw new Error('已取消');

    // ---- Step C: 叠加音频 + 字幕 ----
    await mergeAudioAndSubtitles({
      slideshowPath,
      audioPath,
      srtPath,
      bgmPath,
      bgmVolume,
      outputPath,
      signal,
    });

    onProgress?.(95, '视频合成完成');

    if (!fs.existsSync(outputPath)) {
      throw new Error('视频合成失败：输出文件不存在');
    }

    onProgress?.(100, '完成');
    return outputPath;
  } finally {
    // 清理临时文件
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

function effectLabel(effect: KenBurnsEffect): string {
  const labels: Record<KenBurnsEffect, string> = {
    zoom_in: '缓慢放大',
    zoom_out: '缓慢缩小',
    pan_right: '向右平移',
    pan_left: '向左平移',
  };
  return labels[effect];
}

/**
 * 为单张图片生成带 Ken Burns 动画效果的视频片段。
 *
 * 使用 ffmpeg 的 zoompan 滤镜：
 * - zoom: 控制缩放比例，从 z_start 到 z_end 线性变化
 * - x/y:  控制画面中心偏移，实现平移效果
 *
 * zoompan 输出原生尺寸为 zoom*input_size，后面再 scale 到目标画布。
 */
function buildKenBurnsClip(
  imagePath: string,
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  fps: number,
  effect: KenBurnsEffect,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const totalFrames = Math.ceil(duration * fps);

    // zoompan 参数：
    // z: zoom level (1.0 = 原大小)
    // d: total frames
    // x, y: pan offset within the zoomed canvas
    // s: output size of zoompan (before final scale)
    //
    // 为了平移效果，我们把图片先缩放到比画布更大的尺寸，
    // 然后用 zoompan 在更大的画面上移动裁切窗口。

    // zoompan 的 s 参数设为目标画布尺寸
    // 输入图片先 scale 到更大的尺寸以支持平移和缩放
    const zpW = width;
    const zpH = height;

    let zpFilter: string;

    switch (effect) {
      case 'zoom_in':
        // 从 1.0 放大到 1.15，中心对齐
        zpFilter = `zoompan=z='min(1.0+0.15*on/${totalFrames},1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${zpW}x${zpH}:fps=${fps}`;
        break;
      case 'zoom_out':
        // 从 1.15 缩小到 1.0，中心对齐
        zpFilter = `zoompan=z='max(1.15-0.15*on/${totalFrames},1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${zpW}x${zpH}:fps=${fps}`;
        break;
      case 'pan_right':
        // 固定 1.15x 缩放，从左到右平移
        zpFilter = `zoompan=z='1.15':x='(iw-iw/zoom)*on/${totalFrames}':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${zpW}x${zpH}:fps=${fps}`;
        break;
      case 'pan_left':
        // 固定 1.15x 缩放，从右到左平移
        zpFilter = `zoompan=z='1.15':x='(iw-iw/zoom)*(1-on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${zpW}x${zpH}:fps=${fps}`;
        break;
    }

    // 完整 filter chain:
    // 1. scale 图片到比目标大的尺寸（给 zoompan 活动空间）
    // 2. setsar=1 修正像素比
    // 3. zoompan 执行动画
    // 4. 如果 zoompan 输出的尺寸和目标不完全一致，再 scale 一次
    const filterChain = [
      `scale=${Math.round(zpW * 1.5)}:${Math.round(zpH * 1.5)}:force_original_aspect_ratio=increase`,
      `crop=${Math.round(zpW * 1.5)}:${Math.round(zpH * 1.5)}`,
      'setsar=1',
      zpFilter,
    ].join(',');

    const cmd = ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop', '1'])
      .outputOptions([
        '-vf', filterChain,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'fast',
        '-crf', '23',
        '-t', String(duration),
        '-an',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(new Error(`片段动画生成失败: ${err.message}`)));

    if (signal) {
      const onAbort = () => {
        try { cmd.kill('SIGKILL'); } catch {}
        reject(new Error('已取消'));
      };
      if (signal.aborted) { reject(new Error('已取消')); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    cmd.run();
  });
}

/**
 * 用 concat demuxer 将多个视频片段拼接成一个。
 */
function concatClips(
  clipPaths: string[],
  outputPath: string,
  tmpDir: string,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const listPath = path.join(tmpDir, 'concat_clips.txt');
    const lines = clipPaths.map(p => {
      const safe = p.replace(/\\/g, '/').replace(/'/g, "'\\''");
      return `file '${safe}'`;
    });
    fs.writeFileSync(listPath, lines.join('\n'), 'utf-8');

    const cmd = ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        '-c', 'copy',
        '-an',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(new Error(`片段拼接失败: ${err.message}`)));

    if (signal) {
      const onAbort = () => {
        try { cmd.kill('SIGKILL'); } catch {}
        reject(new Error('已取消'));
      };
      if (signal.aborted) { reject(new Error('已取消')); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    cmd.run();
  });
}

/**
 * 将 slideshow + 配音 + BGM + 字幕合并为最终输出。
 */
function mergeAudioAndSubtitles(opts: {
  slideshowPath: string;
  audioPath: string;
  srtPath?: string;
  bgmPath?: string;
  bgmVolume: number;
  outputPath: string;
  signal?: AbortSignal;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const { slideshowPath, audioPath, srtPath, bgmPath, bgmVolume, outputPath, signal } = opts;

    const cmd = ffmpeg().input(slideshowPath).input(audioPath);

    const filterParts: string[] = [];
    let audioOutputLabel = '1:a';
    let videoOutputLabel = '0:v';

    // BGM 混音
    if (bgmPath && fs.existsSync(bgmPath)) {
      cmd.input(bgmPath);
      filterParts.push(`[1:a]volume=1.0[voice]`);
      filterParts.push(`[2:a]volume=${bgmVolume}[bgm]`);
      filterParts.push(`[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`);
      audioOutputLabel = '[aout]';
    }

    // 字幕烧录
    if (srtPath && fs.existsSync(srtPath)) {
      const srtEscaped = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      const subtitleFilter = `subtitles='${srtEscaped}':force_style='FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=80'`;

      if (filterParts.length > 0) {
        filterParts.push(`[0:v]${subtitleFilter}[vout]`);
        videoOutputLabel = '[vout]';
      } else {
        filterParts.push(`[0:v]${subtitleFilter}[vout]`);
        videoOutputLabel = '[vout]';
      }
    }

    const outputOptions: string[] = [
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-preset', 'fast',
      '-crf', '23',
      '-shortest',
      '-movflags', '+faststart',
    ];

    if (filterParts.length > 0) {
      outputOptions.unshift('-filter_complex', filterParts.join(';'));
      outputOptions.push('-map', videoOutputLabel, '-map', audioOutputLabel);
    } else {
      outputOptions.push('-map', '0:v', '-map', '1:a');
    }

    cmd
      .outputOptions(outputOptions)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(new Error(`音视频合成失败: ${err.message}`)));

    if (signal) {
      const onAbort = () => {
        try { cmd.kill('SIGKILL'); } catch {}
        reject(new Error('已取消'));
      };
      if (signal.aborted) { reject(new Error('已取消')); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    cmd.run();
  });
}

/**
 * 获取音频/视频文件的精确时长（秒）。
 */
export function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration ?? 0);
    });
  });
}
