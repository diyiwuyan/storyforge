import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/app-store';

const TRACKS = [
  '人物故事',
  '健康图书',
  '民间故事',
  '文化科普',
  '绘本故事',
  '电商带货',
  '心灵鸡汤',
  '历史人文',
  '情感心理',
  '科普知识',
];

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

interface VoiceOption {
  label: string;
  value: string;
  provider?: string;
}

interface VoiceGroup {
  group: string;
  voices: VoiceOption[];
}

const VOICE_GROUPS: VoiceGroup[] = [
  {
    group: 'Edge TTS（免费）',
    voices: [
      { label: '云希（活力男声）', value: 'zh-CN-YunxiNeural', provider: 'edge' },
      { label: '晓晓（温柔女声）', value: 'zh-CN-XiaoxiaoNeural', provider: 'edge' },
      { label: '云健（沉稳男声）', value: 'zh-CN-YunjianNeural', provider: 'edge' },
      { label: '晓伊（知性女声）', value: 'zh-CN-XiaoyiNeural', provider: 'edge' },
      { label: '云皓（少年男声）', value: 'zh-CN-YunhaoNeural', provider: 'edge' },
      { label: '云枫（磁性男声）', value: 'zh-CN-YunfengNeural', provider: 'edge' },
      { label: '晓梦（甜美女声）', value: 'zh-CN-XiaomengNeural', provider: 'edge' },
      { label: '晓秋（成熟女声）', value: 'zh-CN-XiaoqiuNeural', provider: 'edge' },
      { label: '晓辰（亲和女声）', value: 'zh-CN-XiaochenNeural', provider: 'edge' },
      { label: '云泽（浑厚男声）', value: 'zh-CN-YunzeNeural', provider: 'edge' },
      { label: '晓涵（端庄女声）', value: 'zh-CN-XiaohanNeural', provider: 'edge' },
      { label: '晓默（文静女声）', value: 'zh-CN-XiaomoNeural', provider: 'edge' },
      { label: '晓双（温婉女声）', value: 'zh-CN-XiaoshuangNeural', provider: 'edge' },
      { label: '晓瑞（优雅女声）', value: 'zh-CN-XiaoruiNeural', provider: 'edge' },
      { label: '云扬（播音男声）', value: 'zh-CN-YunyangNeural', provider: 'edge' },
      // 方言
      { label: '云翔（粤语男声）', value: 'zh-HK-WanLungNeural', provider: 'edge' },
      { label: '晓佳（粤语女声）', value: 'zh-HK-HiuGaaiNeural', provider: 'edge' },
      { label: '晓曼（粤语温柔女声）', value: 'zh-HK-HiuMaanNeural', provider: 'edge' },
      { label: '云哲（台湾男声）', value: 'zh-TW-YunJheNeural', provider: 'edge' },
      { label: '晓臻（台湾女声）', value: 'zh-TW-HsiaoChenNeural', provider: 'edge' },
      // 英文
      { label: 'Jenny（英文女声）', value: 'en-US-JennyNeural', provider: 'edge' },
      { label: 'Guy（英文男声）', value: 'en-US-GuyNeural', provider: 'edge' },
      { label: 'Aria（英文女声）', value: 'en-US-AriaNeural', provider: 'edge' },
    ],
  },
  {
    group: '火山引擎',
    voices: [
      { label: '通用女声', value: 'BV001', provider: 'volcano' },
      { label: '通用男声', value: 'BV002', provider: 'volcano' },
      { label: '灿灿（活力女声）', value: 'BV700', provider: 'volcano' },
      { label: '东方浩然（沉稳叙述）', value: 'BV406', provider: 'volcano' },
      { label: '温柔小雅', value: 'BV407', provider: 'volcano' },
      { label: '阳光男声', value: 'BV123', provider: 'volcano' },
      { label: '知性女声', value: 'BV005', provider: 'volcano' },
      { label: '磁性男声', value: 'BV006', provider: 'volcano' },
      { label: '童声', value: 'BV007', provider: 'volcano' },
      { label: '客服女声', value: 'BV009', provider: 'volcano' },
      { label: '播音男声', value: 'BV113', provider: 'volcano' },
      { label: '新闻女声', value: 'BV034', provider: 'volcano' },
      { label: '故事女声', value: 'BV056', provider: 'volcano' },
      { label: '甜美女声', value: 'BV063', provider: 'volcano' },
      { label: '温润男声', value: 'BV064', provider: 'volcano' },
      // 方言
      { label: '粤语男声', value: 'BV213', provider: 'volcano' },
      { label: '粤语女声', value: 'BV214', provider: 'volcano' },
      { label: '四川话女声', value: 'BV215', provider: 'volcano' },
      { label: '东北话男声', value: 'BV216', provider: 'volcano' },
      { label: '台湾腔女声', value: 'BV217', provider: 'volcano' },
    ],
  },
  {
    group: 'MiniMax',
    voices: [
      { label: '青涩男声', value: 'male-qn-qingse', provider: 'minimax' },
      { label: '精英男声', value: 'male-qn-jingying', provider: 'minimax' },
      { label: '霸道男声', value: 'male-qn-badao', provider: 'minimax' },
      { label: '少女声', value: 'female-shaonv', provider: 'minimax' },
      { label: '御姐声', value: 'female-yujie', provider: 'minimax' },
      { label: '成熟女声', value: 'female-chengshu', provider: 'minimax' },
      { label: '正太男声', value: 'preschool_male', provider: 'minimax' },
      { label: '元气女声', value: 'female-yuanqi', provider: 'minimax' },
      { label: '温柔女声', value: 'female-wenrou', provider: 'minimax' },
      { label: '磁性男声', value: 'male-cixing', provider: 'minimax' },
      { label: '英文女声', value: 'english_radiant', provider: 'minimax' },
    ],
  },
];

