import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore, STEP_NAMES, STEP_IDS, type StepState } from '../store/app-store';

import { toLocalFileUrl } from '../utils/local-file';

// ====================== 子组件 ======================

function StepIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return (
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#34d399]/20 text-[#34d399] text-xs font-bold">
          ✓
        </span>
      );
    case 'running':
      return (
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#34d399]/20 text-[#34d399] text-sm animate-pulse">
          ●
        </span>
      );
    case 'failed':
      return (
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-400/20 text-red-400 text-xs font-bold">
          ✗
        </span>
      );
    case 'paused':
      return (
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-400/20 text-yellow-400 text-xs">
          ⏸
        </span>
      );
    case 'stale':
      return (
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-orange-400/20 text-orange-400 text-xs">
          ↻
        </span>
      );
    case 'skipped':
      return (
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/5 text-gray-500 text-xs">
          —
        </span>
      );
    default:
      return (
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/5 text-gray-600 text-xs">
          ○
        </span>
      );
  }
}

function ProgressBar({ progress, status }: { progress: number; status: string }) {
  let color = 'bg-gray-600';
  if (status === 'running') color = 'bg-[#34d399]';
  else if (status === 'completed') color = 'bg-[#34d399]';
  else if (status === 'failed') color = 'bg-red-400';
  else if (status === 'paused') color = 'bg-yellow-400';
  else if (status === 'stale') color = 'bg-orange-400';

  return (
    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${color}`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function StepCard({
  step,
  isActive,
  isSelected,
  onRerun,
  onClick,
}: {
  step: StepState;
  isActive: boolean;
  isSelected: boolean;
  onRerun: () => void;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border p-4 transition-all cursor-pointer ${
        isSelected
          ? 'bg-[#34d399]/5 border-[#34d399]/30 ring-1 ring-[#34d399]/20'
          : isActive
          ? 'bg-[#34d399]/5 border-[#34d399]/30'
          : step.status === 'failed'
          ? 'bg-red-400/5 border-red-400/20'
          : 'bg-[#0c121c] border-white/5 hover:border-white/10'
      }`}
    >
      <div className="flex items-center gap-3">
        <StepIcon status={step.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span
              className={`text-sm font-medium ${
                isActive || isSelected ? 'text-[#34d399]' : step.status === 'failed' ? 'text-red-400' : 'text-gray-300'
              }`}
            >
              {STEP_NAMES[step.id] || step.id}
            </span>
            {step.status === 'running' && (
              <span className="text-xs text-[#34d399]">{step.progress}%</span>
            )}
            {step.status === 'completed' && (
              <span className="text-xs text-gray-500">100%</span>
            )}
          </div>
          {/* 进度条 */}
          {(step.status === 'running' || step.status === 'completed' || step.status === 'paused') && (
            <div className="mt-2">
              <ProgressBar progress={step.progress} status={step.status} />
            </div>
          )}
          {/* 状态信息 */}
          {step.message && (
            <p className="mt-1.5 text-xs text-gray-500 truncate">{step.message}</p>
          )}
          {/* 错误指引 */}
          {step.status === 'failed' && step.error && (() => {
            const guidance = getErrorGuidance(step.id, step.error);
            if (!guidance) return null;
            return (
              <div className="mt-2 rounded bg-red-400/5 border border-red-400/10 px-2.5 py-2 text-xs space-y-1">
                <div className="text-red-300">
                  <span className="text-red-400 font-medium">原因：</span>{guidance.cause}
                </div>
                <div className="text-gray-400">
                  <span className="text-gray-300 font-medium">建议：</span>{guidance.suggestion}
                </div>
              </div>
            );
          })()}
        </div>
        {/* 重试按钮 */}
        {(step.status === 'failed' || step.status === 'stale') && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRerun();
            }}
            className="shrink-0 px-2.5 py-1 rounded text-xs text-gray-400 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-gray-200 transition-colors"
          >
            重试
          </button>
        )}
      </div>
    </div>
  );
}

// ====================== 错误指引辅助函数 ======================

function getErrorGuidance(_stepId: string, error?: string): { cause: string; suggestion: string } | null {
  if (!error) return null;

  const errLower = error.toLowerCase();

  // API Key 相关
  if (errLower.includes('401') || errLower.includes('unauthorized') || errLower.includes('api key') || errLower.includes('apikey')) {
    return {
      cause: 'API Key 无效或已过期',
      suggestion: '请前往「设置」检查对应服务的 API Key 是否正确配置',
    };
  }

  // 限流
  if (errLower.includes('429') || errLower.includes('rate limit') || errLower.includes('too many')) {
    return {
      cause: '请求频率超限',
      suggestion: '请等待 1-2 分钟后重试，或在设置中切换到其他服务提供商',
    };
  }

  // 网络错误
  if (errLower.includes('econnrefused') || errLower.includes('enotfound') || errLower.includes('timeout') || errLower.includes('network')) {
    return {
      cause: '网络连接失败',
      suggestion: '请检查网络连接，确保能访问 API 服务。如果使用代理，请确认代理设置正确',
    };
  }

  // 余额不足
  if (errLower.includes('insufficient') || errLower.includes('quota') || errLower.includes('balance')) {
    return {
      cause: 'API 账户余额不足或配额用尽',
      suggestion: '请充值或更换 API Key，也可以在设置中切换到其他服务商',
    };
  }

  // 声音克隆失败
  if (errLower.includes('克隆') || errLower.includes('clone')) {
    return {
      cause: '克隆音色状态异常',
      suggestion: '请在创建任务页面重新克隆声音，或切换为内置音色',
    };
  }

  // 默认
  return {
    cause: '执行过程中遇到错误',
    suggestion: '点击「重试」重新执行此步骤，如持续失败请检查设置',
  };
}

// ====================== 分镜审核面板 ======================

interface StoryboardScene {
  text: string;
  narration?: string;
  description?: string;
  duration?: number;
  [key: string]: any;
}

