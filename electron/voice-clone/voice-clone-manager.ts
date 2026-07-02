import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface ClonedVoice {
  id: string;
  name: string;           // 用户给音色起的名字
  provider: string;       // 'minimax' | 'volcano'
  voiceId: string;        // 平台返回的声音 ID
  samplePath: string;     // 原始音频样本路径
  createdAt: number;
  status: 'pending' | 'ready' | 'failed';
  error?: string;
}

export class VoiceCloneManager {
  private dir: string;
  private indexPath: string;
  private items: ClonedVoice[] = [];

  constructor() {
    this.dir = path.join(app.getPath('userData'), 'voice-clones');
    this.indexPath = path.join(this.dir, 'index.json');
    this.ensureDir();
    this.load();
  }

  private ensureDir() { if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true }); }
  private load() { if (fs.existsSync(this.indexPath)) this.items = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8')); }
  private save() { fs.writeFileSync(this.indexPath, JSON.stringify(this.items, null, 2)); }

  list(): ClonedVoice[] { return [...this.items]; }

  /**
   * 克隆声音流程：
   * 1. 用户选择音频文件
   * 2. 复制到 userData/voice-clones/ 目录
   * 3. 调用 MiniMax 声音克隆 API（或火山引擎），获得 voiceId
   * 4. 保存到 index.json
   *
   * MiniMax 声音克隆 API：
   * POST https://api.minimax.chat/v1/voice_clone
   * Headers: Authorization: Bearer {apiKey}
   * Body: multipart/form-data
   *   - file: 音频文件 (8-30秒, wav/mp3)
   *   - voice_id: 自定义 voice ID (字母数字)
   *
   * 如果 MiniMax 没有公开克隆 API，则用简化方案：
   * 保存音频文件，记录信息，标注 provider 类型，使用时直接指定 voice_id
   */
  async clone(
    name: string,
    audioPath: string,
    provider: string,
    apiKey: string,
  ): Promise<ClonedVoice> {
    // 复制音频文件到本地
    const ext = path.extname(audioPath);
    const id = crypto.randomUUID();
    const sampleFileName = `${id}${ext}`;
    const samplePath = path.join(this.dir, sampleFileName);
    fs.copyFileSync(audioPath, samplePath);

    const item: ClonedVoice = {
      id,
      name,
      provider,
      voiceId: '', // 初始为空，克隆后填充
      samplePath,
      createdAt: Date.now(),
      status: 'pending',
    };

    // 尝试调用克隆 API
    if (provider === 'minimax' && apiKey) {
      try {
        const voiceId = await this.cloneViaMiniMax(samplePath, id, apiKey);
        item.voiceId = voiceId;
        item.status = 'ready';
      } catch (err: unknown) {
        // 即使 API 失败也保存记录，用户可以后续重试
        item.status = 'failed';
        item.error = err instanceof Error ? err.message : '克隆失败';
        // 回退方案：使用文件名作为 voiceId 标识
        item.voiceId = `clone_${id}`;
      }
    } else {
      // 本地记录模式：没有实际 API 调用
      // 用于火山引擎或其他尚未对接 API 的 provider
      item.voiceId = `clone_${id}`;
      item.status = 'ready';
    }

    this.items.push(item);
    this.save();
    return item;
  }

  delete(id: string): boolean {
    const idx = this.items.findIndex(i => i.id === id);
    if (idx === -1) return false;
    const item = this.items[idx];
    // 删除本地音频文件
    if (item.samplePath && fs.existsSync(item.samplePath)) {
      fs.unlinkSync(item.samplePath);
    }
    this.items.splice(idx, 1);
    this.save();
    return true;
  }

  getById(id: string): ClonedVoice | undefined {
    return this.items.find(i => i.id === id);
  }

  /**
   * MiniMax 声音克隆 API 调用
   * 使用 MiniMax T2A v2 的 voice_clone 功能
   */
  private async cloneViaMiniMax(audioPath: string, voiceId: string, apiKey: string): Promise<string> {
    const audioBuffer = fs.readFileSync(audioPath);
    const fileName = path.basename(audioPath);

    // 构建 multipart/form-data
    const boundary = `----FormBoundary${crypto.randomUUID().replace(/-/g, '')}`;
    const crlf = '\r\n';

    // voice_id 字段
    let body = `--${boundary}${crlf}`;
    body += `Content-Disposition: form-data; name="voice_id"${crlf}${crlf}`;
    body += `${voiceId}${crlf}`;

    // file 字段头
    body += `--${boundary}${crlf}`;
    body += `Content-Disposition: form-data; name="file"; filename="${fileName}"${crlf}`;
    body += `Content-Type: audio/mpeg${crlf}${crlf}`;

    // 组装完整 body
    const bodyStart = Buffer.from(body, 'utf-8');
    const bodyEnd = Buffer.from(`${crlf}--${boundary}--${crlf}`, 'utf-8');
    const fullBody = Buffer.concat([bodyStart, audioBuffer, bodyEnd]);

    const response = await fetch('https://api.minimax.chat/v1/voice_clone', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: fullBody,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      throw new Error(`Voice clone API error: HTTP ${response.status}: ${errorText}`);
    }

    const result = (await response.json()) as { base_resp?: { status_code?: number; status_msg?: string }; voice_id?: string };
    if (result.base_resp?.status_code !== 0) {
      throw new Error(`Voice clone failed: ${result.base_resp?.status_msg || 'unknown error'}`);
    }

    return result.voice_id || voiceId;
  }
}

let instance: VoiceCloneManager;
export function getVoiceCloneManager() {
  if (!instance) instance = new VoiceCloneManager();
  return instance;
}