const SPEED_LABELS: Record<number, string> = {
  0.8: '慢速 0.8x',
  0.9: '稍慢 0.9x',
  1.0: '正常 1.0x',
  1.1: '稍快 1.1x',
  1.2: '快速 1.2x',
  1.3: '较快 1.3x',
  1.5: '极速 1.5x',
};

const BGM_CATEGORIES = ['轻松', '悲伤', '激昂', '古风', '电子', '抒情', '欢快', '未分类'];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function CreateTask() {
  const { setPage, setCurrentProjectId, setCurrentProject, setLoading, loading } = useAppStore();

  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [track, setTrack] = useState('');
  const [style, setStyle] = useState('');
  const [voice, setVoice] = useState(VOICE_GROUPS[0].voices[0].value);
  const [speed, setSpeed] = useState(1.0);
  const [mode, setMode] = useState<'auto' | 'semi'>('semi');
  const [ratio, setRatio] = useState<'9:16' | '16:9'>('9:16');

  // BGM state
  const [bgmList, setBgmList] = useState<BGMItem[]>([]);
  const [selectedBgmId, setSelectedBgmId] = useState<string>('');
  const [showBgmManager, setShowBgmManager] = useState(false);

  // BGM manager modal state
  const [newBgmName, setNewBgmName] = useState('');
  const [newBgmCategory, setNewBgmCategory] = useState(BGM_CATEGORIES[0]);
  const [addingBgm, setAddingBgm] = useState(false);

  // Template state
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');

  // Custom styles state
  const [customStyles, setCustomStyles] = useState<CustomStyleItem[]>([]);
  const [showCreateStyle, setShowCreateStyle] = useState(false);
  const [newStyleName, setNewStyleName] = useState('');
  const [newStyleDesc, setNewStyleDesc] = useState('');
  const [creatingStyle, setCreatingStyle] = useState(false);
  const [createStyleError, setCreateStyleError] = useState('');

  // Style edit state
  const [editingStyleId, setEditingStyleId] = useState<string>('');
  const [editStyleName, setEditStyleName] = useState('');
  const [editStyleDesc, setEditStyleDesc] = useState('');
  const [updatingStyle, setUpdatingStyle] = useState(false);

  // Voice clone state
  const [clonedVoices, setClonedVoices] = useState<ClonedVoiceItem[]>([]);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);

  // Reference image state
  const [referenceImagePath, setReferenceImagePath] = useState<string>('');

  // Load BGM list, templates, custom styles, and cloned voices on mount
  useEffect(() => {
    loadBGMList();
    loadTemplates();
    loadCustomStyles();
    loadClonedVoices();
  }, []);

  const loadBGMList = async () => {
    try {
      const list = await window.storyforge?.bgm?.list?.();
      if (list) setBgmList(list);
    } catch (err) {
      console.error('加载 BGM 列表失败:', err);
    }
  };

  const loadTemplates = async () => {
    try {
      const list = await window.storyforge?.template?.list?.();
      if (list) setTemplates(list);
    } catch (err) {
      console.error('加载模板列表失败:', err);
    }
  };

  const loadCustomStyles = async () => {
    try {
      const list = await window.storyforge?.style?.list?.();
      if (list) setCustomStyles(list);
    } catch (err) {
      console.error('加载自定义画风失败:', err);
    }
  };

  const loadClonedVoices = async () => {
    try {
      const list = await window.storyforge?.voiceClone?.list?.();
      if (list) setClonedVoices(list);
    } catch (err) {
      console.error('加载克隆音色失败:', err);
    }
  };

  const handleCloneVoice = async () => {
    if (!cloneName.trim()) return;
    setCloning(true);
    try {
      const result = await window.storyforge.voiceClone.clone({ name: cloneName.trim() });
      if (result) {
        setVoice(`clone:${result.voiceId}`);
        await loadClonedVoices();
      }
      setCloneName('');
      setShowCloneModal(false);
    } catch (err) {
      console.error('克隆声音失败:', err);
    } finally {
      setCloning(false);
    }
  };

  const handleDeleteClonedVoice = async (id: string, voiceId: string) => {
    try {
      await window.storyforge.voiceClone.delete(id);
      if (voice === `clone:${voiceId}`) setVoice(VOICE_GROUPS[0].voices[0].value);
      await loadClonedVoices();
    } catch (err) {
      console.error('删除克隆音色失败:', err);
    }
  };

  const handleUploadReference = async () => {
    const tempId = `temp_${Date.now()}`;
    try {
      const result = await window.storyforge.project.uploadReference(tempId);
      if (result) setReferenceImagePath(result);
    } catch (err) {
      console.error('上传参考图失败:', err);
    }
  };

  const handleCreateStyle = async () => {
    if (!newStyleName.trim() || !newStyleDesc.trim()) return;
    setCreatingStyle(true);
    setCreateStyleError('');
    try {
      const created = await window.storyforge.style.create({
        name: newStyleName.trim(),
        description: newStyleDesc.trim(),
      });
      setNewStyleName('');
      setNewStyleDesc('');
      setShowCreateStyle(false);
      setStyle(`custom:${created.id}`);
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
      if (style === `custom:${id}`) setStyle('');
      await loadCustomStyles();
    } catch (err) {
      console.error('删除自定义画风失败:', err);
    }
  };

  const handleUpdateStyle = async () => {
    if (!editingStyleId || !editStyleName.trim()) return;
    setUpdatingStyle(true);
    try {
      await window.storyforge.style.update({
        id: editingStyleId,
        name: editStyleName.trim(),
        description: editStyleDesc.trim(),
      });
      setEditingStyleId('');
      setEditStyleName('');
      setEditStyleDesc('');
      await loadCustomStyles();
    } catch (err) {
      console.error('更新画风失败:', err);
    } finally {
      setUpdatingStyle(false);
    }
  };

  const handleStartEditStyle = (cs: CustomStyleItem) => {
    setEditingStyleId(cs.id);
    setEditStyleName(cs.name);
    setEditStyleDesc(cs.description);
  };

  // Apply template
  const handleApplyTemplate = useCallback(async (templateId: string) => {
    if (!templateId) {
      setSelectedTemplateId('');
      return;
    }
    try {
      const tpl = await window.storyforge?.template?.apply?.(templateId);
      if (tpl) {
        setSelectedTemplateId(templateId);
        setTrack(tpl.config.track || '');
        setStyle(tpl.config.style || '');
        setVoice(tpl.config.voice || VOICE_GROUPS[0].voices[0].value);
        setSpeed(tpl.config.speed || 1.0);
        setMode(tpl.config.mode || 'semi');
        setRatio((tpl.config.aspectRatio as '9:16' | '16:9') || '9:16');
        setSelectedBgmId(tpl.config.bgmId || '');
      }
    } catch (err) {
      console.error('应用模板失败:', err);
    }
  }, []);

  // Add BGM
  const handleAddBGM = async () => {
    setAddingBgm(true);
    try {
      const item = await window.storyforge?.bgm?.add?.(newBgmName, newBgmCategory);
      if (item) {
        await loadBGMList();
        setSelectedBgmId(item.id);
        setNewBgmName('');
        setNewBgmCategory(BGM_CATEGORIES[0]);
      }
    } catch (err) {
      console.error('添加 BGM 失败:', err);
    } finally {
      setAddingBgm(false);
    }
  };

  // Remove BGM
  const handleRemoveBGM = async (id: string) => {
    try {
      await window.storyforge?.bgm?.remove?.(id);
      if (selectedBgmId === id) setSelectedBgmId('');
      await loadBGMList();
    } catch (err) {
      console.error('删除 BGM 失败:', err);
    }
  };

  // Save as template
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      const settings = await window.storyforge?.settings?.get?.();
      await window.storyforge?.template?.create?.({
        name: templateName.trim(),
        description: templateDesc.trim(),
        config: {
          track,
          style,
          voice,
          speed,
          mode,
          aspectRatio: ratio,
          bgmId: selectedBgmId || undefined,
          llmProvider: settings?.llm?.provider,
          imagenProvider: settings?.imagen?.provider,
          ttsProvider: settings?.tts?.provider,
        },
      });
      setShowSaveTemplate(false);
      setTemplateName('');
      setTemplateDesc('');
      await loadTemplates();
    } catch (err) {
      console.error('保存模板失败:', err);
    }
  };

  const handleBatchSubmit = async () => {
    if (!text.trim()) return;

    // 按空行或 --- 分隔
    const segments = text.split(/\n{2,}|^---$/m).map(s => s.trim()).filter(s => s.length > 0);

    if (segments.length <= 1) {
      // 只有一段，走普通流程
      handleSubmit();
      return;
    }

    setLoading(true);

    try {
      for (let i = 0; i < segments.length; i++) {
        const segText = segments[i];
        const config = {
          name: name.trim() ? `${name.trim()} #${i + 1}` : segText.slice(0, 20) + `... #${i + 1}`,
          originalText: segText,
          track,
          style,
          voice,
          speed,
          mode,
          aspectRatio: ratio,
          bgmId: selectedBgmId || undefined,
          referenceImagePath: referenceImagePath || undefined,
        };

        const project = await window.storyforge.project.create(config);
        if (project) {
          await window.storyforge?.queue?.add?.(project.id);
        }
      }

// 跳转到项目列表
setPage('list');
    } catch (err) {
      console.error('批量创建失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!text.trim()) return;

    const config = {
      name: name.trim() || text.slice(0, 20) + '...',
      originalText: text,
      track,
      style,
      voice,
      speed,
      mode,
      aspectRatio: ratio,
      bgmId: selectedBgmId || undefined,
      referenceImagePath: referenceImagePath || undefined,
      ...(selectedTemplateId ? (() => {
        const tpl = templates.find(t => t.id === selectedTemplateId);
        return tpl?.config?.customPrompts ? { customPrompts: tpl.config.customPrompts } : {};
      })() : {}),
    };

    setLoading(true);

    try {
      const project = await window.storyforge.project.create(config);
      if (project) {
        // Use task queue instead of direct pipeline start
        const queueResult = await window.storyforge?.queue?.add?.(project.id);
        if (queueResult && queueResult.position > 0) {
          // There are other tasks ahead in the queue
          alert(`已加入队列，排在第 ${queueResult.position} 位`);
        }

        setCurrentProjectId(project.id);
        setCurrentProject(project);
        setPage('detail');
        // Prompt to save as template after successful creation
        setShowSaveTemplate(true);
      }
    } catch (err) {
      console.error('创建项目失败:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      {/* 标题 */}
      <h2 className="text-2xl font-bold text-gray-100">创建视频任务</h2>
      <p className="mt-2 text-sm text-gray-500">
        粘贴一段文案，几分钟后在剪映里打开
      </p>

      {/* 模板选择 */}
      {templates.length > 0 && (
        <div className="mt-6">
          <label className="block text-sm text-gray-400 mb-2">从模板创建</label>
          <select
            value={selectedTemplateId}
            onChange={(e) => handleApplyTemplate(e.target.value)}
            className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#34d399] transition-colors appearance-none cursor-pointer"
          >
            <option value="">— 不使用模板 —</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
                {tpl.description ? ` — ${tpl.description}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 项目名称 */}
      <div className="mt-6">
        <label className="block text-sm text-gray-400 mb-2">项目名称（可选）</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="为项目起一个名字，留空将自动生成"
          className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
        />
      </div>

      {/* 文案输入 */}
      <div className="mt-6">
        <label className="block text-sm text-gray-400 mb-2">视频文案</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="在这里粘贴或输入你的视频文案..."
          rows={6}
          className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-3 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-[#34d399] transition-colors"
        />
        <div className="mt-1 text-xs text-gray-600 text-right">
          {text.length} 字
        </div>
      </div>

      {/* 赛道选择 */}
      <div className="mt-6">
        <label className="block text-sm text-gray-400 mb-2">赛道选择</label>
        <div className="flex flex-wrap gap-2">
          {TRACKS.map((t) => (
            <button
              key={t}
              onClick={() => setTrack(t === track ? '' : t)}
              className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                track === t
                  ? 'bg-[#34d399]/20 text-[#34d399] border border-[#34d399]/40'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 画风选择 */}
      <div className="mt-6">
        <label className="block text-sm text-gray-400 mb-2">画风选择</label>
        <div className="flex flex-wrap gap-2">
          {STYLES.map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s === style ? '' : s)}
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
                onClick={() => setStyle(style === `custom:${cs.id}` ? '' : `custom:${cs.id}`)}
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
                onClick={(e) => { e.stopPropagation(); handleStartEditStyle(cs); }}
                className="absolute -top-1.5 -right-6 w-4 h-4 rounded-full bg-blue-500/80 text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover/style:opacity-100 transition-opacity hover:bg-blue-500"
                title="编辑画风"
              >
                ✎
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
          <button
            onClick={() => setShowCreateStyle(true)}
            className="px-3 py-1.5 rounded-full text-xs text-purple-400 border border-dashed border-purple-500/30 hover:bg-purple-500/10 transition-colors"
          >
            + 自定义画风
          </button>
        </div>
      </div>

      {/* 人像参考图（可选） */}
      <div className="mt-6">
        <label className="block text-sm text-gray-400 mb-2">人像参考图（可选）</label>
        <p className="text-xs text-gray-600 mb-2">上传主角照片，AI 将保持形象一致性</p>
        {!referenceImagePath ? (
          <button
            onClick={handleUploadReference}
            className="w-full py-6 rounded-lg border-2 border-dashed border-white/10 hover:border-[#34d399]/40 text-sm text-gray-500 hover:text-gray-300 transition-colors flex flex-col items-center gap-1"
          >
            <span className="text-lg">+</span>
            <span>上传参考图</span>
          </button>
        ) : (
          <div className="flex items-center gap-3 rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="w-16 h-16 rounded-lg bg-white/10 overflow-hidden shrink-0">
              <img
                src={`file://${referenceImagePath}`}
                alt="参考图"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 truncate">{referenceImagePath.split(/[/\\]/).pop()}</p>
              <p className="text-xs text-green-400 mt-0.5">已上传</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleUploadReference}
                className="px-2 py-1 rounded text-xs text-gray-400 hover:text-gray-200 bg-white/5 hover:bg-white/10 transition-colors"
              >
                更换
              </button>
              <button
                onClick={() => setReferenceImagePath('')}
                className="px-2 py-1 rounded text-xs text-red-400/70 hover:text-red-400 bg-white/5 hover:bg-red-500/10 transition-colors"
              >
                移除
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 音色选择 */}
      <div className="mt-6">
        <label className="block text-sm text-gray-400 mb-2">音色选择</label>
        <select
          value={voice.startsWith('clone:') ? '' : voice}
          onChange={(e) => setVoice(e.target.value)}
          className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#34d399] transition-colors appearance-none cursor-pointer"
        >
          {VOICE_GROUPS.map(group => (
            <optgroup key={group.group} label={group.group}>
              {group.voices.map(v => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* 克隆音色 */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm text-gray-400">克隆音色</label>
          <button
            onClick={() => setShowCloneModal(true)}
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            + 克隆我的声音
          </button>
        </div>
        {clonedVoices.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {clonedVoices.map((cv) => (
              <div key={cv.id} className="relative group/clone">
                <button
                  onClick={() => setVoice(voice === `clone:${cv.voiceId}` ? VOICE_GROUPS[0].voices[0].value : `clone:${cv.voiceId}`)}
                  className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                    voice === `clone:${cv.voiceId}`
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-400/40'
                      : 'bg-white/5 text-purple-300 border border-purple-500/20 hover:bg-purple-500/10'
                  }`}
                  title={cv.status === 'failed' ? `失败: ${cv.error}` : `ID: ${cv.voiceId}`}
                >
                  {cv.name}
                  {cv.status === 'failed' && ' (失败)'}
                  {cv.status === 'pending' && ' (处理中)'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteClonedVoice(cv.id, cv.voiceId); }}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500/80 text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover/clone:opacity-100 transition-opacity hover:bg-red-500"
                  title="删除克隆音色"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
        {clonedVoices.length === 0 && (
          <p className="text-xs text-gray-600">
            上传 8-30 秒音频样本，克隆出你自己的声音
          </p>
        )}
      </div>

      {/* 语速调节 */}
      <div className="mt-6">
        <label className="block text-sm text-gray-400 mb-2">
          语速调节 <span className="text-gray-600 ml-1">{SPEED_LABELS[speed] || `${speed}x`}</span>
        </label>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 shrink-0">0.8x</span>
          <input
            type="range"
            min={0.8}
            max={1.5}
            step={0.1}
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="flex-1 h-1.5 accent-[#34d399] cursor-pointer"
          />
          <span className="text-xs text-gray-600 shrink-0">1.5x</span>
        </div>
        <div className="flex justify-between mt-1 px-1">
          {[0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5].map(v => (
            <button
              key={v}
              onClick={() => setSpeed(v)}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                speed === v
                  ? 'text-[#34d399] bg-[#34d399]/10'
                  : 'text-gray-600 hover:text-gray-400'
              } transition-colors`}
            >
              {v}x
            </button>
          ))}
        </div>
      </div>

      {/* BGM 选择 */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm text-gray-400">BGM 背景音乐</label>
          <button
            onClick={() => setShowBgmManager(true)}
            className="text-xs text-[#34d399] hover:text-[#2cc88e] transition-colors"
          >
            管理 BGM 库
          </button>
        </div>
        <select
          value={selectedBgmId}
          onChange={(e) => setSelectedBgmId(e.target.value)}
          className="w-full rounded-lg bg-[#0c121c] border border-white/10 px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#34d399] transition-colors appearance-none cursor-pointer"
        >
          <option value="">无 BGM</option>
          {bgmList.map((bgm) => (
            <option key={bgm.id} value={bgm.id}>
              {bgm.name}（{bgm.category}）· {formatDuration(bgm.duration)}
            </option>
          ))}
        </select>
        {bgmList.length === 0 && (
          <p className="mt-1 text-xs text-gray-600">
            BGM 库为空，点击「管理 BGM 库」添加音乐文件
          </p>
        )}
      </div>

      {/* 模式选择 */}
      <div className="mt-6">
        <label className="block text-sm text-gray-400 mb-2">生成模式</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="mode"
              checked={mode === 'auto'}
              onChange={() => setMode('auto')}
              className="accent-[#34d399]"
            />
            <span className="text-sm text-gray-300">全自动</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="mode"
              checked={mode === 'semi'}
              onChange={() => setMode('semi')}
              className="accent-[#34d399]"
            />
            <span className="text-sm text-gray-300">半自动（推荐）</span>
          </label>
        </div>
      </div>

      {/* 视频比例 */}
      <div className="mt-6">
        <label className="block text-sm text-gray-400 mb-2">视频比例</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="ratio"
              checked={ratio === '9:16'}
              onChange={() => setRatio('9:16')}
              className="accent-[#34d399]"
            />
            <span className="text-sm text-gray-300">9:16 竖屏</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="ratio"
              checked={ratio === '16:9'}
              onChange={() => setRatio('16:9')}
              className="accent-[#34d399]"
            />
            <span className="text-sm text-gray-300">16:9 横屏</span>
          </label>
        </div>
      </div>

      {/* 提交按钮 */}
      <button
        onClick={handleSubmit}
        disabled={!text.trim() || loading}
        className="mt-10 w-full py-3 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[#34d399] to-[#059669] hover:from-[#2cc88e] hover:to-[#047857] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>创建中...</span>
          </>
        ) : (
          '开始生成'
        )}
      </button>

      {/* 批量创建按钮 */}
      {(text.includes('\n\n') || text.includes('---')) ? (
        <button
          onClick={handleBatchSubmit}
          disabled={!text.trim() || loading}
          className="mt-3 w-full py-2.5 rounded-lg text-sm text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          批量创建（{text.split(/\n{2,}|^---$/m).filter(s => s.trim()).length} 个任务）
        </button>
      ) : null}

      {/* 创建自定义画风弹窗 */}
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

      {/* 编辑画风弹窗 */}
      {editingStyleId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setEditingStyleId('')}
        >
          <div
            className="w-[480px] rounded-xl bg-[#0c121c] border border-white/10 shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-100 mb-1">编辑画风</h3>
            <p className="text-xs text-gray-500 mb-4">修改画风名称和描述</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">画风名称</label>
                <input
                  type="text"
                  value={editStyleName}
                  onChange={(e) => setEditStyleName(e.target.value)}
                  className="w-full rounded-lg bg-[#070b11] border border-white/10 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">画风描述</label>
                <textarea
                  value={editStyleDesc}
                  onChange={(e) => setEditStyleDesc(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg bg-[#070b11] border border-white/10 px-3 py-2 text-sm text-gray-200 resize-none focus:outline-none focus:border-purple-400 transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setEditingStyleId('')}
                className="flex-1 py-2 rounded-lg text-sm text-gray-400 bg-white/5 hover:bg-white/10 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleUpdateStyle}
                disabled={!editStyleName.trim() || updatingStyle}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-400 hover:to-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {updatingStyle ? '保存中...' : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BGM 管理弹窗 */}
      {showBgmManager && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowBgmManager(false)}
        >
          <div
            className="w-[560px] max-h-[80vh] rounded-xl bg-[#0c121c] border border-white/10 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h3 className="text-base font-semibold text-gray-100">BGM 库管理</h3>
              <button
                onClick={() => setShowBgmManager(false)}
                className="text-gray-500 hover:text-gray-300 transition-colors text-lg"
              >
                ×
              </button>
            </div>

            {/* 添加区域 */}
            <div className="px-5 py-4 border-b border-white/5">
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newBgmName}
                  onChange={(e) => setNewBgmName(e.target.value)}
                  placeholder="BGM 名称"
                  className="flex-1 rounded-lg bg-[#070b11] border border-white/10 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
                />
                <select
                  value={newBgmCategory}
                  onChange={(e) => setNewBgmCategory(e.target.value)}
                  className="shrink-0 rounded-lg bg-[#070b11] border border-white/10 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#34d399] transition-colors"
                >
                  {BGM_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleAddBGM}
                disabled={addingBgm}
                className="w-full py-2 rounded-lg text-sm text-[#34d399] bg-[#34d399]/10 border border-[#34d399]/30 hover:bg-[#34d399]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {addingBgm ? '选择文件中...' : '+ 选择音频文件添加'}
              </button>
            </div>

            {/* BGM 列表 */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {bgmList.length === 0 ? (
                <p className="text-center text-sm text-gray-600 py-8">
                  BGM 库为空，请在上方添加音乐文件
                </p>
              ) : (
                <div className="space-y-2">
                  {bgmList.map((bgm) => (
                    <div
                      key={bgm.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-200 truncate">{bgm.name}</span>
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-white/10 text-gray-400">
                            {bgm.category}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          {formatDuration(bgm.duration)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveBGM(bgm.id)}
                        className="shrink-0 ml-2 px-2 py-1 rounded text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 底部关闭 */}
            <div className="px-5 py-3 border-t border-white/5">
              <button
                onClick={() => setShowBgmManager(false)}
                className="w-full py-2 rounded-lg text-sm text-gray-400 bg-white/5 hover:bg-white/10 transition-colors"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 克隆声音弹窗 */}
      {showCloneModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowCloneModal(false)}
        >
          <div
            className="w-[420px] rounded-xl bg-[#0c121c] border border-white/10 shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-100 mb-1">克隆我的声音</h3>
            <p className="text-xs text-gray-500 mb-4">
              上传 8-30 秒清晰录音，AI 将克隆出你的声音用于配音
            </p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">音色名称</label>
              <input
                type="text"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                placeholder="例如：我的声音"
                className="w-full rounded-lg bg-[#070b11] border border-white/10 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-400 transition-colors"
              />
            </div>
            <p className="mt-3 text-xs text-gray-600">
              点击「开始克隆」后将弹出文件选择框，请选择音频文件（mp3/wav/ogg/m4a）
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setShowCloneModal(false); setCloneName(''); }}
                className="flex-1 py-2 rounded-lg text-sm text-gray-400 bg-white/5 hover:bg-white/10 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCloneVoice}
                disabled={!cloneName.trim() || cloning}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-400 hover:to-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {cloning ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>克隆中...</span>
                  </>
                ) : (
                  '开始克隆'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 保存为模板弹窗 */}
      {showSaveTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowSaveTemplate(false)}
        >
          <div
            className="w-[420px] rounded-xl bg-[#0c121c] border border-white/10 shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-100 mb-1">保存为模板？</h3>
            <p className="text-xs text-gray-500 mb-4">
              将当前配置保存为模板，下次创建任务可一键套用
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">模板名称</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="例如：古风人物故事模板"
                  className="w-full rounded-lg bg-[#070b11] border border-white/10 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">描述（可选）</label>
                <input
                  type="text"
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  placeholder="简要描述模板用途"
                  className="w-full rounded-lg bg-[#070b11] border border-white/10 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#34d399] transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowSaveTemplate(false)}
                className="flex-1 py-2 rounded-lg text-sm text-gray-400 bg-white/5 hover:bg-white/10 transition-colors"
              >
                跳过
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={!templateName.trim()}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#34d399] to-[#059669] hover:from-[#2cc88e] hover:to-[#047857] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                保存模板
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CreateTask;
