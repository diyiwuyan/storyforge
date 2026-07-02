import { Menu, shell, BrowserWindow, app } from 'electron';

export function buildAppMenu(): Menu {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    // ===== 文件 =====
    {
      label: '文件',
      submenu: [
        { label: '新建任务', accelerator: 'CmdOrCtrl+N', click: () => {
          const win = BrowserWindow.getFocusedWindow();
          if (win) win.webContents.send('navigate', 'create');
        }},
        { type: 'separator' },
        isMac
          ? { label: '关闭窗口', role: 'close' }
          : { label: '退出', role: 'quit' },
      ],
    },

    // ===== 编辑 =====
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo', accelerator: 'CmdOrCtrl+Z' },
        { label: '重做', role: 'redo', accelerator: 'CmdOrCtrl+Shift+Z' },
        { type: 'separator' },
        { label: '剪切', role: 'cut', accelerator: 'CmdOrCtrl+X' },
        { label: '复制', role: 'copy', accelerator: 'CmdOrCtrl+C' },
        { label: '粘贴', role: 'paste', accelerator: 'CmdOrCtrl+V' },
        { label: '全选', role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
      ],
    },

    // ===== 视图 =====
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload', accelerator: 'CmdOrCtrl+R' },
        { label: '强制重新加载', role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+R' },
        { label: '开发者工具', role: 'toggleDevTools', accelerator: 'F12' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom', accelerator: 'CmdOrCtrl+0' },
        { label: '放大', role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
        { label: '缩小', role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen', accelerator: 'F11' },
      ],
    },

    // ===== 窗口 =====
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '最大化', click: () => {
          const win = BrowserWindow.getFocusedWindow();
          if (win) {
            win.isMaximized() ? win.unmaximize() : win.maximize();
          }
        }},
        ...(isMac ? [
          { type: 'separator' as const },
          { label: '前置所有窗口', role: 'front' as const },
        ] : []),
        { type: 'separator' },
        { label: '关闭', role: 'close' },
      ],
    },

    // ===== 帮助 =====
    {
      label: '帮助',
      submenu: [
        { label: '使用文档', click: () => {
          shell.openExternal('https://storybound.cc');
        }},
        { type: 'separator' },
        { label: '检查更新...', click: async () => {
          try {
            const { checkForUpdates } = await import('../updater/auto-updater');
            await checkForUpdates();
          } catch (err) {
            console.warn('[Menu] checkForUpdates failed:', err);
          }
        }},
        { type: 'separator' },
        { label: '关于 StoryForge', click: () => {
          const { dialog } = require('electron');
          dialog.showMessageBox({
            type: 'info',
            title: '关于 StoryForge',
            message: `StoryForge v${app.getVersion()}`,
            detail: '文案进，剪映工程出\n全自动桌面端流水线工具',
          });
        }},
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
