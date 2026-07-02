// ============================================================
// 图片 → 画布 cover 缩放计算
// ============================================================

export interface ScaleResult {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

/**
 * 计算 cover 模式的缩放值。
 *
 * cover 逻辑：选取 scaleX / scaleY 中较大的那个，保证图片
 * 至少覆盖整个画布（多出部分被裁切）。偏移量保持 0 使图片居中。
 */
export function calculateCoverScale(
  imageWidth: number,
  imageHeight: number,
  canvasWidth: number,
  canvasHeight: number
): ScaleResult {
  const sx = canvasWidth / imageWidth;
  const sy = canvasHeight / imageHeight;
  const scale = Math.max(sx, sy);
  return {
    scaleX: scale,
    scaleY: scale,
    offsetX: 0,
    offsetY: 0,
  };
}
