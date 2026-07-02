import { app, BrowserWindow, Menu } from 'electron';
import path from 'path';
import { createMainWindow, getMainWindow } from './window-manager';
import { registerIpcHandlers } from './ipc/register';
import { registerAllSteps } from '../pipeline/steps/index';
import { buildAppMenu } from './app-menu';
import { initAutoUpdater } from '../updater/auto-updater';

// 判断是否为开发模式
const isDev = !app.isPackaged;

app.whenReady().then(async () => {
  try {
    console.log('[Main] app ready, initializing...');

    // 设置中文菜单
    Menu.setApplicationMenu(buildAppMenu());
    // 注册所有 pipeline 步骤（必须在 IPC handlers 之前）
    registerAllSteps();

    // 注册所有 IPC handlers
    registerIpcHandlers();

    // 初始化自动更新（仅在打包后生效）
    initAutoUpdater().catch((err) => {
      console.warn('[Main] Auto-updater init failed:', err);
    });

    console.log('[Main] Creating main window...');

    // 创建主窗口
    const mainWindow = createMainWindow();

    // 加载页面
    if (isDev) {
      console.log('[Main] Loading dev URL http://localhost:5173');
      mainWindow.loadURL('http://localhost:5173');
      // F12 打开 DevTools
      mainWindow.webContents.on('before-input-event', (_e, input) => {
        if (input.key === 'F12') {
          mainWindow.webContents.toggleDevTools();
        }
      });
    } else {
      mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
    }

    console.log('[Main] Window created successfully');
  } catch (err) {
    console.error('[Main] FATAL ERROR during startup:', err);
  }
});

// macOS 下点击 dock 图标重新创建窗口
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const mainWindow = createMainWindow();

    if (isDev) {
      mainWindow.loadURL('http://localhost:5173');
    } else {
      mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
    }
  }
});

// Windows / Linux 下所有窗口关闭后退出
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
