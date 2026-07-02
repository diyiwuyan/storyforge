import { useEffect, useState } from 'react';

const LLM_PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'qwen', label: '通义千问' },
  { value: 'claude', label: 'Claude (Anthropic)' },
  { value: 'zhipu', label: '智谱 AI (GLM)' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'agnes', label: 'Agnes AI（免费额度）' },
];

const IMAGE_PROVIDERS = [
  { value: 'siliconflow', label: '硅基流动' },
  { value: 'replicate', label: 'Replicate' },
  { value: 'jimeng', label: '即梦 (火山引擎)' },
  { value: 'modelscope', label: '魔搭社区（每天50张免费）' },
  { value: 'agnes', label: 'Agnes AI（免费额度）' },
];

/** Default model hints per imagen provider — shown as placeholder, also used when model field is empty */
const IMAGEN_DEFAULT_MODELS: Record<string, string> = {
  siliconflow: 'FLUX.1-schnell',
  replicate: 'black-forest-labs/flux-schnell',
  jimeng: 'jimeng-2.1',
  modelscope: 'flux-merged',
  agnes: 'agnes-image-2.1-flash',
};

/** Default model hints per LLM provider */
const LLM_DEFAULT_MODELS: Record<string, string> = {
  deepseek: 'deepseek-chat',
  openai: 'gpt-4o-mini',
  qwen: 'qwen-plus',
  claude: 'claude-sonnet-4-20250514',
  zhipu: 'glm-4-flash',
  minimax: 'MiniMax-Text-01',
  agnes: 'agnes-2.0-flash',
};

const TTS_PROVIDERS = [
  { value: 'edge', label: 'Edge TTS（免费）' },
  { value: 'volcano', label: '火山引擎' },
  { value: 'minimax', label: 'MiniMax' },
];

