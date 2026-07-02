import { ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { projectManager } from '../../pipeline/project-manager';
import { pipelineEngine } from '../../pipeline/pipeline-engine';
import { getSettings, setSettings } from '../../store/settings';
import type { AppSettings } from '../../store/settings';
import { getMainWindow } from '../window-manager';
import type { ProjectConfig, StepId } from '../../pipeline/types';
import { getBGMManager } from '../../bgm/bgm-manager';
import type { BGMItem } from '../../bgm/bgm-manager';
import { getTemplateManager } from '../../template/template-manager';
import type { ProjectTemplate } from '../../template/template-manager';
import { getStyleManager } from '../../style/style-manager';
import type { CustomStyle } from '../../style/style-manager';
import { STYLE_MAP, DEFAULT_STYLE } from '../../shared/style-constants';
import { taskQueue } from '../../pipeline/task-queue';
import {
  getUpdateInfo,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
} from '../../updater/auto-updater';
import { getVoiceCloneManager } from '../../voice-clone/voice-clone-manager';

export function registerIpcHandlers(): void {
  // ----------------------------------------------------------
  // Progress callback — push pipeline events to the renderer
  // ----------------------------------------------------------
  pipelineEngine.onProgress((event) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('pipeline:progress', event);
    }
  });

  // --- 项目管理 ---

  ipcMain.handle('project:create', async (_event, config: ProjectConfig) => {
    const state = projectManager.createProject(config);
    return state;
  });

  ipcMain.handle('project:list', async () => {
    return projectManager.listProjects();
  });

  ipcMain.handle('project:open', async (_event, id: string) => {
    return projectManager.getProject(id);
  });

  ipcMain.handle('project:delete', async (_event, id: string) => {
    projectManager.deleteProject(id);
    return { success: true };
  });

  ipcMain.handle('project:export', async (_event, id: string) => {
    return projectManager.exportProject(id);
  });

  ipcMain.handle('project:getState', async (_event, id: string) => {
    return pipelineEngine.getState(id);
  });

  // --- 流水线控制 ---

  ipcMain.handle('pipeline:start', async (_event, projectId: string) => {
    // Fire-and-forget: progress is pushed via the onProgress callback above
    pipelineEngine.start(projectId).catch((err) => {
      console.error(`[IPC] pipeline:start error for "${projectId}":`, err);
    });
    return { success: true };
  });

  ipcMain.handle('pipeline:pause', async (_event, projectId: string) => {
    pipelineEngine.pause(projectId);
    return { success: true };
  });

  ipcMain.handle('pipeline:resume', async (_event, projectId: string) => {
    // Resume is the same as start — the engine skips completed steps
    pipelineEngine.start(projectId).catch((err) => {
      console.error(`[IPC] pipeline:resume error for "${projectId}":`, err);
    });
    return { success: true };
  });

  ipcMain.handle('pipeline:rerunStep', async (_event, projectId: string, stepId: string) => {
    // rerunStep resets the target step, marks downstream as stale,
    // and internally calls start() — so we fire-and-forget the whole thing
    pipelineEngine
      .rerunStep(projectId, stepId as StepId)
      .catch((err) => {
        console.error(`[IPC] pipeline:rerunStep error for "${projectId}/${stepId}":`, err);
      });
    return { success: true };
  });

  ipcMain.handle('project:updateSegments', async (_event, projectId: string, segments: any[]) => {
    const state = pipelineEngine.getState(projectId);
    state.data.segments = segments;
    state.updatedAt = Date.now();
    pipelineEngine.cacheState(state);
    // 写入磁盘
    const projectDir = pipelineEngine.getProjectDir(projectId);
    const stateFile = path.join(projectDir, 'state.json');
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
    return { success: true };
  });

  // --- 生图实验室 & 单图重生成 ---

  ipcMain.handle(
    'imagen:test',
    async (
      _event,
      params: { prompt: string; style: string; width: number; height: number; engine?: string },
    ) => {
      const settings = getSettings();

      // 1. Use LLM to translate Chinese prompt + style into English prompt
      const { createLLMProvider } = await import('../../providers/llm/factory');
      const llm = createLLMProvider({
        provider: settings.llm.provider,
        apiKey: settings.llm.apiKey,
        model: settings.llm.model,
      });

      let styleSuffix: string;
      if (params.style.startsWith('custom:')) {
        const customId = params.style.slice('custom:'.length);
        const customStyle = getStyleManager().getById(customId);
        styleSuffix = customStyle?.promptSuffix ?? DEFAULT_STYLE;
      } else {
        styleSuffix = STYLE_MAP[params.style] ?? DEFAULT_STYLE;
      }

      const systemMsg = `You are a prompt engineer for AI image generation. The user will give you a description (possibly in Chinese). Translate and expand it into a single English image generation prompt (50-80 words). Describe the visual scene vividly. Do NOT include any markdown, just the raw prompt text. Append this style at the end: ${styleSuffix}`;

      const response = await llm.chat(
        [
          { role: 'system', content: systemMsg },
          { role: 'user', content: params.prompt },
        ],
        { temperature: 0.7, maxTokens: 512 },
      );

      const englishPrompt = response.content.trim();

      // 2. Generate image (use engine param if provided, otherwise fall back to settings)
      const { createImagenProvider } = await import('../../providers/imagen/factory');
      const imagenProviderName = params.engine || settings.imagen.provider;
      const provider = createImagenProvider({
        provider: imagenProviderName,
        apiKey: settings.imagen.apiKey,
        model: settings.imagen.model,
      });

      // Save to temp directory
      const tmpDir = path.join(os.tmpdir(), 'storyforge-lab');
      if (!require('fs').existsSync(tmpDir)) {
        require('fs').mkdirSync(tmpDir, { recursive: true });
      }
      const filename = `lab_${Date.now()}.png`;
      const savePath = path.join(tmpDir, filename);

      const result = await provider.generate(
        { prompt: englishPrompt, width: params.width, height: params.height },
        savePath,
      );

      return { imagePath: result.imagePath, englishPrompt };
    },
  );

  ipcMain.handle(
    'imagen:regenerate',
    async (
      _event,
      params: { projectId: string; segmentIndex: number; newPrompt?: string },
    ) => {
      const state = pipelineEngine.getState(params.projectId);
      const segments = state.data.segments;
      if (!segments || params.segmentIndex >= segments.length) {
        throw new Error(`Invalid segment index: ${params.segmentIndex}`);
      }

      const segment = segments[params.segmentIndex];
      const prompt = params.newPrompt ?? segment.imagePrompt;
      if (!prompt) {
        throw new Error('No prompt available for this segment');
      }

      const settings = getSettings();
      const { createImagenProvider } = await import('../../providers/imagen/factory');
      const provider = createImagenProvider({
        provider: settings.imagen.provider,
        apiKey: settings.imagen.apiKey,
        model: settings.imagen.model,
      });

      // Determine dimensions
      const ratio = state.config.aspectRatio;
      const { IMAGE_DIMENSIONS, DEFAULT_IMAGE_DIMENSIONS } = require('../../shared/style-constants');
      const dims = IMAGE_DIMENSIONS[ratio] ?? DEFAULT_IMAGE_DIMENSIONS;

      const projectDir = pipelineEngine.getProjectDir(params.projectId);
      const imagesDir = path.join(projectDir, 'images');
      if (!require('fs').existsSync(imagesDir)) {
        require('fs').mkdirSync(imagesDir, { recursive: true });
      }

      const savePath = path.join(imagesDir, `segment_${params.segmentIndex}.png`);

      const result = await provider.generate(
        { prompt, width: dims.width, height: dims.height },
        savePath,
      );

      // Update segment in persisted state
      segments[params.segmentIndex] = {
        ...segment,
        imagePath: result.imagePath,
        imagePrompt: prompt,
      };

      // Re-persist state via getState + cache update
      state.updatedAt = Date.now();
      pipelineEngine.cacheState(state);

      // Also write to disk
      const fs = require('fs');
      const stateFile = path.join(projectDir, 'state.json');
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');

      // Notify renderer
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('pipeline:stepChanged', {
          projectId: params.projectId,
          stepId: 'imagen',
        });
      }

      return { imagePath: result.imagePath, prompt };
    },
  );

  // --- 设置 ---

  ipcMain.handle('settings:get', async () => {
    return getSettings();
  });

  ipcMain.handle('settings:set', async (_event, settings: Partial<AppSettings>) => {
    setSettings(settings);
    return { success: true };
  });

  // --- 系统工具 ---

  ipcMain.handle('system:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('system:openFolder', async (_event, folderPath: string) => {
    await shell.openPath(folderPath);
  });

  ipcMain.handle('system:openCapcutDrafts', async () => {
    // 剪映草稿默认路径 (Windows)
    const draftsPath = path.join(
      os.homedir(),
      'AppData',
      'Local',
      'CapCut',
      'User Data',
      'Projects',
      'com.lveditor.draft'
    );
    await shell.openPath(draftsPath);
  });

  // --- BGM 库管理 ---

  ipcMain.handle('bgm:list', async () => {
    const mgr = getBGMManager();
    return mgr.listBGM();
  });

  ipcMain.handle('bgm:add', async (_event, name: string, category: string) => {
    const result = await dialog.showOpenDialog({
      title: '选择 BGM 音乐文件',
      filters: [
        { name: '音频文件', extensions: ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const filePath = result.filePaths[0];
    const mgr = getBGMManager();
    const item = await mgr.addBGM(filePath, name || path.basename(filePath, path.extname(filePath)), category || '未分类');
    return item satisfies BGMItem;
  });

  ipcMain.handle('bgm:remove', async (_event, id: string) => {
    const mgr = getBGMManager();
    const removed = mgr.removeBGM(id);
    return { success: removed };
  });

  // --- 模板管理 ---

  ipcMain.handle('template:list', async () => {
    const mgr = getTemplateManager();
    return mgr.list();
  });

  ipcMain.handle('template:create', async (_event, data: { name: string; description: string; config: ProjectTemplate['config'] }) => {
    const mgr = getTemplateManager();
    return mgr.create(data.name, data.description, data.config);
  });

  ipcMain.handle('template:delete', async (_event, id: string) => {
    const mgr = getTemplateManager();
    const deleted = mgr.delete(id);
    return { success: deleted };
  });

  ipcMain.handle('template:apply', async (_event, id: string) => {
    const mgr = getTemplateManager();
    return mgr.getById(id) ?? null;
  });

  // --- 自定义画风管理 ---

  ipcMain.handle('style:list', async () => {
    const mgr = getStyleManager();
    return mgr.list();
  });

  ipcMain.handle(
    'style:create',
    async (
      _event,
      params: { name: string; description: string },
    ) => {
      const settings = getSettings();
      const { createLLMProvider } = await import('../../providers/llm/factory');
      const llm = createLLMProvider({
        provider: settings.llm.provider,
        apiKey: settings.llm.apiKey,
        model: settings.llm.model,
      });

      const systemPrompt =
        `你是一个专业的 AI 绘图风格专家。用户描述了一种画风，请将其转化为英文的图片生成风格后缀（style suffix），用于拼接在图片描述后面。\n\n` +
        `要求：\n` +
        `1. 输出纯英文，不超过 80 个单词\n` +
        `2. 包含具体的视觉特征：色彩、光影、笔触、构图、质感\n` +
        `3. 如果涉及已知艺术家/动画风格，用"in the style of..."或"inspired by..."\n` +
        `4. 不要包含具体场景内容，只描述风格\n\n` +
        `用户描述：${params.description}\n\n` +
        `请直接输出英文风格后缀，不要任何解释：`;

      const response = await llm.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: params.description },
        ],
        { temperature: 0.7, maxTokens: 512 },
      );

      const promptSuffix = response.content.trim();

      const mgr = getStyleManager();
      const style = mgr.create({
        name: params.name,
        description: params.description,
        promptSuffix,
      });

      return style satisfies CustomStyle;
    },
  );

  ipcMain.handle('style:delete', async (_event, id: string) => {
    const mgr = getStyleManager();
    const deleted = mgr.delete(id);
    return { success: deleted };
  });

  ipcMain.handle(
    'style:update',
    async (
      _event,
      params: { id: string; name?: string; description?: string; promptSuffix?: string },
    ) => {
      const mgr = getStyleManager();
      const updated = mgr.update(params.id, {
        name: params.name,
        description: params.description,
        promptSuffix: params.promptSuffix,
      });
      if (!updated) throw new Error(`Style "${params.id}" not found`);
      return updated;
    },
  );

  // --- 任务队列 ---

  ipcMain.handle('queue:add', async (_event, projectId: string) => {
    taskQueue.enqueue(projectId);
    return { success: true, position: taskQueue.getPosition(projectId) };
  });

  ipcMain.handle('queue:remove', async (_event, projectId: string) => {
    taskQueue.dequeue(projectId);
    return { success: true };
  });

  ipcMain.handle('queue:list', async () => {
    return taskQueue.getQueue();
  });

  // Push queue changes to renderer
  taskQueue.setOnQueueChanged((queue) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('queue:changed', queue);
    }
  });

  // --- 自动更新 ---

  ipcMain.handle('updater:getInfo', async () => {
    return getUpdateInfo();
  });

  ipcMain.handle('updater:check', async () => {
    await checkForUpdates();
    return { success: true };
  });

  ipcMain.handle('updater:download', async () => {
    await downloadUpdate();
    return { success: true };
  });

  ipcMain.handle('updater:install', async () => {
    await installUpdate();
    return { success: true };
  });

  // --- 声音克隆 ---

  ipcMain.handle('voiceClone:list', async () => {
    return getVoiceCloneManager().list();
  });

  ipcMain.handle('voiceClone:clone', async (_event, params: { name: string }) => {
    const { name } = params;
    // 弹出文件选择对话框
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: '选择音频样本（8-30秒）',
      filters: [{ name: '音频文件', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;

    const settings = getSettings();
    const provider = settings.tts.provider || 'edge';
    const apiKey = settings.tts.apiKey || '';

    return getVoiceCloneManager().clone(name, result.filePaths[0], provider, apiKey);
  });

  ipcMain.handle('voiceClone:delete', async (_event, id: string) => {
    return getVoiceCloneManager().delete(id);
  });

  // --- 人像参考图上传 ---

  ipcMain.handle('project:uploadReference', async (_event, projectId: string) => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: '选择人像参考图',
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;

    // 复制到项目目录
    const projectDir = projectManager.getProjectDir(projectId);
    const refDir = path.join(projectDir, 'reference');
    if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, { recursive: true });

    const ext = path.extname(result.filePaths[0]);
    const destPath = path.join(refDir, `reference${ext}`);
    fs.copyFileSync(result.filePaths[0], destPath);

    return destPath;
  });
}
