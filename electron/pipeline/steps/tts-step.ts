// ============================================================
// Step 6: TTS 配音 (Text-to-Speech)
// ============================================================

import fs from 'fs';
import path from 'path';
import { BaseStep } from '../base-step';
import { StepId, StepContext, StepResult, Segment } from '../types';
import { createTTSProvider } from '../../providers/tts/factory';
import { getSettings } from '../../store/settings';
import { createASRProvider } from '../../providers/asr/factory';
import type { ASRResult, WordTimestamp } from '../../providers/asr/base';

/**
 * TTSStep synthesizes the full rewritten body into a voiceover audio file.
 *
 * Input: rewrittenBody (the complete narration text)
 * Output: audioPath + audioDuration
 *
 * Note: This step depends on 'rewrite' (not 'storyboard'), because
 * the TTS input is the complete narration text, not individual segments.
 */
export class TTSStep extends BaseStep {
  readonly id: StepId = 'tts';
  readonly name = 'TTS 配音';
  readonly description = '将口播文案合成为语音音频';
  readonly dependencies: StepId[] = ['rewrite'];

  /**
   * Can skip if the audio file already exists on disk.
   */
  canSkip(ctx: StepContext): boolean {
    if (!ctx.data.audioPath) return false;
    return fs.existsSync(ctx.data.audioPath);
  }

  async execute(ctx: StepContext): Promise<StepResult> {
    ctx.onProgress(0, '准备语音合成...');

    const rewrittenBody = ctx.data.rewrittenBody;
    if (!rewrittenBody) {
      throw new Error('缺少改写后的文案（rewrittenBody），请先执行智能改写步骤');
    }

    // Check cancellation
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(10, '初始化 TTS 服务...');

    // Get TTS settings and create provider
    const settings = getSettings();

    // 检测是否为克隆音色（格式：clone:voiceId）
    let resolvedVoice = ctx.config.voice || settings.tts.voice || 'zh-CN-YunxiNeural';
    let ttsProviderName = settings.tts.provider;

    if (resolvedVoice.startsWith('clone:')) {
      const cloneVoiceId = resolvedVoice.slice('clone:'.length);
      const { getVoiceCloneManager } = await import('../../voice-clone/voice-clone-manager');
      const cloneMgr = getVoiceCloneManager();
      const clonedItem = cloneMgr.list().find((cv: any) => cv.voiceId === cloneVoiceId);

      if (clonedItem && clonedItem.status === 'ready') {
        resolvedVoice = clonedItem.voiceId;
        if (clonedItem.provider && clonedItem.provider !== ttsProviderName) {
          ttsProviderName = clonedItem.provider;
        }
      } else if (clonedItem && clonedItem.status === 'failed') {
        throw new Error(`克隆音色「${clonedItem.name}」状态为失败：${clonedItem.error || '未知错误'}，请重新克隆`);
      } else {
        console.warn(`[TTSStep] 未找到克隆音色 ${cloneVoiceId}，回退到默认音色`);
        resolvedVoice = settings.tts.voice || 'zh-CN-YunxiNeural';
      }
    }

    const provider = createTTSProvider({
      provider: ttsProviderName,
      appId: settings.tts.appId,
      token: settings.tts.token,
      apiKey: settings.tts.apiKey,
    });

    const voice = resolvedVoice;

    // Prepare output directory and path
    const audioDir = path.join(ctx.projectDir, 'audio');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    const savePath = path.join(audioDir, 'voiceover.mp3');

    // Check cancellation
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(20, `使用音色 ${voice} 合成语音中...`);

    // Clean the text for TTS: remove special characters that might cause issues
    const cleanedText = this.prepareTTSText(rewrittenBody);

    if (cleanedText.length === 0) {
      throw new Error('准备合成的文本为空');
    }

    ctx.onProgress(30, `正在合成 ${cleanedText.length} 个字的语音（可能需要 1-2 分钟）...`);

    // Synthesize using the TTSOptions interface (text, voice, speed)
    const result = await provider.synthesize(
      {
        text: cleanedText,
        voice,
        speed: ctx.config.speed ?? 1.0,
      },
      savePath
    );

    // Check cancellation after synthesis
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    // Verify the file exists
    if (!fs.existsSync(result.audioPath)) {
      throw new Error(`TTS 合成完成但音频文件未找到: ${result.audioPath}`);
    }

    // --- ASR alignment: if configured, use Whisper to get precise timestamps ---
    const segments = ctx.data.segments;
    let alignedSegments: Segment[] | undefined;

    if (settings.asr?.apiKey && settings.asr?.provider && segments && segments.length > 0) {
      ctx.onProgress(80, '使用 ASR 进行字幕时间轴对齐...');

      try {
        const asrProvider = createASRProvider({
          provider: settings.asr.provider,
          apiKey: settings.asr.apiKey,
        });

        if (ctx.signal.aborted) throw new Error('已取消');

        const asrResult = await asrProvider.recognize(result.audioPath);

        ctx.onProgress(90, '正在对齐分镜时间轴...');

        alignedSegments = this.alignSegmentDurations(segments, asrResult);
      } catch (asrErr) {
        // ASR failure is non-fatal — fall back to estimation
        const errMsg = asrErr instanceof Error ? asrErr.message : String(asrErr);
        console.warn(`[TTSStep] ASR alignment failed, falling back to estimation: ${errMsg}`);
      }
    }

    // Generate SRT subtitle file
    const srtPath = path.join(audioDir, 'subtitles.srt');
    this.generateSRT(alignedSegments || ctx.data.segments || [], srtPath, result.duration);

    ctx.onProgress(100, `配音完成，时长约 ${Math.round(result.duration)} 秒`);

    const outputData: Record<string, unknown> = {
      audioPath: result.audioPath,
      audioDuration: result.duration,
      srtPath,
    };

    if (alignedSegments) {
      outputData.segments = alignedSegments;
    }

    return { data: outputData as any };
  }

