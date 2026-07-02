import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('storyforge', {
  // 项目管理
  project: {
    create: (config: unknown) => ipcRenderer.invoke('project:create', config),
    list: () => ipcRenderer.invoke('project:list'),
    open: (id: string) => ipcRenderer.invoke('project:open', id),
    delete: (id: string) => ipcRenderer.invoke('project:delete', id),
    getState: (id: string) => ipcRenderer.invoke('project:getState', id),
    uploadReference: (projectId: string) => ipcRenderer.invoke('project:uploadReference', projectId),
    export: (id: string) => ipcRenderer.invoke('project:export', id),
  },

  // 流水线控制
  pipeline: {
    start: (projectId: string) => ipcRenderer.invoke('pipeline:start', projectId),
    pause: (projectId: string) => ipcRenderer.invoke('pipeline:pause', projectId),
    resume: (projectId: string) => ipcRenderer.invoke('pipeline:resume', projectId),
    rerunStep: (projectId: string, stepId: string) =>
      ipcRenderer.invoke('pipeline:rerunStep', projectId, stepId),
    updateSegments: (projectId: string, segments: any[]) =>
      ipcRenderer.invoke('project:updateSegments', projectId, segments),
    updateData: (projectId: string, patch: Record<string, any>) =>
      ipcRenderer.invoke('project:updateData', projectId, patch),
    onProgress: (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on('pipeline:progress', handler);
      return () => {
        ipcRenderer.removeListener('pipeline:progress', handler);
      };
    },
    onStepChanged: (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on('pipeline:stepChanged', handler);
      return () => {
        ipcRenderer.removeListener('pipeline:stepChanged', handler);
      };
    },
  },

  // 生图（实验室 & 单图重生成）
  imagen: {
    test: (params: unknown) => ipcRenderer.invoke('imagen:test', params),
    regenerate: (params: unknown) => ipcRenderer.invoke('imagen:regenerate', params),
  },

  // 设置
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings: unknown) => ipcRenderer.invoke('settings:set', settings),
  },

  // 系统
  system: {
    selectFolder: () => ipcRenderer.invoke('system:selectFolder'),
    openFolder: (path: string) => ipcRenderer.invoke('system:openFolder', path),
    openCapcutDrafts: () => ipcRenderer.invoke('system:openCapcutDrafts'),
    openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url),
  },

  // BGM 库管理
  bgm: {
    list: () => ipcRenderer.invoke('bgm:list'),
    add: (name: string, category: string) => ipcRenderer.invoke('bgm:add', name, category),
    remove: (id: string) => ipcRenderer.invoke('bgm:remove', id),
  },

  // 模板管理
  template: {
    list: () => ipcRenderer.invoke('template:list'),
    create: (data: { name: string; description: string; config: unknown }) =>
      ipcRenderer.invoke('template:create', data),
    delete: (id: string) => ipcRenderer.invoke('template:delete', id),
    apply: (id: string) => ipcRenderer.invoke('template:apply', id),
  },

  // 自定义画风
  style: {
    list: () => ipcRenderer.invoke('style:list'),
    create: (params: { name: string; description: string }) =>
      ipcRenderer.invoke('style:create', params),
    delete: (id: string) => ipcRenderer.invoke('style:delete', id),
    update: (params: { id: string; name?: string; description?: string; promptSuffix?: string }) =>
      ipcRenderer.invoke('style:update', params),
  },

  // 任务队列
  queue: {
    add: (projectId: string) => ipcRenderer.invoke('queue:add', projectId),
    remove: (projectId: string) => ipcRenderer.invoke('queue:remove', projectId),
    list: () => ipcRenderer.invoke('queue:list'),
    onChanged: (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on('queue:changed', handler);
      return () => {
        ipcRenderer.removeListener('queue:changed', handler);
      };
    },
  },

  // 自动更新
  updater: {
    getInfo: () => ipcRenderer.invoke('updater:getInfo'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on('updater:status', handler);
      return () => {
        ipcRenderer.removeListener('updater:status', handler);
      };
    },
  },

  // 声音克隆
  voiceClone: {
    list: () => ipcRenderer.invoke('voiceClone:list'),
    clone: (params: { name: string }) => ipcRenderer.invoke('voiceClone:clone', params),
    delete: (id: string) => ipcRenderer.invoke('voiceClone:delete', id),
  },
});
