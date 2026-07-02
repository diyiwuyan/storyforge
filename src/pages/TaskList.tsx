import { useEffect, useState } from 'react';
import { useAppStore, STEP_NAMES, STEP_IDS, type Project } from '../store/app-store';

function TaskList() {
  const { projects, setProjects, setPage, setCurrentProjectId, setCurrentProject } = useAppStore();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);

  // 加载项目列表和队列状态
  useEffect(() => {
    loadProjects();
    loadQueue();

    // Listen for queue changes
    const unsub = window.storyforge?.queue?.onChanged?.((data: any) => {
      setQueueItems(data || []);
    });
    return () => { unsub?.(); };
  }, []);

  const loadProjects = async () => {
    try {
      const list = await window.storyforge.project.list();
      setProjects(list || []);
    } catch (err) {
      console.error('加载项目列表失败:', err);
    }
  };

  const loadQueue = async () => {
    try {
      const list = await window.storyforge?.queue?.list?.();
      if (list) setQueueItems(list);
    } catch (err) {
      console.error('加载队列状态失败:', err);
    }
  };

  const getQueuePosition = (projectId: string): number => {
    const queued = queueItems.filter(q => q.status === 'queued');
    const idx = queued.findIndex(q => q.projectId === projectId);
    return idx === -1 ? 0 : idx + 1;
  };

  const isInQueue = (projectId: string): QueueItem | undefined => {
    return queueItems.find(q => q.projectId === projectId && (q.status === 'queued' || q.status === 'running'));
  };

  const handleOpenProject = async (project: Project) => {
    setCurrentProjectId(project.id);
    try {
      const state = await window.storyforge.project.getState(project.id);
      setCurrentProject(state || project);
    } catch {
      setCurrentProject(project);
    }
    setPage('detail');
  };

  const handleDelete = async (id: string) => {
    try {
      await window.storyforge.project.delete(id);
      setProjects(projects.filter((p) => p.id !== id));
    } catch (err) {
      console.error('删除项目失败:', err);
    }
    setDeleteConfirmId(null);
  };

  const getProjectStatus = (project: Project) => {
    if (!project.steps || project.steps.length === 0) return { label: '等待开始', color: 'text-gray-500' };
    const running = project.steps.find((s) => s.status === 'running');
    if (running) return { label: `${STEP_NAMES[running.id] || running.id} 进行中`, color: 'text-[#34d399]' };
    const failed = project.steps.find((s) => s.status === 'failed');
    if (failed) return { label: `${STEP_NAMES[failed.id] || failed.id} 失败`, color: 'text-red-400' };
    const allCompleted = project.steps.every((s) => s.status === 'completed' || s.status === 'skipped');
    if (allCompleted) return { label: '已完成', color: 'text-[#34d399]' };
    const paused = project.steps.find((s) => s.status === 'paused');
    if (paused) return { label: '已暂停', color: 'text-yellow-400' };
    return { label: '等待开始', color: 'text-gray-500' };
  };

  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-100">我的任务</h2>
        <button
          onClick={loadProjects}
          className="px-3 py-1.5 rounded-lg text-xs text-gray-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
        >
          刷新
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="mt-20 flex flex-col items-center text-gray-500">
          <div className="text-5xl mb-4">📭</div>
          <p className="text-sm">还没有任务，去创建第一个吧</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {projects.map((project) => {
            const status = getProjectStatus(project);
            return (
              <div
                key={project.id}
                className="rounded-lg bg-[#0c121c] border border-white/5 p-4 hover:border-white/10 transition-all cursor-pointer group"
                onClick={() => handleOpenProject(project)}
              >
                {/* 卡片头部 */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-200 truncate">
                      {project.config?.name || '未命名项目'}
                    </h3>
                    <div className="mt-1 flex items-center gap-3 text-xs">
                      <span className={status.color}>{status.label}</span>
                      {(() => {
                        const qi = isInQueue(project.id);
                        if (qi && qi.status === 'queued') {
                          const pos = getQueuePosition(project.id);
                          return (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/15 text-blue-400 border border-blue-500/20">
                              排队中 #{pos}
                            </span>
                          );
                        }
                        return null;
                      })()}
                      <span className="text-gray-600">
                        {project.createdAt ? formatTime(project.createdAt) : ''}
                      </span>
                    </div>
                  </div>
                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(project.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-all"
                    title="删除"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>

                {/* 步骤进度条概览 */}
                {project.steps && project.steps.length > 0 && (
                  <div className="mt-3 flex items-center gap-1">
                    {STEP_IDS.map((stepId) => {
                      const step = project.steps.find((s) => s.id === stepId);
                      const stepStatus = step?.status || 'pending';
                      let bgColor = 'bg-white/10';
                      if (stepStatus === 'completed') bgColor = 'bg-[#34d399]';
                      else if (stepStatus === 'running') bgColor = 'bg-[#34d399] animate-pulse';
                      else if (stepStatus === 'failed') bgColor = 'bg-red-400';
                      else if (stepStatus === 'paused') bgColor = 'bg-yellow-400';
                      else if (stepStatus === 'stale') bgColor = 'bg-orange-400';
                      return (
                        <div
                          key={stepId}
                          className={`flex-1 h-1.5 rounded-full ${bgColor} transition-all`}
                          title={`${STEP_NAMES[stepId]}: ${stepStatus}`}
                        />
                      );
                    })}
                  </div>
                )}

                {/* 配置标签 */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {project.config?.track && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 text-gray-500">
                      {project.config.track}
                    </span>
                  )}
                  {project.config?.style && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 text-gray-500">
                      {project.config.style}
                    </span>
                  )}
                  {project.config?.aspectRatio && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 text-gray-500">
                      {project.config.aspectRatio}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#0c121c] border border-white/10 rounded-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-medium text-gray-100">确认删除</h3>
            <p className="mt-2 text-sm text-gray-400">
              删除后无法恢复，确定要删除这个项目吗？
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-lg text-sm text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2 rounded-lg text-sm text-white bg-red-500/80 hover:bg-red-500 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskList;
