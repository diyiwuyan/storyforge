// ============================================================
// Edge TTS Provider
// ============================================================
//
// Uses Microsoft's Edge Read Aloud service via the `edge-tts`
// Python CLI tool.  This is the simplest reliable approach:
//   1. Check that `edge-tts` is installed (pip install edge-tts)
//   2. Spawn a child process to generate audio
//   3. Probe the resulting MP3 file for its duration
//
// If `edge-tts` is not available, the provider throws with a
// clear installation instruction so the user can resolve it.
// ============================================================

import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { TTSProvider, TTSOptions, TTSResult } from './base';

const DEFAULT_VOICE = 'zh-CN-YunxiNeural';

/**
 * TTS provider that delegates to the `edge-tts` Python CLI.
 *
 * Requirements:
 *   pip install edge-tts
 *
 * The CLI is called as:
 *   edge-tts --voice <voice> --rate <rate> --text <text> --write-media <path>
 */
export class EdgeTTSProvider implements TTSProvider {
  readonly name = 'EdgeTTS';
  private available: boolean | null = null;

  /**
   * Check whether the `edge-tts` command is available on this system.
   * Result is cached after the first probe.
   */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;

    return new Promise<boolean>((resolve) => {
      execFile('edge-tts', ['--version'], (err) => {
        this.available = !err;
        resolve(this.available);
      });
    });
  }

  async synthesize(options: TTSOptions, savePath: string): Promise<TTSResult> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        '[EdgeTTSProvider] edge-tts is not installed. ' +
        'Run "pip install edge-tts" to enable this provider.'
      );
    }

    const voice = options.voice ?? DEFAULT_VOICE;
    const speed = options.speed ?? 1.0;

    // edge-tts expects rate as "+0%" / "-50%" / "+100%" etc.
    const ratePercent = Math.round((speed - 1.0) * 100);
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

    // Ensure the output directory exists
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Run edge-tts CLI
    await this.runEdgeTTS(options.text, voice, rateStr, savePath);

    // Verify the file was created
    if (!fs.existsSync(savePath)) {
      throw new Error(`[EdgeTTSProvider] Output file not created: ${savePath}`);
    }

    // Estimate duration from file size.
    // MP3 at 128kbps = 16,000 bytes/sec.  This is a rough estimate
    // that works well enough for pipeline scheduling.  A precise
    // duration can be obtained later by ffprobe if needed.
    const stat = fs.statSync(savePath);
    const estimatedDuration = stat.size / 16000;

    return {
      audioPath: savePath,
      duration: Math.round(estimatedDuration * 10) / 10,
    };
  }

  /** Spawn the edge-tts process and wait for it to finish. */
  private runEdgeTTS(
    text: string,
    voice: string,
    rate: string,
    outputPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '--voice', voice,
        '--rate', rate,
        '--text', text,
        '--write-media', outputPath,
      ];

      execFile('edge-tts', args, { timeout: 120_000 }, (err, _stdout, stderr) => {
        if (err) {
          const msg = stderr?.trim() || err.message;
          reject(new Error(`[EdgeTTSProvider] edge-tts failed: ${msg}`));
          return;
        }
        resolve();
      });
    });
  }
}