  /**
   * Prepare text for TTS synthesis:
   * - Remove excessive punctuation that causes unnatural pauses
   * - Normalize whitespace
   * - Keep the text readable for speech synthesis
   */
  private prepareTTSText(text: string): string {
    let result = text;

    // Replace multiple newlines with a single period + space (natural pause)
    result = result.replace(/\n{2,}/g, '。');

    // Replace single newlines with a comma (short pause)
    result = result.replace(/\n/g, '，');

    // Remove multiple consecutive punctuation (e.g. "！！！" -> "！")
    result = result.replace(/([。！？，、；：])\1+/g, '$1');

    // Remove leading/trailing whitespace
    result = result.trim();

    return result;
  }

  /**
   * Align segment durations using ASR word-level timestamps.
   *
   * Strategy: For each segment, find the range of ASR words that best
   * matches the segment text by accumulating characters. The segment's
   * duration is then set to the time span covered by those words.
   */
  private alignSegmentDurations(segments: Segment[], asr: ASRResult): Segment[] {
    if (!asr.words || asr.words.length === 0) {
      return segments;
    }

    // Build a flat string from ASR words for character-level matching
    const asrChars: Array<{ char: string; wordIdx: number }> = [];
    for (let wi = 0; wi < asr.words.length; wi++) {
      const word = asr.words[wi].word;
      for (const ch of word) {
        asrChars.push({ char: ch, wordIdx: wi });
      }
    }

    const result: Segment[] = [];
    let asrCharOffset = 0;

    for (const seg of segments) {
      // Strip punctuation and whitespace from segment text for matching
      const segText = seg.text.replace(/[\s\p{P}]/gu, '');
      const segCharCount = [...segText].length;

      if (segCharCount === 0 || asrCharOffset >= asrChars.length) {
        // Empty segment or no more ASR data — use fallback estimation
        result.push({
          ...seg,
          duration: seg.duration ?? Math.max(1, Math.ceil(seg.text.length / 5)),
        });
        continue;
      }

      // Find the start word index
      const startWordIdx = asrChars[asrCharOffset]?.wordIdx ?? 0;

      // Advance by segCharCount characters in the ASR stream
      const endCharOffset = Math.min(asrCharOffset + segCharCount, asrChars.length) - 1;
      const endWordIdx = asrChars[endCharOffset]?.wordIdx ?? startWordIdx;

      const startTime = asr.words[startWordIdx].start;
      const endTime = asr.words[endWordIdx].end;
      const duration = Math.max(0.5, endTime - startTime);

      result.push({
        ...seg,
        duration: Math.round(duration * 100) / 100,
      });

      asrCharOffset += segCharCount;
    }

    return result;
  }

  /**
   * Generate an SRT subtitle file from segments.
   * If ASR-aligned precise times are available, uses them; otherwise distributes proportionally.
   */
  private generateSRT(segments: Segment[], srtPath: string, totalDuration: number): void {
    if (!segments || segments.length === 0) return;

    // Calculate cumulative start times
    let currentTime = 0;
    const lines: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const dur = seg.duration || 5;
      const startTime = currentTime;
      const endTime = currentTime + dur;

      lines.push(String(i + 1));
      lines.push(`${this.formatSRTTime(startTime)} --> ${this.formatSRTTime(endTime)}`);
      lines.push(seg.text);
      lines.push('');

      currentTime = endTime;
    }

    fs.writeFileSync(srtPath, lines.join('\n'), 'utf-8');
  }

  /**
   * Format seconds to SRT time format: HH:MM:SS,mmm
   */
  private formatSRTTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }
}
