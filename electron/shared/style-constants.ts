// ============================================================
// 共享画风常量
// ============================================================

/** Style mapping: Chinese style name -> English prompt suffix */
export const STYLE_MAP: Record<string, string> = {
  '黑白摄影': 'black and white photography, cinematic lighting, dramatic shadows, high contrast, film grain',
  '写实彩色': 'photorealistic, natural lighting, detailed textures, vivid colors, sharp focus',
  '油画风格': 'oil painting style, brush strokes, classical art, rich colors, painterly',
  '古风电影': 'Chinese historical drama, cinematic, ancient China, moody lighting, elegant composition',
  '中国水墨': 'Chinese ink wash painting, sumi-e style, minimalist, black ink on rice paper, ethereal',
  '动漫插画': 'anime illustration style, vibrant colors, detailed character art, soft lighting',
  '赛博朋克': 'cyberpunk style, neon lights, futuristic city, dark atmosphere, high tech low life',
  '温暖治愈': 'warm cozy illustration, soft pastel colors, gentle lighting, heartwarming scene',
  '皮克斯3D': 'Pixar 3D animation style, colorful, expressive characters, soft lighting, cinematic composition',
  '复古胶片': 'vintage film photography, warm tones, film grain, nostalgic, 35mm analog photography',
  '水彩治愈': 'watercolor illustration, soft pastel colors, gentle brushstrokes, dreamy and healing atmosphere',
  '杂志插画': 'editorial illustration, clean lines, modern graphic design, magazine style, bold colors',
  '现代电影': 'modern cinematic style, dramatic lighting, shallow depth of field, color grading, 4K',
};

/** Default style if user's choice is not in the map */
export const DEFAULT_STYLE = 'cinematic lighting, detailed, high quality, professional';

// ============================================================
// 共享图片尺寸常量
// ============================================================

/** Image generation dimensions by aspect ratio */
export const IMAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '9:16': { width: 768, height: 1344 },
  '16:9': { width: 1344, height: 768 },
};

export const DEFAULT_IMAGE_DIMENSIONS = { width: 1024, height: 1024 };

/** CapCut canvas dimensions by aspect ratio */
export const CANVAS_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
};