function Settings() {
  const [llmProvider, setLlmProvider] = useState('deepseek');
  const [llmKey, setLlmKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [imageProvider, setImageProvider] = useState('siliconflow');
  const [imageKey, setImageKey] = useState('');
  const [imagenModel, setImagenModel] = useState('');
  const [ttsProvider, setTtsProvider] = useState('edge');
  const [ttsVoice, setTtsVoice] = useState('zh-CN-YunxiNeural');
  const [ttsAppId, setTtsAppId] = useState('');
  const [ttsToken, setTtsToken] = useState('');
  const [ttsApiKey, setTtsApiKey] = useState('');
  const [draftsDir, setDraftsDir] = useState('');
  const [asrEnabled, setAsrEnabled] = useState(false);
  const [asrApiKey, setAsrApiKey] = useState('');
  const [llmBackupEnabled, setLlmBackupEnabled] = useState(false);
  const [llmBackupProvider, setLlmBackupProvider] = useState('agnes');
  const [llmBackupKey, setLlmBackupKey] = useState('');
  const [llmBackupModel, setLlmBackupModel] = useState('');
  const [fallbackEnabled, setFallbackEnabled] = useState(false);
  const [fallbackProviders, setFallbackProviders] = useState<Array<{provider: string; apiKey: string}>>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Template management state
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  // BGM 管理 state
  const [bgmList, setBgmList] = useState<BGMItem[]>([]);
  const [bgmLoaded, setBgmLoaded] = useState(false);
  const [newBgmName, setNewBgmName] = useState('');
  const [newBgmCategory, setNewBgmCategory] = useState('未分类');
  const [addingBgm, setAddingBgm] = useState(false);

  // 声音克隆管理 state
  const [clonedVoices, setClonedVoices] = useState<ClonedVoiceItem[]>([]);
  const [cloneLoaded, setCloneLoaded] = useState(false);

  // 加载已保存的设置
  useEffect(() => {
    loadSettings();
    loadTemplates();
    loadBGMList();
    loadClonedVoices();
  }, []);

  const loadSettings = async () => {
    try {
      const s = await window.storyforge?.settings?.get?.();
      if (s) {
        setLlmProvider(s.llm?.provider || 'deepseek');
        setLlmKey(s.llm?.apiKey || '');
        setLlmModel(s.llm?.model || '');
        setImageProvider(s.imagen?.provider || 'siliconflow');
        setImageKey(s.imagen?.apiKey || '');
        setImagenModel(s.imagen?.model || '');
        setTtsProvider(s.tts?.provider || 'edge');
        setTtsVoice(s.tts?.voice || 'zh-CN-YunxiNeural');
        setTtsAppId(s.tts?.appId || '');
        setTtsToken(s.tts?.token || '');
        setTtsApiKey(s.tts?.apiKey || '');
        setDraftsDir(s.capcutDraftsDir || '');
        setAsrEnabled(!!s.asr?.apiKey);
        setAsrApiKey(s.asr?.apiKey || '');
        setLlmBackupEnabled(!!s.llm?.backup?.apiKey);
        setLlmBackupProvider(s.llm?.backup?.provider || 'agnes');
        setLlmBackupKey(s.llm?.backup?.apiKey || '');
        setLlmBackupModel(s.llm?.backup?.model || '');
        setFallbackEnabled(!!s.imagen?.fallbackProviders?.length);
        setFallbackProviders(s.imagen?.fallbackProviders || []);
      }
      setLoaded(true);
    } catch (err) {
      console.error('加载设置失败:', err);
      setLoaded(true);
    }
  };

  const loadTemplates = async () => {
    try {
      const list = await window.storyforge?.template?.list?.();
      if (list) setTemplates(list);
      setTemplatesLoaded(true);
    } catch (err) {
      console.error('加载模板列表失败:', err);
      setTemplatesLoaded(true);
    }
  };

  const loadBGMList = async () => {
    try {
      const list = await window.storyforge?.bgm?.list?.();
      if (list) setBgmList(list);
      setBgmLoaded(true);
    } catch (err) {
      console.error('加载 BGM 列表失败:', err);
      setBgmLoaded(true);
    }
  };

  const loadClonedVoices = async () => {
    try {
      const list = await window.storyforge?.voiceClone?.list?.();
      if (list) setClonedVoices(list);
      setCloneLoaded(true);
    } catch (err) {
      console.error('加载克隆音色失败:', err);
      setCloneLoaded(true);
    }
  };

  const handleAddBGM = async () => {
    setAddingBgm(true);
    try {
      const item = await window.storyforge?.bgm?.add?.(newBgmName, newBgmCategory);
      if (item) {
        await loadBGMList();
        setNewBgmName('');
        setNewBgmCategory('未分类');
      }
    } catch (err) {
      console.error('添加 BGM 失败:', err);
    } finally {
      setAddingBgm(false);
    }
  };

  const handleRemoveBGM = async (id: string) => {
    try {
      await window.storyforge?.bgm?.remove?.(id);
      await loadBGMList();
    } catch (err) {
      console.error('删除 BGM 失败:', err);
    }
  };

  const handleDeleteClonedVoice = async (id: string) => {
    try {
      await window.storyforge?.voiceClone?.delete?.(id);
      await loadClonedVoices();
    } catch (err) {
      console.error('删除克隆音色失败:', err);
    }
  };

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await window.storyforge.settings.set({
        llm: {
          provider: llmProvider,
          apiKey: llmKey,
          model: llmModel || undefined,
          ...(llmBackupEnabled && llmBackupKey ? {
            backup: { provider: llmBackupProvider, apiKey: llmBackupKey, model: llmBackupModel || undefined },
          } : {}),
        },
        imagen: {
          provider: imageProvider,
          apiKey: imageKey,
          model: imagenModel || undefined,
          ...(fallbackEnabled && fallbackProviders.length > 0 ? { fallbackProviders } : {}),
        },
        tts: {
          provider: ttsProvider,
          voice: ttsVoice,
          appId: ttsAppId || undefined,
          token: ttsToken || undefined,
          apiKey: ttsApiKey || undefined,
        },
        ...(asrEnabled && asrApiKey ? { asr: { provider: 'whisper', apiKey: asrApiKey } } : {}),
        capcutDraftsDir: draftsDir || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('保存设置失败:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectFolder = async () => {
    const folder = await window.storyforge?.system?.selectFolder();
    if (folder) setDraftsDir(folder);
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await window.storyforge?.template?.delete?.(id);
      await loadTemplates();
    } catch (err) {
      console.error('删除模板失败:', err);
    }
  };

  if (!loaded) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10 flex items-center justify-center">
        <div className="inline-block w-5 h-5 border-2 border-gray-600 border-t-[#34d399] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h2 className="text-2xl font-bold text-gray-100">设置</h2>
      <p className="mt-2 text-sm text-gray-500">
        配置 API 密钥和服务提供商
      </p>

      {/* LLM 配置 */}
      <section className="mt-8">
        <h3 className="text-sm font-medium text-gray-400 mb-4">LLM 大模型</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">服务提供商</label>
            <select
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value)}
              className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#34d399] transition-colors appearance-none cursor-pointer"
            >
              {LLM_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">API Key</label>
            <input
              type="password"
              value={llmKey}
              onChange={(e) => setLlmKey(e.target.value)}
              placeholder="sk-..."
              className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">模型名称（可选）</label>
            <input
              type="text"
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              placeholder={`留空则使用默认: ${LLM_DEFAULT_MODELS[llmProvider] || '默认模型'}`}
              className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
            />
          </div>
        </div>
      </section>

      {/* LLM 备用 API */}
      <section className="mt-6">
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={llmBackupEnabled}
              onChange={(e) => setLlmBackupEnabled(e.target.checked)}
              className="accent-[#34d399]"
            />
            <span className="text-sm text-gray-300">启用备用 LLM API</span>
          </label>
          <p className="text-xs text-gray-600">
            当主 API 调用失败时（网络超时、余额不足、服务异常），自动切换到备用 API 继续执行
          </p>
          {llmBackupEnabled && (
            <div className="space-y-3 mt-2 pl-1 border-l-2 border-[#34d399]/30 ml-1">
              <div className="pl-3">
                <label className="block text-xs text-gray-500 mb-1">备用服务提供商</label>
                <select
                  value={llmBackupProvider}
                  onChange={(e) => setLlmBackupProvider(e.target.value)}
                  className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#34d399] transition-colors appearance-none cursor-pointer"
                >
                  {LLM_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pl-3">
                <label className="block text-xs text-gray-500 mb-1">备用 API Key</label>
                <input
                  type="password"
                  value={llmBackupKey}
                  onChange={(e) => setLlmBackupKey(e.target.value)}
                  placeholder="备用服务的 API Key"
                  className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
                />
              </div>
              <div className="pl-3">
                <label className="block text-xs text-gray-500 mb-1">备用模型名称（可选）</label>
                <input
                  type="text"
                  value={llmBackupModel}
                  onChange={(e) => setLlmBackupModel(e.target.value)}
                  placeholder={`留空则使用默认: ${LLM_DEFAULT_MODELS[llmBackupProvider] || '默认模型'}`}
                  className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 生图配置 */}
      <section className="mt-8">
        <h3 className="text-sm font-medium text-gray-400 mb-4">生图服务</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">服务提供商</label>
            <select
              value={imageProvider}
              onChange={(e) => setImageProvider(e.target.value)}
              className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#34d399] transition-colors appearance-none cursor-pointer"
            >
              {IMAGE_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">API Key</label>
            <input
              type="password"
              value={imageKey}
              onChange={(e) => setImageKey(e.target.value)}
              placeholder="输入生图服务 API Key"
              className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">模型名称（可选）</label>
            <input
              type="text"
              value={imagenModel}
              onChange={(e) => setImagenModel(e.target.value)}
              placeholder={`留空则使用默认: ${IMAGEN_DEFAULT_MODELS[imageProvider] || '默认模型'}`}
              className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
            />
          </div>
        </div>
      </section>

      {/* 智能降级配置 */}
      <section className="mt-8">
        <h3 className="text-sm font-medium text-gray-400 mb-4">智能降级（SmartFallback）</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={fallbackEnabled}
              onChange={(e) => setFallbackEnabled(e.target.checked)}
              className="accent-[#34d399]"
            />
            <span className="text-sm text-gray-300">启用 5 级智能降级</span>
          </label>
          <p className="text-xs text-gray-600">
            当主引擎生图失败时，自动尝试：① 重试 → ② 净化敏感词 → ③ LLM 改写 → ④ 切换引擎 → ⑤ SVG 占位
          </p>
          {fallbackEnabled && (
            <div className="space-y-2 mt-3">
              <p className="text-xs text-gray-500">备用生图引擎（切换顺序）</p>
              {fallbackProviders.map((fp, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select
                    value={fp.provider}
                    onChange={(e) => {
                      const updated = [...fallbackProviders];
                      updated[idx] = { ...updated[idx], provider: e.target.value };
                      setFallbackProviders(updated);
                    }}
                    className="flex-1 rounded-lg bg-[#0c121c] border border-white/10 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#34d399] transition-colors appearance-none cursor-pointer"
                  >
                    {IMAGE_PROVIDERS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <input
                    type="password"
                    value={fp.apiKey}
                    onChange={(e) => {
                      const updated = [...fallbackProviders];
                      updated[idx] = { ...updated[idx], apiKey: e.target.value };
                      setFallbackProviders(updated);
                    }}
                    placeholder="API Key"
                    className="flex-1 rounded-lg bg-[#0c121c] border border-white/10 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
                  />
                  <button
                    onClick={() => setFallbackProviders(fallbackProviders.filter((_, i) => i !== idx))}
                    className="shrink-0 px-2.5 py-2 rounded-lg text-xs text-red-400/70 hover:text-red-400 bg-white/5 border border-white/10 hover:bg-red-500/10 transition-colors"
                  >
                    删除
                  </button>
                </div>
              ))}
              <button
                onClick={() => setFallbackProviders([...fallbackProviders, { provider: 'replicate', apiKey: '' }])}
                className="w-full py-2 rounded-lg text-xs text-[#34d399] bg-[#34d399]/10 border border-[#34d399]/30 hover:bg-[#34d399]/20 transition-colors"
              >
                + 添加备用引擎
              </button>
            </div>
          )}
        </div>
      </section>

      {/* TTS 配置 */}
      <section className="mt-8">
        <h3 className="text-sm font-medium text-gray-400 mb-4">TTS 语音合成</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">服务提供商</label>
            <select
              value={ttsProvider}
              onChange={(e) => setTtsProvider(e.target.value)}
              className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#34d399] transition-colors appearance-none cursor-pointer"
            >
              {TTS_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">默认音色</label>
            <input
              type="text"
              value={ttsVoice}
              onChange={(e) => setTtsVoice(e.target.value)}
              placeholder="zh-CN-YunxiNeural"
              className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
            />
          </div>
          {ttsProvider === 'volcano' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">App ID</label>
                <input
                  type="text"
                  value={ttsAppId}
                  onChange={(e) => setTtsAppId(e.target.value)}
                  placeholder="火山引擎 App ID"
                  className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Access Token</label>
                <input
                  type="password"
                  value={ttsToken}
                  onChange={(e) => setTtsToken(e.target.value)}
                  placeholder="火山引擎 Access Token"
                  className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
                />
              </div>
            </>
          )}
          {ttsProvider === 'minimax' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">API Key</label>
              <input
                type="password"
                value={ttsApiKey}
                onChange={(e) => setTtsApiKey(e.target.value)}
                placeholder="MiniMax API Key"
                className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
              />
            </div>
          )}
        </div>
      </section>

      {/* ASR 配置 */}
      <section className="mt-8">
        <h3 className="text-sm font-medium text-gray-400 mb-4">语音识别（ASR）</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={asrEnabled}
              onChange={(e) => setAsrEnabled(e.target.checked)}
              className="accent-[#34d399]"
            />
            <span className="text-sm text-gray-300">启用 Whisper 字幕时间轴对齐</span>
          </label>
          {asrEnabled && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">API Key</label>
              <input
                type="password"
                value={asrApiKey}
                onChange={(e) => setAsrApiKey(e.target.value)}
                placeholder="OpenAI API Key (用于 Whisper)"
                className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
              />
            </div>
          )}
        </div>
      </section>

      {/* 剪映草稿目录 */}
      <section className="mt-8">
        <h3 className="text-sm font-medium text-gray-400 mb-4">剪映草稿目录</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={draftsDir}
            readOnly
            placeholder="选择剪映草稿所在目录"
            className="flex-1 rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors cursor-default"
          />
          <button
            onClick={handleSelectFolder}
            className="shrink-0 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300 hover:bg-white/10 transition-colors"
          >
            选择文件夹
          </button>
        </div>
        {draftsDir && (
          <p className="mt-1 text-xs text-gray-600 truncate">{draftsDir}</p>
        )}
      </section>

      {/* 保存按钮 */}
      <div className="mt-10 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#34d399] to-[#059669] hover:from-[#2cc88e] hover:to-[#047857] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {saving ? '保存中...' : '保存设置'}
        </button>
        {saved && (
          <span className="text-sm text-[#34d399] animate-fade-in">
            已保存
          </span>
        )}
      </div>

      {/* 应用更新 */}
      <section className="mt-12 pt-8 border-t border-white/5">
        <h3 className="text-sm font-medium text-gray-400 mb-4">应用更新</h3>
        <UpdateSection />
      </section>

      {/* 模板管理 */}
      <section className="mt-12 pt-8 border-t border-white/5">
        <h3 className="text-sm font-medium text-gray-400 mb-4">模板管理</h3>
        <p className="text-xs text-gray-600 mb-4">
          管理已保存的项目模板，在创建任务时可一键套用
        </p>

        {!templatesLoaded ? (
          <div className="flex items-center justify-center py-6">
            <div className="inline-block w-4 h-4 border-2 border-gray-600 border-t-[#34d399] rounded-full animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-600 rounded-lg bg-white/5 border border-white/5">
            暂无已保存的模板
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/5 border border-white/5"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-200 truncate">{tpl.name}</div>
                  {tpl.description && (
                    <div className="text-xs text-gray-600 mt-0.5 truncate">{tpl.description}</div>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-600">
                    {tpl.config.track && <span>{tpl.config.track}</span>}
                    {tpl.config.style && <span>· {tpl.config.style}</span>}
                    {tpl.config.voice && <span>· {tpl.config.voice}</span>}
                    <span>· {tpl.config.aspectRatio}</span>
                    <span>· {tpl.config.mode === 'auto' ? '全自动' : '半自动'}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteTemplate(tpl.id)}
                  className="shrink-0 ml-3 px-3 py-1.5 rounded-lg text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* BGM 库管理 */}
      <section className="mt-12 pt-8 border-t border-white/5">
        <h3 className="text-sm font-medium text-gray-400 mb-4">BGM 库管理</h3>
        <p className="text-xs text-gray-600 mb-4">
          管理背景音乐库，在创建任务时可选择 BGM
        </p>

        {/* 添加 BGM */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newBgmName}
            onChange={(e) => setNewBgmName(e.target.value)}
            placeholder="BGM 名称（可选）"
            className="flex-1 rounded-lg bg-[#0c121c] border border-white/10 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
          />
          <select
            value={newBgmCategory}
            onChange={(e) => setNewBgmCategory(e.target.value)}
            className="shrink-0 rounded-lg bg-[#0c121c] border border-white/10 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#34d399] transition-colors"
          >
            {['轻松', '悲伤', '激昂', '古风', '电子', '抒情', '欢快', '未分类'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            onClick={handleAddBGM}
            disabled={addingBgm}
            className="shrink-0 px-4 py-2 rounded-lg text-sm text-[#34d399] bg-[#34d399]/10 border border-[#34d399]/30 hover:bg-[#34d399]/20 disabled:opacity-50 transition-colors"
          >
            {addingBgm ? '选择中...' : '+ 添加'}
          </button>
        </div>

        {/* BGM 列表 */}
        {!bgmLoaded ? (
          <div className="flex items-center justify-center py-6">
            <div className="inline-block w-4 h-4 border-2 border-gray-600 border-t-[#34d399] rounded-full animate-spin" />
          </div>
        ) : bgmList.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-600 rounded-lg bg-white/5 border border-white/5">
            BGM 库为空，点击上方按钮添加音乐文件
          </div>
        ) : (
          <div className="space-y-2">
            {bgmList.map((bgm) => (
              <div
                key={bgm.id}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/5 border border-white/5"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-200 truncate">{bgm.name}</span>
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-white/10 text-gray-400">
                      {bgm.category}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    时长：{formatDuration(bgm.duration)}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveBGM(bgm.id)}
                  className="shrink-0 ml-3 px-3 py-1.5 rounded-lg text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 声音克隆管理 */}
      <section className="mt-12 pt-8 border-t border-white/5">
        <h3 className="text-sm font-medium text-gray-400 mb-4">声音克隆管理</h3>
        <p className="text-xs text-gray-600 mb-4">
          管理已克隆的音色，可在创建任务时选择使用
        </p>

        {!cloneLoaded ? (
          <div className="flex items-center justify-center py-6">
            <div className="inline-block w-4 h-4 border-2 border-gray-600 border-t-[#34d399] rounded-full animate-spin" />
          </div>
        ) : clonedVoices.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-600 rounded-lg bg-white/5 border border-white/5">
            暂无克隆音色，可在创建任务页面克隆声音
          </div>
        ) : (
          <div className="space-y-2">
            {clonedVoices.map((cv) => (
              <div
                key={cv.id}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/5 border border-white/5"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-200 truncate">{cv.name}</span>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${
                      cv.status === 'ready'
                        ? 'bg-green-500/10 text-green-400'
                        : cv.status === 'failed'
                        ? 'bg-red-400/10 text-red-400'
                        : 'bg-yellow-400/10 text-yellow-400'
                    }`}>
                      {cv.status === 'ready' ? '可用' : cv.status === 'failed' ? '失败' : '处理中'}
                    </span>
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-400">
                      {cv.provider}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    ID: {cv.voiceId}
                    {cv.error && <span className="ml-2 text-red-400/70">· {cv.error}</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteClonedVoice(cv.id)}
                  className="shrink-0 ml-3 px-3 py-1.5 rounded-lg text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** 应用更新管理组件 */
function UpdateSection() {
  const [info, setInfo] = useState<UpdaterInfo | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    window.storyforge?.updater?.getInfo?.().then(setInfo).catch(() => {});
    const unsub = window.storyforge?.updater?.onStatus?.((data: any) => {
      setInfo(data);
      setChecking(false);
    });
    return () => { unsub?.(); };
  }, []);

  const handleCheck = async () => {
    setChecking(true);
    try {
      await window.storyforge?.updater?.check?.();
    } catch {
      setChecking(false);
    }
  };

  const STATUS_LABELS: Record<string, string> = {
    idle: '未检查',
    checking: '检查中...',
    available: '有新版本可用',
    'not-available': '已是最新版本',
    downloading: '下载中...',
    downloaded: '下载完成，等待安装',
    error: '检查更新失败',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-sm text-gray-200">
            当前版本：v{info?.currentVersion ?? '0.1.0'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {info ? STATUS_LABELS[info.status] ?? info.status : '加载中...'}
            {info?.status === 'available' && info.version && (
              <span className="ml-1 text-[#34d399]">v{info.version}</span>
            )}
            {info?.status === 'downloading' && info.progress != null && (
              <span className="ml-1 text-blue-400">{info.progress}%</span>
            )}
          </div>
          {info?.status === 'error' && info.error && (
            <div className="text-xs text-red-400/70 mt-0.5">{info.error}</div>
          )}
        </div>

        {(!info || info.status === 'idle' || info.status === 'not-available' || info.status === 'error') && (
          <button
            onClick={handleCheck}
            disabled={checking}
            className="shrink-0 px-4 py-2 rounded-lg text-sm text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50 transition-colors"
          >
            {checking ? '检查中...' : '检查更新'}
          </button>
        )}

        {info?.status === 'available' && (
          <button
            onClick={() => window.storyforge?.updater?.download?.()}
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#34d399] to-[#059669] hover:from-[#2cc88e] hover:to-[#047857] transition-all"
          >
            下载更新
          </button>
        )}

        {info?.status === 'downloaded' && (
          <button
            onClick={() => window.storyforge?.updater?.install?.()}
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 transition-all"
          >
            重启并安装
          </button>
        )}
      </div>

      {info?.status === 'downloading' && (
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300"
            style={{ width: `${info.progress ?? 0}%` }}
          />
        </div>
      )}

      {info?.status === 'downloaded' && info.releaseNotes && (
        <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/5 text-xs text-gray-400 whitespace-pre-wrap max-h-32 overflow-y-auto">
          {info.releaseNotes}
        </div>
      )}
    </div>
  );
}

export default Settings;
