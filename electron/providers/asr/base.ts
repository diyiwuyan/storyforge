// ============================================================
// ASR Provider Interface
// ============================================================

export interface WordTimestamp {
  word: string;
  start: number;  // 秒
  end: number;    // 秒
}

export interface ASRResult {
  text: string;
  words: WordTimestamp[];
  duration: number;  // 总时长（秒）
}

export interface ASRProvider {
  readonly name: string;
  recognize(audioPath: string): Promise<ASRResult>;
}
