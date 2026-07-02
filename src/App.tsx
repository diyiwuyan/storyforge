import { useEffect, useState } from 'react';
import { useAppStore } from './store/app-store';
import CreateTask from './pages/CreateTask';
import TaskList from './pages/TaskList';
import TaskDetail from './pages/TaskDetail';
import Settings from './pages/Settings';
import ImageLab from './pages/ImageLab';

type NavPage = 'create' | 'list' | 'imagelab' | 'settings';

const NAV_ITEMS: { key: NavPage; label: string; icon: string }[] = [
  { key: 'create', label: '新建任务', icon: '+' },
  { key: 'list', label: '任务列表', icon: '☰' },
  { key: 'imagelab', label: '画图实验室', icon: '🎨' },
  { key: 'settings', label: '设置', icon: '⚙' },
];

function App() {
  const { page, setPage, updateStepProgress, setCurrentProject, currentProjectId } =
    useAppStore();

  const [updateInfo, setUpdateInfo] = useState<UpdaterInfo | null>(null);

  // 监听自动更新状态
  useEffect(() => {
    window.storyforge?.updater?.getInfo?.().then(setUpdateInfo).catch(() => {});
    const unsub = window.storyforge?.updater?.onStatus?.((data: any) => {
      setUpdateInfo(data);
    });
    return () => { unsub?.(); };
  }, []);

  // 监听 pipeline 进度事件
  useEffect(() => {
    const unsub = window.storyforge?.pipeline?.onProgress?.((data: any) => {
      updateStepProgress(data.stepId, data.progress, data.message, data.status);
    });
    return () => {
      unsub?.();
    };
  }, [updateStepProgress]);

  // 监听步骤变化事件
  useEffect(() => {
    const unsub = window.storyforge?.pipeline?.onStepChanged?.(() => {
      // 刷新当前项目状态
      if (currentProjectId) {
        window.storyforge?.project?.getState?.(currentProjectId).then((project: any) => {
          if (project) setCurrentProject(project);
        });
      }
    });
    return () => {
      unsub?.();
    };
  }, [currentProjectId, setCurrentProject]);

  const handleNavClick = (key: NavPage) => {
    setPage(key);
  };

  const handleBackToList = () => {
    setPage('list');
  };

  return (
    <div className="flex h-screen bg-[#070b11] text-gray-300">
      {/* 侧边栏 */}
      <aside className="w-[240px] shrink-0 bg-[#0c121c] flex flex-col border-r border-white/5">
        {/* Logo */}
        <div className="px-5 py-6">
          <h1 className="text-xl font-bold tracking-wide">
            <span className="text-[#34d399]">Story</span>
            <span className="text-gray-100">Forge</span>
          </h1>
        </div>

        {/* 返回按钮 - detail 页时显示 */}
        {page === 'detail' && (
          <div className="px-3 mb-2">
            <button
              onClick={handleBackToList}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors"
            >
              <span className="text-base">←</span>
              <span>返回列表</span>
            </button>
          </div>
        )}

        {/* 导航 */}
        <nav className="flex-1 px-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => handleNavClick(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                page === item.key
                  ? 'bg-[#34d399]/10 text-[#34d399]'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* 底部版本 & 更新提示 */}
        <div className="px-5 py-4 space-y-2">
          <div className="text-xs text-gray-600">
            StoryForge v{updateInfo?.currentVersion ?? '0.1.0'}
          </div>
          {updateInfo?.status === 'available' && (
            <button
              onClick={() => window.storyforge?.updater?.download?.()}
              className="w-full text-xs px-2 py-1.5 rounded bg-[#34d399]/10 text-[#34d399] hover:bg-[#34d399]/20 transition-colors"
            >
              新版本 v{updateInfo.version} 可用，点击下载
            </button>
          )}
          {updateInfo?.status === 'downloading' && (
            <div className="text-xs text-blue-400">
              下载中 {updateInfo.progress ?? 0}%
              <div className="mt-1 h-1 bg-white/5 rounded overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${updateInfo.progress ?? 0}%` }}
                />
              </div>
            </div>
          )}
          {updateInfo?.status === 'downloaded' && (
            <button
              onClick={() => window.storyforge?.updater?.install?.()}
              className="w-full text-xs px-2 py-1.5 rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors"
            >
              下载完成，点击重启安装
            </button>
          )}
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-y-auto">
        {page === 'create' && <CreateTask />}
        {page === 'list' && <TaskList />}
        {page === 'detail' && <TaskDetail />}
        {page === 'settings' && <Settings />}
        {page === 'imagelab' && <ImageLab />}
      </main>
    </div>
  );
}

export default App;
