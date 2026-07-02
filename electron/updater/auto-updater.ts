// ============================================================
// Auto-updater module — wraps electron-updater with IPC events
// ============================================================
//
// 在 production 构建中使用 electron-updater 检查/下载/安装更新。
// 在 dev 模式下所有操作静默跳过，避免干扰开发。
//
// 更新事件通过 IPC 推送到渲染进程，UI 可以展示更新状态。
// 使用 require() 动态加载 electron-updater，避免未安装时 TS 编译报错。
// ============================================================

import { app, BrowserWindow } from 'electron';

/** 更新状态 */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateInfo {
  status: UpdateStatus;
  version?: string;
  releaseNotes?: string;
  progress?: number;
  error?: string;
  currentVersion: string;
}

// 当前更新状态（内存缓存）
let currentInfo: UpdateInfo = {
  status: 'idle',
  currentVersion: '0.0.0',
};

// electron-updater autoUpdater 实例（延迟加载）
let _autoUpdater: any = null;

/** 尝试加载 electron-updater，失败返回 null */
function getAutoUpdater(): any {
  if (_autoUpdater) return _autoUpdater;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('electron-updater');
    _autoUpdater = mod.autoUpdater;
    return _autoUpdater;
  } catch {
    return null;
  }
}

/** 向所有窗口广播更新状态 */
function broadcast(info: UpdateInfo): void {
  currentInfo = info;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:status', info);
    }
  }
}

/** 获取当前更新状态 */
export function getUpdateInfo(): UpdateInfo {
  return { ...currentInfo };
}

/**
 * 初始化自动更新。
 *
 * 使用 require() 动态加载，dev 模式不会因缺少 electron-updater 而报错。
 * 如果项目未安装 electron-updater，所有操作静默降级。
 */
export async function initAutoUpdater(): Promise<void> {
  const isDev = !app.isPackaged;
  currentInfo = {
    status: 'idle',
    currentVersion: app.getVersion(),
  };

  if (isDev) {
    console.log('[AutoUpdater] Dev mode — auto-update disabled');
    return;
  }

  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) {
    console.warn('[AutoUpdater] electron-updater not installed — skipping');
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    broadcast({ status: 'checking', currentVersion: app.getVersion() });
  });

  autoUpdater.on('update-available', (info: any) => {
    broadcast({
      status: 'available',
      version: info.version,
      releaseNotes:
        typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : Array.isArray(info.releaseNotes)
            ? info.releaseNotes.map((n: any) => n.note ?? '').join('\n')
            : undefined,
      currentVersion: app.getVersion(),
    });
  });

  autoUpdater.on('update-not-available', () => {
    broadcast({ status: 'not-available', currentVersion: app.getVersion() });
  });

  autoUpdater.on('download-progress', (progress: any) => {
    broadcast({
      status: 'downloading',
      progress: Math.round(progress.percent),
      currentVersion: app.getVersion(),
    });
  });

  autoUpdater.on('update-downloaded', (info: any) => {
    broadcast({
      status: 'downloaded',
      version: info.version,
      currentVersion: app.getVersion(),
    });
  });

  autoUpdater.on('error', (err: any) => {
    broadcast({
      status: 'error',
      error: err?.message ?? String(err),
      currentVersion: app.getVersion(),
    });
  });

  // 启动后延迟 5 秒检查
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e: any) => {
      console.warn('[AutoUpdater] Initial check failed:', e?.message);
    });
  }, 5000);
}

/** 手动检查更新 */
export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    broadcast({ status: 'not-available', currentVersion: app.getVersion() });
    return;
  }
  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) return;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err: any) {
    broadcast({
      status: 'error',
      error: err?.message ?? String(err),
      currentVersion: app.getVersion(),
    });
  }
}

/** 开始下载更新 */
export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged) return;
  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) return;
  try {
    await autoUpdater.downloadUpdate();
  } catch (err: any) {
    broadcast({
      status: 'error',
      error: err?.message ?? String(err),
      currentVersion: app.getVersion(),
    });
  }
}

/** 安装更新并重启 */
export async function installUpdate(): Promise<void> {
  if (!app.isPackaged) return;
  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) return;
  try {
    autoUpdater.quitAndInstall(false, true);
  } catch (err: any) {
    console.error('[AutoUpdater] installUpdate failed:', err);
  }
}
