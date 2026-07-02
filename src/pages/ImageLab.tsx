import { useState, useEffect, useCallback } from 'react';
import { toLocalFileUrl } from '../utils/local-file';

// ====================== Constants ======================

const STYLES = [
  '黑白摄影',
  '写实彩色',
  '油画风格',
  '古风电影',
  '中国水墨',
  '动漫插画',
  '赛博朋克',
  '温暖治愈',
  '皮克斯3D',
  '复古胶片',
  '水彩治愈',
  '杂志插画',
  '现代电影',
];

const SIZES = [
  { label: '1024 x 1024', width: 1024, height: 1024 },
  { label: '768 x 1024 (竖)', width: 768, height: 1024 },
  { label: '1024 x 768 (横)', width: 1024, height: 768 },
];

const LOCAL_STORAGE_KEY = 'storyforge:imagelab:history';
const MAX_HISTORY = 20;

// ====================== Types ======================

interface HistoryItem {
  id: string;
  imagePath: string;
  prompt: string;
  englishPrompt: string;
  style: string;
  size: string;
  createdAt: number;
}

// ====================== Helpers ======================

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryItem[];
  } catch {
    return [];
  }
}

function saveHistory(history: HistoryItem[]): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

// ====================== Component ======================

function ImageLab() {
  // --- Configuration State ---
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState(STYLES[0]);
  const [sizeIndex, setSizeIndex] = useState(0);
  const [engine, setEngine] = useState('');
  const [engineOptions, setEngineOptions] = useState<string[]>([]);

  // --- Custom Styles ---
  const [customStyles, setCustomStyles] = useState<CustomStyleItem[]>([]);
  const [showCreateStyle, setShowCreateStyle] = useState(false);
  const [newStyleName, setNewStyleName] = useState('');
  const [newStyleDesc, setNewStyleDesc] = useState('');
  const [creatingStyle, setCreatingStyle] = useState(false);
  const [createStyleError, setCreateStyleError] = useState('');

  // --- Generation State ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // --- Result State ---
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentPromptEn, setCurrentPromptEn] = useState('');

  // --- History ---
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [previewItem, setPreviewItem] = useState<HistoryItem | null>(null);

  // Load history and custom styles on mount
  useEffect(() => {
    setHistory(loadHistory());
    loadCustomStyles();
  }, []);

  const loadCustomStyles = async () => {
    try {
      const list = await window.storyforge?.style?.list?.();
      if (list) setCustomStyles(list);
    } catch (err) {
      console.error('加载自定义画风失败:', err);
    }
  };

  const handleCreateStyle = async () => {
    if (!newStyleName.trim() || !newStyleDesc.trim()) return;
    setCreatingStyle(true);
    setCreateStyleError('');
    try {
      await window.storyforge.style.create({
        name: newStyleName.trim(),
        description: newStyleDesc.trim(),
      });
      setNewStyleName('');
      setNewStyleDesc('');
      setShowCreateStyle(false);
      await loadCustomStyles();
    } catch (err: any) {
      setCreateStyleError(err?.message || '创建失败');
    } finally {
      setCreatingStyle(false);
    }
  };

  const handleDeleteStyle = async (id: string) => {
    try {
      await window.storyforge.style.delete(id);
      await loadCustomStyles();
      // If the deleted style was selected, reset to first built-in
      const deleted = customStyles.find(s => s.id === id);
      if (deleted && style === `custom:${id}`) {
        setStyle(STYLES[0]);
      }
    } catch (err) {
      console.error('删除自定义画风失败:', err);
    }
  };

  // Load engine settings on mount
  useEffect(() => {
    window.storyforge?.settings?.get?.().then((settings: any) => {
      const provider = settings?.imagen?.provider || 'siliconflow';
      const providers = ['siliconflow', 'replicate', 'jimeng', 'modelscope'];
      setEngineOptions(providers);
      setEngine(provider);
    });
  }, []);

  // --- Generate ---
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');

    try {
      const size = SIZES[sizeIndex];
      const result = await window.storyforge.imagen.test({
        prompt: prompt.trim(),
        style,
        width: size.width,
        height: size.height,
        engine,
      });

      setCurrentImage(result.imagePath);
      setCurrentPromptEn(result.englishPrompt);

      // Add to history
      const item: HistoryItem = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        imagePath: result.imagePath,
        prompt: prompt.trim(),
        englishPrompt: result.englishPrompt,
        style,
        size: `${size.width}x${size.height}`,
        createdAt: Date.now(),
      };
      const updated = [item, ...history].slice(0, MAX_HISTORY);
      setHistory(updated);
      saveHistory(updated);
    } catch (err: any) {
      setError(err?.message || '生成失败，请检查设置');
    } finally {
      setLoading(false);
    }
  }, [prompt, style, sizeIndex, history]);

  const handleHistoryClick = (item: HistoryItem) => {
    setPreviewItem(item);
  };

  const handleClosePreview = () => {
    setPreviewItem(null);
  };

  const handleClearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="shrink-0 px-6 py-5 border-b border-white/5">
        <h2 className="text-2xl font-bold text-gray-100">画图实验室</h2>
        <p className="mt-1 text-sm text-gray-500">
          在这里快速测试不同画风和提示词的效果
        </p>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Left Panel - Configuration (40%) */}
        <div className="w-[40%] shrink-0 border-r border-white/5 overflow-y-auto p-6 space-y-6">
          {/* Prompt Input */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">提示词输入</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你想要生成的图片，支持中文或英文..."
              rows={5}
              className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-3 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-[#34d399] transition-colors"
            />
            <div className="mt-1 text-xs text-gray-600 text-right">
              {prompt.length} 字
            </div>
          </div>

          {/* Style Selection */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">画风选择</label>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                    style === s
                      ? 'bg-[#34d399]/20 text-[#34d399] border border-[#34d399]/40'
                      : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  {s}
                </button>
              ))}
              {/* Custom styles */}
              {customStyles.map((cs) => (
                <div key={cs.id} className="relative group/style">
                  <button
                    onClick={() => setStyle(`custom:${cs.id}`)}
                    className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                      style === `custom:${cs.id}`
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-400/40'
                        : 'bg-white/5 text-purple-300 border border-purple-500/20 hover:bg-purple-500/10'
                    }`}
                    title={cs.promptSuffix}
                  >
                    {cs.name}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteStyle(cs.id); }}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500/80 text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover/style:opacity-100 transition-opacity hover:bg-red-500"
                    title="删除画风"
                  >
                    x
                  </button>
                </div>
              ))}
              {/* Create custom style button */}
              <button
                onClick={() => setShowCreateStyle(true)}
                className="px-3 py-1.5 rounded-full text-xs text-purple-400 border border-dashed border-purple-500/30 hover:bg-purple-500/10 transition-colors"
              >
                + 自定义画风
              </button>
            </div>
          </div>

          {/* Size Selection */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">尺寸选择</label>
            <div className="flex flex-col gap-2">
              {SIZES.map((s, idx) => (
                <label key={s.label} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="labSize"
                    checked={sizeIndex === idx}
                    onChange={() => setSizeIndex(idx)}
                    className="accent-[#34d399]"
                  />
                  <span className="text-sm text-gray-300">{s.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Engine Selection */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">生图引擎</label>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
              className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#34d399] transition-colors appearance-none cursor-pointer"
            >
              {engineOptions.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || loading}
            className="w-full py-3 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[#34d399] to-[#059669] hover:from-[#2cc88e] hover:to-[#047857] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>生成中...</span>
              </>
            ) : (
              '生成测试图'
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-400/10 border border-red-400/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Right Panel - Results (60%) */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {/* Current Image Preview */}
          {currentImage ? (
            <div className="space-y-3">
              <h3 className="text-sm text-gray-400 uppercase tracking-wide">当前生成</h3>
              <div className="rounded-lg bg-[#0c121c] border border-white/5 overflow-hidden">
                <img
                  src={toLocalFileUrl(currentImage)}
                  alt="Generated"
                  className="w-full max-h-[500px] object-contain bg-black/20"
                />
              </div>
              {currentPromptEn && (
                <div className="rounded-lg bg-[#0c121c] border border-white/5 p-4">
                  <p className="text-xs text-gray-500 mb-1">English Prompt</p>
                  <p className="text-sm text-gray-300 leading-relaxed">{currentPromptEn}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <div className="text-5xl mb-4 opacity-30">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="inline-block text-gray-600">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </div>
                <p className="text-sm text-gray-600">输入提示词并点击生成</p>
              </div>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm text-gray-400 uppercase tracking-wide">
                  历史记录 ({history.length})
                </h3>
                <button
                  onClick={handleClearHistory}
                  className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                >
                  清空历史
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleHistoryClick(item)}
                    className="group relative aspect-square rounded-lg bg-[#0c121c] border border-white/5 overflow-hidden hover:border-[#34d399]/40 transition-all"
                  >
                    <img
                      src={toLocalFileUrl(item.imagePath)}
                      alt={item.prompt}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-end">
                      <div className="w-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-xs text-white truncate">{item.prompt}</p>
                        <p className="text-[10px] text-gray-400">{item.style}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Custom Style Modal */}
      {showCreateStyle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowCreateStyle(false)}
        >
          <div
            className="w-[480px] rounded-xl bg-[#0c121c] border border-white/10 shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-100 mb-1">创建自定义画风</h3>
            <p className="text-xs text-gray-500 mb-4">
              描述你想要的画风，AI 将自动生成对应的英文风格提示词
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">画风名称</label>
                <input
                  type="text"
                  value={newStyleName}
                  onChange={(e) => setNewStyleName(e.target.value)}
                  placeholder="例如：新海诚动漫"
                  className="w-full rounded-lg bg-[#070b11] border border-white/10 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">画风描述</label>
                <textarea
                  value={newStyleDesc}
                  onChange={(e) => setNewStyleDesc(e.target.value)}
                  placeholder="例如：日本动漫风格，类似新海诚的作品，光影唯美，色彩鲜艳"
                  rows={3}
                  className="w-full rounded-lg bg-[#070b11] border border-white/10 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-purple-400 transition-colors"
                />
              </div>
            </div>
            {createStyleError && (
              <div className="mt-3 rounded-lg bg-red-400/10 border border-red-400/20 px-3 py-2 text-xs text-red-400">
                {createStyleError}
              </div>
            )}
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setShowCreateStyle(false); setCreateStyleError(''); }}
                className="flex-1 py-2 rounded-lg text-sm text-gray-400 bg-white/5 hover:bg-white/10 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateStyle}
                disabled={!newStyleName.trim() || !newStyleDesc.trim() || creatingStyle}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-400 hover:to-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {creatingStyle ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>AI 生成中...</span>
                  </>
                ) : (
                  '创建画风'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={handleClosePreview}
        >
          <div
            className="max-w-4xl max-h-[90vh] bg-[#0c121c] rounded-xl border border-white/10 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/5">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded text-xs bg-[#34d399]/10 text-[#34d399]">
                  {previewItem.style}
                </span>
                <span className="text-xs text-gray-500">{previewItem.size}</span>
                <span className="text-xs text-gray-600">
                  {new Date(previewItem.createdAt).toLocaleString()}
                </span>
              </div>
              <button
                onClick={handleClosePreview}
                className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors"
              >
                x
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <img
                src={toLocalFileUrl(previewItem.imagePath)}
                alt={previewItem.prompt}
                className="w-full max-h-[500px] object-contain rounded-lg"
              />
              <div className="space-y-2">
                <div className="rounded-lg bg-white/5 p-3">
                  <p className="text-xs text-gray-500 mb-1">中文描述</p>
                  <p className="text-sm text-gray-300">{previewItem.prompt}</p>
                </div>
                <div className="rounded-lg bg-white/5 p-3">
                  <p className="text-xs text-gray-500 mb-1">English Prompt</p>
                  <p className="text-sm text-gray-300">{previewItem.englishPrompt}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ImageLab;
