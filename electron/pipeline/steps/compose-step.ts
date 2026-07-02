// ============================================================
// Step 8: 视频合成 (Video Composition)
// ============================================================

import fs from 'fs';
import path from 'path';
import { BaseStep } from '../base-step';
import { StepId, StepContext, StepResult } from '../types';
import { composeVideo, probeDuration } from '../../video/video-composer';
import { getSettings } from '../../store/settings';
import { getBGMManager } from '../../bgm/bgm-manager';

/**
 * ComposeStep 将分镜图片 + 配音音频 + SRT 字幕合成为 MP4 视频文件。
 *
 * 输入:
 * - segments[].imagePath (from imagen step)
 * - segments[].duration  (from storyboard / tts alignment)
 * - audioPath + audioDuration (from tts step)
 * - srtPath (from tts step, optional)
 * - config.aspectRatio for canvas dimensions
 * - config.bgmId for background music (optional)
 *
 * 输出:
 * - videoPath: 合成后的 MP4 文件路径
 * - videoDuration: 视频总时长（秒）
 */
export class ComposeStep extends BaseStep {
  readonly id: StepId = 'compose';
  readonly name = '视频合成';
  readonly description = '将图片、音频、字幕合成为 MP4 视频文件';
  readonly dependencies: StepId[] = ['imagen', 'tts'];

  /**
   * 如果视频文件已存在则可跳过。
   */
  canSkip(ctx: StepContext): boolean {
    if (!ctx.data.videoPath) return false;
    return fs.existsSync(ctx.data.videoPath);
  }

  async execute(ctx: StepContext): Promise<StepResult> {
    ctx.onProgress(0, '准备视频合成...');

    // 验证输入
    const segments = ctx.data.segments;
    const audioPath = ctx.data.audioPath;
    const audioDuration = ctx.data.audioDuration;

    if (!segments || segments.length === 0) {
      throw new Error('缺少分镜数据（segments），请先执行之前的步骤');
    }

    if (!audioPath || !fs.existsSync(audioPath)) {
      throw new Error('缺少配音文件，请先执行 TTS 配音步骤');
    }

    if (!audioDuration || audioDuration <= 0) {
      throw new Error('配音时长无效，请重新执行 TTS 配音步骤');
    }

    // 过滤出有图片的分镜
    const validSegments = segments.filter(seg => seg.imagePath && fs.existsSync(seg.imagePath));
    if (validSegments.length === 0) {
      throw new Error('没有成功生成图片的分镜，无法合成视频');
    }

    if (ctx.signal.aborted) throw new Error('已取消');

    ctx.onProgress(5, '计算画布尺寸...');

    // 画布尺寸
    const { width, height } = this.getCanvasDimensions(ctx.config.aspectRatio);

    // 按照音频时长调整分镜时长
    const adjustedSegments = this.adjustDurations(validSegments, audioDuration);

    // 输出路径
    const videoDir = path.join(ctx.projectDir, 'video');
    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true });
    }
    const outputPath = path.join(videoDir, 'output.mp4');

    // 如果旧文件存在，先删除
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    // SRT 字幕
    const srtPath = ctx.data.srtPath && fs.existsSync(ctx.data.srtPath) ? ctx.data.srtPath : undefined;

    // BGM
    let bgmPath: string | undefined;
    if (ctx.config.bgmId) {
      const bgmManager = getBGMManager();
      const bgm = bgmManager.getBGM(ctx.config.bgmId);
      if (bgm && fs.existsSync(bgm.filePath)) {
        bgmPath = bgm.filePath;
      }
    }

    if (ctx.signal.aborted) throw new Error('已取消');

    ctx.onProgress(10, `开始合成视频（${adjustedSegments.length} 个分镜）...`);

    // 调用合成
    await composeVideo({
      segments: adjustedSegments.map(seg => ({
        imagePath: seg.imagePath!,
        duration: seg.duration!,
        text: seg.text,
      })),
      audioPath,
      audioDuration,
      srtPath,
      bgmPath,
      bgmVolume: 0.15,
      outputPath,
      width,
      height,
      fps: 30,
      onProgress: (pct, msg) => {
        // 映射到 10-95 的进度范围
        const mapped = 10 + Math.round(pct * 0.85);
        ctx.onProgress(mapped, msg);
      },
      signal: ctx.signal,
    });

    // 获取精确时长
    let videoDuration = audioDuration;
    try {
      videoDuration = await probeDuration(outputPath);
    } catch {
      // 回退到音频时长
    }

    ctx.onProgress(100, `视频合成完成，时长 ${Math.round(videoDuration)} 秒`);

    return {
      data: {
        videoPath: outputPath,
        videoDuration,
      },
    };
  }

  private getCanvasDimensions(aspectRatio: '9:16' | '16:9'): { width: number; height: number } {
    if (aspectRatio === '16:9') {
      return { width: 1920, height: 1080 };
    }
    return { width: 1080, height: 1920 };
  }

  private adjustDurations(
    segments: Array<{ index: number; text: string; imagePath?: string; duration?: number }>,
    audioDuration: number
  ) {
    const totalOriginalDuration = segments.reduce(
      (sum, seg) => sum + (seg.duration ?? 5),
      0
    );
    const scaleFactor = audioDuration / totalOriginalDuration;

    return segments.map(seg => ({
      ...seg,
      duration: Math.max(2, Math.round((seg.duration ?? 5) * scaleFactor * 10) / 10),
    }));
  }
}