function StoryboardReviewPanel({
  scenes,
  onConfirm,
  onCancel,
}: {
  scenes: StoryboardScene[];
  onConfirm: (editedScenes: StoryboardScene[]) => void;
  onCancel: () => void;
}) {
  const [editableScenes, setEditableScenes] = useState<StoryboardScene[]>(
    () => scenes.map((s) => ({ ...s }))
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleEdit = (idx: number) => {
    setEditingIndex(idx);
    setEditText(editableScenes[idx].narration || editableScenes[idx].text || '');
  };

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    const updated = [...editableScenes];
    updated[editingIndex] = {
      ...updated[editingIndex],
      text: editText,
      narration: editText,
    };
    setEditableScenes(updated);
    setEditingIndex(null);
    setEditText('');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditText('');
  };

  const handleDelete = (idx: number) => {
    setEditableScenes((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleMoveUp = (idx: number) => {
    if (idx === 0) return;
    setEditableScenes((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const handleMoveDown = (idx: number) => {
    if (idx >= editableScenes.length - 1) return;
    setEditableScenes((prev) => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const handleAddScene = () => {
    setEditableScenes((prev) => [
      ...prev,
      { text: '新分镜...', narration: '新分镜...', duration: 3 },
    ]);
  };

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    if (e.currentTarget instanceof HTMLElement) {
      const el = e.currentTarget;
      setTimeout(() => {
        el.style.opacity = '0.4';
      }, 0);
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(idx);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    const fromIdx = dragIndex;
    if (fromIdx === null || fromIdx === dropIdx) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }

    setEditableScenes((prev) => {
      const next = [...prev];
      const [removed] = next.splice(fromIdx, 1);
      next.splice(dropIdx, 0, removed);
      return next;
    });

    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Review Header */}
      <div className="shrink-0 flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-medium text-yellow-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            分镜审核模式
          </h4>
          <p className="mt-1 text-xs text-gray-500">
            审核并编辑分镜内容，确认后继续执行
          </p>
        </div>
        <span className="text-xs text-gray-500">{editableScenes.length} 个分镜</span>
      </div>

      {/* Scenes List */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-4">
        {editableScenes.map((scene, idx) => (
          <div
            key={idx}
            draggable={editingIndex !== idx}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, idx)}
            className={`rounded-lg bg-[#0c121c] border p-3 group transition-all cursor-grab active:cursor-grabbing ${
              dragOverIndex === idx && dragIndex !== idx
                ? 'border-[#34d399]/50 bg-[#34d399]/5'
                : dragIndex === idx
                ? 'border-white/20 opacity-40'
                : 'border-white/5'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Drag Handle + Index */}
              <span
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-white/5 text-xs text-gray-500 mt-0.5 cursor-grab active:cursor-grabbing select-none group-hover:bg-[#34d399]/10 group-hover:text-[#34d399] transition-colors"
                title="拖拽排序"
              >
                {idx + 1}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {editingIndex === idx ? (
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="w-full rounded bg-[#070b11] border border-white/10 px-3 py-2 text-sm text-gray-200 resize-none focus:outline-none focus:border-[#34d399] transition-colors"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        className="px-3 py-1 rounded text-xs text-[#34d399] bg-[#34d399]/10 border border-[#34d399]/30 hover:bg-[#34d399]/20 transition-colors"
                      >
                        保存
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1 rounded text-xs text-gray-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-300">
                      {scene.narration || scene.text || ''}
                    </p>
                    {scene.duration && (
                      <p className="mt-1 text-xs text-gray-600">
                        预估时长：{scene.duration}s
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Action Buttons */}
              {editingIndex !== idx && (
                <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEdit(idx)}
                    title="编辑"
                    className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-colors text-xs"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => handleMoveUp(idx)}
                    title="上移"
                    disabled={idx === 0}
                    className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-colors text-xs disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => handleMoveDown(idx)}
                    title="下移"
                    disabled={idx >= editableScenes.length - 1}
                    className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-colors text-xs disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => handleDelete(idx)}
                    title="删除"
                    className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-white/10 hover:text-red-400 transition-colors text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Actions */}
      <div className="shrink-0 flex items-center justify-between pt-3 border-t border-white/5">
        <button
          onClick={handleAddScene}
          className="px-3 py-1.5 rounded text-xs text-gray-400 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-gray-200 transition-colors"
        >
          + 添加分镜
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            跳过审核
          </button>
          <button
            onClick={() => onConfirm(editableScenes)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#34d399] to-[#059669] hover:from-[#2cc88e] hover:to-[#047857] transition-all"
          >
            确认并继续执行
          </button>
        </div>
      </div>
    </div>
  );
}

// ====================== 单图重生成组件 ======================

function ImageGridWithRegenerate({
  images,
  projectId,
  onRegenerated,
}: {
  images: any[];
  projectId: string;
  onRegenerated: () => void;
}) {
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [promptDialogIdx, setPromptDialogIdx] = useState<number | null>(null);
  const [newPromptText, setNewPromptText] = useState('');

  const handleRegenerate = async (idx: number) => {
    setRegeneratingIdx(idx);
    try {
      await window.storyforge.imagen.regenerate({ projectId, segmentIndex: idx });
      onRegenerated();
    } catch (err: any) {
      console.error('重新生成失败:', err);
    } finally {
      setRegeneratingIdx(null);
    }
  };

  const handleChangePromptAndRegenerate = async () => {
    if (promptDialogIdx === null || !newPromptText.trim()) return;
    setRegeneratingIdx(promptDialogIdx);
    setPromptDialogIdx(null);
    try {
      await window.storyforge.imagen.regenerate({
        projectId,
        segmentIndex: promptDialogIdx,
        newPrompt: newPromptText.trim(),
      });
      onRegenerated();
    } catch (err: any) {
      console.error('更换提示词重新生成失败:', err);
    } finally {
      setRegeneratingIdx(null);
      setNewPromptText('');
    }
  };

  const openPromptDialog = (idx: number) => {
    setPromptDialogIdx(idx);
    setNewPromptText(images[idx]?.imagePrompt || images[idx]?.prompt || '');
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {images.map((img: any, idx: number) => (
          <div
            key={idx}
            className="group relative aspect-[9/16] rounded-lg bg-[#0c121c] border border-white/5 overflow-hidden"
          >
            {regeneratingIdx === idx ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <span className="inline-block w-6 h-6 border-2 border-gray-600 border-t-[#34d399] rounded-full animate-spin" />
                <span className="text-xs text-gray-500">重新生成中...</span>
              </div>
            ) : img.path || img.url || img.imagePath ? (
              <img
                src={
                  img.imagePath
? toLocalFileUrl(img.imagePath)
                : img.path
                ? toLocalFileUrl(img.path)
                    : img.url
                }
                alt={`Scene ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                {idx + 1}
              </div>
            )}

            {/* Hover Overlay with Actions */}
            {regeneratingIdx !== idx && (
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => handleRegenerate(idx)}
                  className="px-2.5 py-1.5 rounded text-xs text-white bg-[#34d399]/80 hover:bg-[#34d399] transition-colors"
                >
                  重新生成
                </button>
                <button
                  onClick={() => openPromptDialog(idx)}
                  className="px-2.5 py-1.5 rounded text-xs text-white bg-white/20 hover:bg-white/30 transition-colors"
                >
                  更换提示词
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Prompt Change Dialog */}
      {promptDialogIdx !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setPromptDialogIdx(null)}
        >
          <div
            className="w-[500px] bg-[#0c121c] rounded-xl border border-white/10 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-sm font-medium text-gray-200">
                更换提示词 - 分镜 {promptDialogIdx + 1}
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                修改英文提示词后重新生成这张图片
              </p>
            </div>
            <textarea
              value={newPromptText}
              onChange={(e) => setNewPromptText(e.target.value)}
              rows={5}
              className="w-full rounded-lg bg-[#070b11] border border-white/10 px-4 py-3 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-[#34d399] transition-colors"
              placeholder="输入新的英文提示词..."
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPromptDialogIdx(null)}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleChangePromptAndRegenerate}
                disabled={!newPromptText.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#34d399] to-[#059669] hover:from-[#2cc88e] hover:to-[#047857] disabled:opacity-40 transition-all"
              >
                确认并重新生成
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ====================== 完成面板 ======================

function CompletionPanel({
  project,
  onOpenCapcut,
  onOpenFolder,
  onCreateNew,
}: {
  project: any;
  onOpenCapcut: () => void;
  onOpenFolder: () => void;
  onCreateNew: () => void;
}) {
  const [showRewrite, setShowRewrite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const currentSlideRef = useRef(currentSlide);
  currentSlideRef.current = currentSlide;

  const data = project.data || {};
  const segments = data.segments || [];
  const publishText = data.publishText || data.rewrittenBody || '';
  const hashtags = data.hashtags || [];
  const title = data.rewrittenTitle || project.config?.name || '';
  const comments = data.comments || [];
  const draftPath = data.draftPath || '';

  const handleCopyPublishText = () => {
    const fullText = [
      title,
      publishText,
      hashtags.map((t: string) => `#${t}`).join(' '),
    ]
      .filter(Boolean)
      .join('\n\n');

    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center">
      {/* Success Icon and Message */}
      <div className="text-center pt-8 pb-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#34d399]/10 mb-4">
          <span className="text-4xl">&#10003;</span>
        </div>
        <h3 className="text-xl font-bold text-gray-100">
          {data.videoPath ? '视频已合成' : '剪映草稿已生成'}
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          所有步骤已完成，可以进行下一步操作
        </p>
      </div>

      {/* Action Buttons Grid */}
      <div className="w-full max-w-md space-y-3 px-4">
        {/* Open in CapCut */}
        <button
          onClick={onOpenCapcut}
          className="w-full py-3 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[#34d399] to-[#059669] hover:from-[#2cc88e] hover:to-[#047857] transition-all flex items-center justify-center gap-2"
        >
          <span>🎬</span>
          <span>在剪映中打开</span>
        </button>

        {/* Open Draft Folder */}
        <button
          onClick={onOpenFolder}
          className="w-full py-3 rounded-lg text-sm text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
        >
          <span>📂</span>
          <span>打开草稿目录</span>
        </button>

        {/* View Rewrite */}
        <button
          onClick={() => setShowRewrite(!showRewrite)}
          className="w-full py-3 rounded-lg text-sm text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
        >
          <span>📝</span>
          <span>{showRewrite ? '收起改写结果' : '查看改写结果'}</span>
        </button>

        {/* Copy Publish Text */}
        <button
          onClick={handleCopyPublishText}
          className="w-full py-3 rounded-lg text-sm text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
        >
          <span>{copied ? '✓' : '📋'}</span>
          <span>{copied ? '已复制到剪贴板' : '复制发布文案'}</span>
        </button>

        {/* Preview Player */}
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="w-full py-3 rounded-lg text-sm text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
        >
          <span>▶️</span>
          <span>{showPreview ? '关闭预览' : '预览播放'}</span>
        </button>

        {/* Export Project */}
        <button
          onClick={async () => {
            const result = await window.storyforge.project.export(project.id);
            if (result) alert(`已导出到: ${result}`);
          }}
          className="w-full py-3 rounded-lg text-sm text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
        >
          <span>📦</span>
          <span>导出项目</span>
        </button>

        {/* Create New Task */}
        <button
          onClick={onCreateNew}
          className="w-full py-3 rounded-lg text-sm text-[#34d399] bg-[#34d399]/10 border border-[#34d399]/30 hover:bg-[#34d399]/20 transition-colors flex items-center justify-center gap-2"
        >
          <span>+</span>
          <span>创建新任务</span>
        </button>
      </div>

      {/* Preview Panel */}
      {showPreview && (
        <div className="w-full max-w-md mt-6 px-4">
          <div className="rounded-xl bg-[#0c121c] border border-white/10 overflow-hidden">
            {/* 有合成视频时直接播放 MP4 */}
            {data.videoPath ? (
              <div className="flex flex-col items-center">
                <video
                  controls
                  autoPlay
                  className="w-full aspect-[9/16] bg-black rounded"
                  src={toLocalFileUrl(data.videoPath)}
                >
                  浏览器不支持视频播放
                </video>
                <div className="flex items-center gap-3 px-4 py-2 text-xs text-gray-500">
                  {data.videoDuration && <span>时长：{Math.round(data.videoDuration)}s</span>}
                  <button
                    onClick={() => {
                      const dir = data.videoPath.replace(/[/\\][^/\\]+$/, '');
                      window.storyforge.system.openFolder(dir);
                    }}
                    className="text-[#34d399] hover:underline"
                  >
                    打开视频目录
                  </button>
                </div>
              </div>
            ) : segments.length > 0 ? (
              <>
                {/* 图片幻灯片预览（无合成视频时的回退） */}
                <div className="relative aspect-[9/16] bg-black">
                  {segments[currentSlide]?.imagePath && (
                    <img
                      src={toLocalFileUrl(segments[currentSlide].imagePath)}
                      alt={`Scene ${currentSlide + 1}`}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                    <p className="text-white text-sm text-center leading-relaxed">
                      {segments[currentSlide]?.text || ''}
                    </p>
                  </div>
                  <div className="absolute top-2 left-2 right-2 flex gap-1">
                    {segments.map((_: any, idx: number) => (
                      <div
                        key={idx}
                        className={`h-0.5 flex-1 rounded-full transition-colors ${
                          idx < currentSlide ? 'bg-white/60' :
                          idx === currentSlide ? 'bg-[#34d399]' : 'bg-white/20'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                    disabled={currentSlide === 0}
                    className="px-3 py-1 rounded text-xs text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    ◀ 上一镜
                  </button>
                  <span className="text-xs text-gray-500">
                    {currentSlide + 1} / {segments.length}
                  </span>
                  <button
                    onClick={() => setCurrentSlide(Math.min(segments.length - 1, currentSlide + 1))}
                    disabled={currentSlide >= segments.length - 1}
                    className="px-3 py-1 rounded text-xs text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    下一镜 ▶
                  </button>
                </div>
                {data.audioPath && (
                  <div className="px-4 pb-3">
                    <audio
                      controls
                      className="w-full h-8"
                      src={toLocalFileUrl(data.audioPath)}
                      onTimeUpdate={(e) => {
                        const currentTime = (e.target as HTMLAudioElement).currentTime;
                        let accumulated = 0;
                        for (let i = 0; i < segments.length; i++) {
                          accumulated += segments[i].duration || 5;
                          if (currentTime < accumulated) {
                            if (currentSlideRef.current !== i) setCurrentSlide(i);
                            break;
                          }
                        }
                      }}
                    >
                      浏览器不支持音频播放
                    </audio>
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-gray-500 text-sm">暂无预览内容</div>
            )}
          </div>
        </div>
      )}

      {/* Rewrite Details (expandable) */}
      {showRewrite && (
        <div className="w-full max-w-md mt-6 px-4 space-y-3 pb-8">
          {/* Title */}
          {title && (
            <div className="rounded-lg bg-[#0c121c] border border-white/5 p-4">
              <p className="text-xs text-gray-500 mb-1">改写标题</p>
              <p className="text-sm text-gray-200 font-medium">{title}</p>
            </div>
          )}

          {/* Body */}
          {publishText && (
            <div className="rounded-lg bg-[#0c121c] border border-white/5 p-4">
              <p className="text-xs text-gray-500 mb-1">正文</p>
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                {publishText}
              </p>
            </div>
          )}

          {/* Hashtags */}
          {hashtags.length > 0 && (
            <div className="rounded-lg bg-[#0c121c] border border-white/5 p-4">
              <p className="text-xs text-gray-500 mb-2">话题标签</p>
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map((tag: string, i: number) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-full text-xs bg-[#34d399]/10 text-[#34d399]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          {comments.length > 0 && (
            <div className="rounded-lg bg-[#0c121c] border border-white/5 p-4">
              <p className="text-xs text-gray-500 mb-2">评论预埋</p>
              <div className="space-y-1.5">
                {comments.map((c: string, i: number) => (
                  <p key={i} className="text-sm text-gray-400">
                    {c}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Draft Path */}
          {draftPath && (
            <div className="rounded-lg bg-[#0c121c] border border-white/5 p-4">
              <p className="text-xs text-gray-500 mb-1">草稿路径</p>
              <p className="text-xs text-gray-400 break-all font-mono">{draftPath}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ====================== 内联编辑面板组件 ======================

/** 改写文案编辑面板 */
function RewriteEditPanel({
  project,
  onSaveAndRerun,
}: {
  project: any;
  onSaveAndRerun: (body: string) => Promise<void>;
}) {
  const data = project.data || {};
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(data.rewrittenBody || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveAndRerun(editBody);
      setIsEditing(false);
    } catch (err) {
      console.error('保存失败:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs text-gray-500 uppercase tracking-wide">
          智能改写 - 输出
        </h4>
        {!isEditing ? (
          <button
            onClick={() => { setEditBody(data.rewrittenBody || ''); setIsEditing(true); }}
            className="px-3 py-1 rounded text-xs text-[#34d399] bg-[#34d399]/10 border border-[#34d399]/30 hover:bg-[#34d399]/20 transition-colors"
          >
            编辑文案
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1 rounded text-xs text-gray-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 rounded text-xs text-white bg-gradient-to-r from-[#34d399] to-[#059669] hover:from-[#2cc88e] hover:to-[#047857] disabled:opacity-40 transition-all"
            >
              {saving ? '保存中...' : '保存并重跑下游'}
            </button>
          </div>
        )}
      </div>

      {/* 标题 */}
      {data.rewrittenTitle && (
        <div className="rounded-lg bg-[#0c121c] border border-white/5 p-3 mb-2">
          <p className="text-xs text-gray-500 mb-1">标题</p>
          <p className="text-sm text-gray-200 font-medium">{data.rewrittenTitle}</p>
        </div>
      )}

      {/* 正文 */}
      <div className="rounded-lg bg-[#0c121c] border border-white/5 p-3 mb-2">
        <p className="text-xs text-gray-500 mb-1">正文</p>
        {isEditing ? (
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={12}
            className="w-full rounded bg-[#070b11] border border-white/10 px-3 py-2 text-sm text-gray-200 resize-none focus:outline-none focus:border-[#34d399] transition-colors"
          />
        ) : (
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
            {data.rewrittenBody || ''}
          </p>
        )}
      </div>

      {/* 标签 */}
      {data.hashtags?.length > 0 && (
        <div className="rounded-lg bg-[#0c121c] border border-white/5 p-3 mb-2">
          <p className="text-xs text-gray-500 mb-2">话题标签</p>
          <div className="flex flex-wrap gap-1.5">
            {data.hashtags.map((tag: string, i: number) => (
              <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-[#34d399]/10 text-[#34d399]">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 评论预埋 */}
      {data.comments?.length > 0 && (
        <div className="rounded-lg bg-[#0c121c] border border-white/5 p-3">
          <p className="text-xs text-gray-500 mb-2">评论预埋</p>
          <div className="space-y-1.5">
            {data.comments.map((c: string, i: number) => (
              <p key={i} className="text-sm text-gray-400">{c}</p>
            ))}
          </div>
        </div>
      )}

      {isEditing && (
        <p className="mt-2 text-xs text-gray-600">
          保存后将自动重跑「影视分镜」及其下游步骤
        </p>
      )}
    </div>
  );
}

/** 分镜编辑面板 */
function StoryboardEditPanel({
  scenes,
  onSaveAndRerun,
}: {
  scenes: any[];
  onSaveAndRerun: (scenes: any[]) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editScenes, setEditScenes] = useState<any[]>(() => scenes.map(s => ({ ...s })));
  const [saving, setSaving] = useState(false);

  // sync when scenes prop changes
  useEffect(() => {
    if (!isEditing) setEditScenes(scenes.map(s => ({ ...s })));
  }, [scenes, isEditing]);

  const handleFieldChange = (idx: number, field: string, value: string) => {
    setEditScenes(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveAndRerun(editScenes);
      setIsEditing(false);
    } catch (err) {
      console.error('保存失败:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs text-gray-500 uppercase tracking-wide">
          影视分镜 - {editScenes.length} 个场景
        </h4>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1 rounded text-xs text-[#34d399] bg-[#34d399]/10 border border-[#34d399]/30 hover:bg-[#34d399]/20 transition-colors"
          >
            编辑分镜
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => { setEditScenes(scenes.map(s => ({ ...s }))); setIsEditing(false); }}
              className="px-3 py-1 rounded text-xs text-gray-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 rounded text-xs text-white bg-gradient-to-r from-[#34d399] to-[#059669] hover:from-[#2cc88e] hover:to-[#047857] disabled:opacity-40 transition-all"
            >
              {saving ? '保存中...' : '保存并重跑下游'}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {editScenes.map((scene: any, idx: number) => (
          <div key={idx} className="rounded-lg bg-[#0c121c] border border-white/5 p-3">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-white/5 text-xs text-gray-500 mt-0.5">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0 space-y-2">
                {/* 口播文本 */}
                {isEditing ? (
                  <textarea
                    value={scene.narration || scene.text || ''}
                    onChange={(e) => handleFieldChange(idx, 'text', e.target.value)}
                    rows={2}
                    className="w-full rounded bg-[#070b11] border border-white/10 px-2 py-1.5 text-sm text-gray-200 resize-none focus:outline-none focus:border-[#34d399] transition-colors"
                  />
                ) : (
                  <p className="text-sm text-gray-300">{scene.narration || scene.text || ''}</p>
                )}

                {/* 画面描述 */}
                {(scene.visual || isEditing) && (
                  <div>
                    <p className="text-[10px] text-gray-600 mb-0.5">Visual</p>
                    {isEditing ? (
                      <input
                        value={scene.visual || ''}
                        onChange={(e) => handleFieldChange(idx, 'visual', e.target.value)}
                        className="w-full rounded bg-[#070b11] border border-white/10 px-2 py-1 text-xs text-gray-400 focus:outline-none focus:border-[#34d399] transition-colors"
                        placeholder="英文画面描述..."
                      />
                    ) : (
                      <p className="text-xs text-gray-500">{scene.visual}</p>
                    )}
                  </div>
                )}

                {/* 情绪 + 时长 */}
                <div className="flex items-center gap-3 text-xs text-gray-600">
                  {(scene.mood || isEditing) && (
                    <span className="flex items-center gap-1">
                      {isEditing ? (
                        <input
                          value={scene.mood || ''}
                          onChange={(e) => handleFieldChange(idx, 'mood', e.target.value)}
                          className="w-20 rounded bg-[#070b11] border border-white/10 px-1.5 py-0.5 text-xs text-gray-400 focus:outline-none focus:border-[#34d399] transition-colors"
                          placeholder="情绪"
                        />
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-white/5 text-gray-500">{scene.mood}</span>
                      )}
                    </span>
                  )}
                  {scene.duration && <span>{scene.duration}s</span>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isEditing && (
        <p className="mt-2 text-xs text-gray-600">
          保存后将自动重跑「提示词生成」及其下游步骤
        </p>
      )}
    </div>
  );
}

/** 提示词编辑面板 */
function PromptEditPanel({
  segments,
  onSaveAndRerun,
}: {
  segments: any[];
  onSaveAndRerun: (segments: any[]) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editSegments, setEditSegments] = useState<any[]>(() => segments.map(s => ({ ...s })));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) setEditSegments(segments.map(s => ({ ...s })));
  }, [segments, isEditing]);

  const handlePromptChange = (idx: number, value: string) => {
    setEditSegments(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], imagePrompt: value };
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveAndRerun(editSegments);
      setIsEditing(false);
    } catch (err) {
      console.error('保存失败:', err);
    } finally {
      setSaving(false);
    }
  };

  const promptSegments = segments.filter((s: any) => s.imagePrompt);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs text-gray-500 uppercase tracking-wide">
          提示词 - {promptSegments.length} 条
        </h4>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1 rounded text-xs text-[#34d399] bg-[#34d399]/10 border border-[#34d399]/30 hover:bg-[#34d399]/20 transition-colors"
          >
            编辑提示词
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => { setEditSegments(segments.map(s => ({ ...s }))); setIsEditing(false); }}
              className="px-3 py-1 rounded text-xs text-gray-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 rounded text-xs text-white bg-gradient-to-r from-[#34d399] to-[#059669] hover:from-[#2cc88e] hover:to-[#047857] disabled:opacity-40 transition-all"
            >
              {saving ? '保存中...' : '保存并重跑下游'}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {editSegments.map((seg: any, idx: number) => {
          if (!seg.imagePrompt && !isEditing) return null;
          return (
            <div key={idx} className="rounded-lg bg-[#0c121c] border border-white/5 p-3">
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-white/5 text-xs text-gray-500 mt-0.5">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  {/* 口播文本预览 */}
                  <p className="text-xs text-gray-600 mb-1.5 truncate">{seg.text}</p>
                  {/* 英文提示词 */}
                  {isEditing ? (
                    <textarea
                      value={seg.imagePrompt || ''}
                      onChange={(e) => handlePromptChange(idx, e.target.value)}
                      rows={3}
                      className="w-full rounded bg-[#070b11] border border-white/10 px-2 py-1.5 text-xs text-gray-300 resize-none focus:outline-none focus:border-[#34d399] transition-colors font-mono"
                    />
                  ) : (
                    <p className="text-xs text-gray-400 leading-relaxed">{seg.imagePrompt}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isEditing && (
        <p className="mt-2 text-xs text-gray-600">
          保存后将自动重跑「批量生图」及其下游步骤
        </p>
      )}
    </div>
  );
}

// ====================== 输出预览组件 ======================

function OutputPreview({
  project,
  selectedStepId,
  isReviewMode,
  onReviewConfirm,
  onReviewCancel,
}: {
  project: any;
  selectedStepId: string | null;
  isReviewMode: boolean;
  onReviewConfirm: (scenes: StoryboardScene[]) => void;
  onReviewCancel: () => void;
}) {
  const { setPage, setCurrentProject } = useAppStore();

  // Determine which step data to display
  const displayStepId = selectedStepId || (() => {
    const activeStep = project.steps?.find((s: StepState) => s.status === 'running');
    const lastCompleted = [...(project.steps || [])]
      .reverse()
      .find((s: StepState) => s.status === 'completed');
    return (activeStep || lastCompleted)?.id || null;
  })();

  const displayStep = project.steps?.find((s: StepState) => s.id === displayStepId);

  if (!displayStep) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
        等待流水线启动...
      </div>
    );
  }

  const stepData = project.data?.[displayStep.id];

  // compose or capcut completed: show CompletionPanel
  if ((displayStep.id === 'compose' || displayStep.id === 'capcut') && displayStep.status === 'completed') {
    const allCompleted = project.steps?.every(
      (s: StepState) => s.status === 'completed' || s.status === 'skipped'
    );
    if (allCompleted) {
      return (
        <CompletionPanel
          project={project}
          onOpenCapcut={() => {
            const dp = project.data?.draftPath;
            if (dp) {
              // Open the actual draft directory generated by StoryForge
              window.storyforge?.system?.openFolder?.(dp);
            } else {
              window.storyforge?.system?.openCapcutDrafts?.();
            }
          }}
          onOpenFolder={() => {
            const dp = project.data?.draftPath;
            if (dp) {
              // Open the parent directory containing the draft folder
              const dirPath = dp.replace(/[/\\][^/\\]+$/, '');
              window.storyforge?.system?.openFolder?.(dirPath);
            } else {
              window.storyforge?.system?.openCapcutDrafts?.();
            }
          }}
          onCreateNew={() => setPage('create')}
        />
      );
    }
  }

  // review: text content (read-only)
  if (displayStep.id === 'review' && stepData) {
    return (
      <div className="flex-1 overflow-y-auto">
        <h4 className="text-xs text-gray-500 mb-3 uppercase tracking-wide">
          {STEP_NAMES[displayStep.id]} - 输出
        </h4>
        <div className="rounded-lg bg-[#0c121c] border border-white/5 p-4">
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
            {typeof stepData === 'string' ? stepData : stepData.text || JSON.stringify(stepData, null, 2)}
          </p>
        </div>
      </div>
    );
  }

  // rewrite: editable text
  if (displayStep.id === 'rewrite' && displayStep.status === 'completed') {
    return (
      <RewriteEditPanel
        project={project}
        onSaveAndRerun={async (body: string) => {
          if (!project.id) return;
          await window.storyforge.pipeline.updateData(project.id, { rewrittenBody: body });
          await window.storyforge.pipeline.rerunStep(project.id, 'storyboard');
        }}
      />
    );
  }

  // storyboard: review mode or editable display
  if (displayStep.id === 'storyboard' && stepData) {
    const scenes = Array.isArray(stepData) ? stepData : stepData.scenes || [];

    // Semi-auto review mode
    if (isReviewMode && displayStep.status === 'completed') {
      return (
        <StoryboardReviewPanel
          scenes={scenes}
          onConfirm={onReviewConfirm}
          onCancel={onReviewCancel}
        />
      );
    }

    // Also check if segments exist in data
    const segments = project.data?.segments;
    const displayScenes = segments && segments.length > 0 ? segments : scenes;

    return (
      <StoryboardEditPanel
        scenes={displayScenes}
        onSaveAndRerun={async (editedScenes: any[]) => {
          if (!project.id) return;
          const newSegments = editedScenes.map((s: any, idx: number) => ({
            index: idx,
            text: s.narration || s.text || '',
            visual: s.visual,
            mood: s.mood,
            duration: s.duration,
          }));
          await window.storyforge.pipeline.updateData(project.id, { segments: newSegments });
          await window.storyforge.pipeline.rerunStep(project.id, 'prompt');
        }}
      />
    );
  }

  // imagen: image grid with regenerate
  if (displayStep.id === 'imagen' && stepData) {
    const segments = project.data?.segments || [];
    const images = segments.length > 0
      ? segments.filter((s: any) => s.imagePath || s.path || s.url)
      : Array.isArray(stepData) ? stepData : stepData.images || [];

    const refreshProject = async () => {
      if (project.id) {
        const updated = await window.storyforge?.project?.getState?.(project.id);
        if (updated) {
          setCurrentProject(updated);
        }
      }
    };

    return (
      <div className="flex-1 overflow-y-auto">
        <h4 className="text-xs text-gray-500 mb-3 uppercase tracking-wide">
          生成图片 - {images.length} 张
        </h4>
        <ImageGridWithRegenerate
          images={images}
          projectId={project.id}
          onRegenerated={refreshProject}
        />
      </div>
    );
  }

  // prompt: editable prompt list
  if (displayStep.id === 'prompt' && stepData) {
    const segments = project.data?.segments || [];

    return (
      <PromptEditPanel
        segments={segments}
        onSaveAndRerun={async (editedSegments: any[]) => {
          if (!project.id) return;
          await window.storyforge.pipeline.updateData(project.id, { segments: editedSegments });
          await window.storyforge.pipeline.rerunStep(project.id, 'imagen');
        }}
      />
    );
  }

  // tts: audio info
  if (displayStep.id === 'tts' && displayStep.status === 'completed') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
        <div className="text-4xl mb-3">🔊</div>
        <p className="text-sm">TTS 配音已完成</p>
        {project.data?.audioDuration && (
          <p className="mt-1 text-xs text-gray-600">
            音频时长：{Math.round(project.data.audioDuration)}s
          </p>
        )}
        {project.data?.audioPath && (
          <div className="mt-4 w-full max-w-md">
            <audio
              controls
              className="w-full"
              src={toLocalFileUrl(project.data.audioPath)}
            >
              浏览器不支持音频播放
            </audio>
          </div>
        )}
      </div>
    );
  }

  // compose: video playback
  if (displayStep.id === 'compose' && displayStep.status === 'completed' && project.data?.videoPath) {
    return (
      <div className="flex-1 overflow-y-auto">
        <h4 className="text-xs text-gray-500 mb-3 uppercase tracking-wide">
          视频合成 - 完成
        </h4>
        <div className="rounded-lg bg-[#0c121c] border border-white/5 p-4 flex flex-col items-center">
          <video
            controls
            className="w-full max-h-[70vh] rounded"
            src={toLocalFileUrl(project.data.videoPath)}
          >
            浏览器不支持视频播放
          </video>
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
            {project.data.videoDuration && (
              <span>时长：{Math.round(project.data.videoDuration)}s</span>
            )}
            <button
              onClick={() => {
                if (project.data?.videoPath) {
                  const dir = project.data.videoPath.replace(/[/\\][^/\\]+$/, '');
                  window.storyforge.system.openFolder(dir);
                }
              }}
              className="text-[#34d399] hover:underline"
            >
              打开所在目录
            </button>
          </div>
        </div>
      </div>
    );
  }

  // capcut: non-completed state
  if (displayStep.id === 'capcut' && displayStep.status !== 'completed') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
        <div className="text-3xl mb-3">🎬</div>
        <p className="text-sm">
          {STEP_NAMES[displayStep.id]} - {displayStep.message || displayStep.status}
        </p>
      </div>
    );
  }

  // Default: show step status
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
      <div className="text-3xl mb-3">
        {displayStep.status === 'running' ? '⏳' : '📋'}
      </div>
      <p className="text-sm">
        {STEP_NAMES[displayStep.id]} - {displayStep.message || displayStep.status}
      </p>
    </div>
  );
}

// ====================== 主组件 ======================

function TaskDetail() {
  const { currentProject, currentProjectId, setCurrentProject } = useAppStore();
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [isReviewMode, setIsReviewMode] = useState(false);

  // 加载项目数据
  useEffect(() => {
    if (currentProjectId && !currentProject) {
      window.storyforge?.project?.getState?.(currentProjectId).then((project: any) => {
        if (project) setCurrentProject(project);
      });
    }
  }, [currentProjectId]);

  // 判断流水线是否在运行
  useEffect(() => {
    if (!currentProject?.steps) {
      setIsPipelineRunning(false);
      return;
    }
    const hasRunning = currentProject.steps.some((s) => s.status === 'running');
    setIsPipelineRunning(hasRunning);
  }, [currentProject]);

  // Semi-auto mode: detect storyboard completion and enter review mode
  useEffect(() => {
    if (!currentProject) return;
    const isSemiMode = currentProject.config?.mode === 'semi';
    const storyboardStep = currentProject.steps?.find((s) => s.id === 'storyboard');
    const promptStep = currentProject.steps?.find((s) => s.id === 'prompt');

    if (
      isSemiMode &&
      storyboardStep?.status === 'completed' &&
      promptStep?.status === 'pending'
    ) {
      setIsReviewMode(true);
      setSelectedStepId('storyboard');
    }
  }, [currentProject]);

  const handlePause = async () => {
    if (!currentProjectId) return;
    try {
      await window.storyforge.pipeline.pause(currentProjectId);
    } catch (err) {
      console.error('暂停失败:', err);
    }
  };

  const handleResume = async () => {
    if (!currentProjectId) return;
    try {
      await window.storyforge.pipeline.resume(currentProjectId);
    } catch (err) {
      console.error('恢复失败:', err);
    }
  };

  const handleStart = async () => {
    if (!currentProjectId) return;
    try {
      await window.storyforge.pipeline.start(currentProjectId);
    } catch (err) {
      console.error('启动失败:', err);
    }
  };

  const handleRerunStep = async (stepId: string) => {
    if (!currentProjectId) return;
    try {
      await window.storyforge.pipeline.rerunStep(currentProjectId, stepId);
    } catch (err) {
      console.error('重试步骤失败:', err);
    }
  };

  const handleOpenCapcut = async () => {
    try {
      const dp = currentProject?.data?.draftPath;
      if (dp) {
        await window.storyforge.system.openFolder(dp);
      } else {
        await window.storyforge.system.openCapcutDrafts();
      }
    } catch (err) {
      console.error('打开剪映失败:', err);
    }
  };

  // Review mode: confirm and resume pipeline
  const handleReviewConfirm = useCallback(
    async (editedScenes: StoryboardScene[]) => {
      if (!currentProjectId || !currentProject) return;
      setIsReviewMode(false);

      try {
        // 构建 segments
        const segments = editedScenes.map((scene, idx) => ({
          index: idx,
          text: scene.narration || scene.text || '',
          duration: scene.duration,
        }));

        // 先持久化到后端磁盘
        await window.storyforge.pipeline.updateSegments(currentProjectId, segments);

        // 更新前端 store
        const updatedProject = {
          ...currentProject,
          data: {
            ...currentProject.data,
            segments,
          },
        };
        setCurrentProject(updatedProject);

        // 恢复流水线
        await window.storyforge.pipeline.resume(currentProjectId);
      } catch (err) {
        console.error('确认分镜失败:', err);
      }
    },
    [currentProjectId, currentProject, setCurrentProject],
  );

  const handleReviewCancel = useCallback(async () => {
    setIsReviewMode(false);
    if (!currentProjectId) return;
    try {
      await window.storyforge.pipeline.resume(currentProjectId);
    } catch (err) {
      console.error('跳过审核失败:', err);
    }
  }, [currentProjectId]);

  const handleStepClick = (stepId: string) => {
    setSelectedStepId(stepId === selectedStepId ? null : stepId);
  };

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-center text-gray-500">
          <div className="inline-block w-6 h-6 border-2 border-gray-600 border-t-[#34d399] rounded-full animate-spin mb-3" />
          <p className="text-sm">加载项目数据...</p>
        </div>
      </div>
    );
  }

  const steps: StepState[] = currentProject.steps || STEP_IDS.map((id) => ({
    id,
    status: 'pending' as const,
    progress: 0,
    message: '',
  }));

  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const totalCount = steps.length;
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const hasPaused = steps.some((s) => s.status === 'paused');
  const allCompleted = steps.every((s) => s.status === 'completed' || s.status === 'skipped');
  const hasNotStarted = steps.every((s) => s.status === 'pending');

  return (
    <div className="h-full flex flex-col">
      {/* 顶部操作栏 */}
      <header className="shrink-0 px-6 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-100">
              {currentProject.config?.name || '未命名项目'}
            </h2>
            <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
              <span>{completedCount}/{totalCount} 步骤完成</span>
              <span>整体进度 {overallProgress}%</span>
              {currentProject.config?.mode === 'semi' && (
                <span className="px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400 text-[10px]">
                  半自动
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Review Mode Indicator */}
            {isReviewMode && (
              <span className="px-3 py-1.5 rounded-lg text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 animate-pulse">
                等待审核分镜
              </span>
            )}
            {/* 启动按钮（未开始时） */}
            {hasNotStarted && (
              <button
                onClick={handleStart}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#34d399] to-[#059669] hover:from-[#2cc88e] hover:to-[#047857] transition-all"
              >
                启动流水线
              </button>
            )}
            {/* 暂停/恢复按钮 */}
            {isPipelineRunning && (
              <button
                onClick={handlePause}
                className="px-4 py-2 rounded-lg text-sm text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 hover:bg-yellow-400/20 transition-colors"
              >
                暂停
              </button>
            )}
            {hasPaused && !isPipelineRunning && !isReviewMode && (
              <button
                onClick={handleResume}
                className="px-4 py-2 rounded-lg text-sm text-[#34d399] bg-[#34d399]/10 border border-[#34d399]/30 hover:bg-[#34d399]/20 transition-colors"
              >
                恢复
              </button>
            )}
            {/* 剪映按钮 */}
            {allCompleted && (
              <button
                onClick={handleOpenCapcut}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#34d399] to-[#059669] hover:from-[#2cc88e] hover:to-[#047857] transition-all"
              >
                在剪映中打开
              </button>
            )}
          </div>
        </div>

        {/* 整体进度条 */}
        <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#34d399] rounded-full transition-all duration-700 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </header>

      {/* 内容区域 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧：步骤列表 */}
        <div className="w-[360px] shrink-0 border-r border-white/5 overflow-y-auto p-4 space-y-2">
          {steps.map((step) => (
            <StepCard
              key={step.id}
              step={step}
              isActive={step.status === 'running'}
              isSelected={selectedStepId === step.id}
              onRerun={() => handleRerunStep(step.id)}
              onClick={() => handleStepClick(step.id)}
            />
          ))}
        </div>

        {/* 右侧：输出预览 */}
        <div className="flex-1 p-6 flex flex-col min-h-0">
          <OutputPreview
            project={currentProject}
            selectedStepId={selectedStepId}
            isReviewMode={isReviewMode}
            onReviewConfirm={handleReviewConfirm}
            onReviewCancel={handleReviewCancel}
          />
        </div>
      </div>
    </div>
  );
}

export default TaskDetail;
