# StoryForge 技术架构设计文档

> "文案进，剪映工程出"的全自动桌面端流水线工具
> 技术栈: Electron + React + TypeScript + Node.js

---

## 一、系统全景架构

### 1.1 进程模型

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Electron App                                 │
│                                                                     │
│  ┌─────────────────────┐    IPC (contextBridge)  ┌───────────────┐ │
│  │   Main Process       │◄──────────────────────►│  Renderer      │ │
│  │   (Node.js)          │                        │  (React)       │ │
│  │                      │                        │                │ │
│  │  ┌────────────────┐  │  pipeline:progress     │  ┌──────────┐  │ │
│  │  │ PipelineEngine │──┼──────────────────────►│  │ Pipeline │  │ │
│  │  │  (7 steps)     │  │  pipeline:stepChanged  │  │ Panel UI │  │ │
│  │  └──────┬─────────┘  │                        │  └──────────┘  │ │
│  │         │            │  project:updated       │  ┌──────────┐  │ │
│  │  ┌──────▼─────────┐  │──────────────────────►│  │ Editor   │  │ │
│  │  │  Providers     │  │                        │  │ Preview  │  │ │
│  │  │  LLM/Img/TTS   │  │  project:dataRequest   │  └──────────┘  │ │
│  │  └──────┬─────────┘  │◄──────────────────────│                │ │
│  │         │            │                        │                │ │
│  │  ┌──────▼─────────┐  │                        │  Zustand        │ │
│  │  │  CapCut Builder│  │                        │  Stores         │ │
│  │  └──────┬─────────┘  │                        │                │ │
│  │         │            │                        │                │ │
│  │  ┌──────▼─────────┐  │                        │                │ │
│  │  │  Storage Layer  │  │                        │                │ │
│  │  │  (JSON + files) │  │                        │                │ │
│  │  └────────────────┘  │                        │                │ │
│  └─────────────────────┘                        └───────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心设计原则

| 原则 | 实现方式 |
|------|----------|
| 流水线可暂停/可重跑 | 每步独立，状态机驱动，输出缓存到磁盘 |
| 断点续跑 | state.json 持久化，app 重启后恢复 |
| 实时进度 | IPC 事件流 (Main -> Renderer)，Zustand 订阅 |
| 模块化 | Provider 接口隔离外部 API，Step 接口隔离流水线逻辑 |
| 配置可切换 | API Key / 模型 / 画风 / 音色 全部项目级可配 |

---

## 二、项目目录结构

```
storyforge/
├── package.json
├── electron-builder.yml
├── tsconfig.json                    # 前端 TS 配置
├── tsconfig.node.json               # Electron main/preload TS 配置
├── vite.config.ts                   # Vite + React 构建配置
├── tailwind.config.js
├── postcss.config.js
│
├── electron/                        # ===== Main Process =====
│   ├── main/
│   │   ├── index.ts                 # App entry: 创建窗口、注册 IPC
│   │   ├── window-manager.ts        # 窗口生命周期管理
│   │   ├── ipc/
│   │   │   ├── register.ts          # 统一注册所有 IPC handlers
│   │   │   ├── project.ipc.ts       # 项目 CRUD: create/list/open/delete
│   │   │   ├── pipeline.ipc.ts      # 流水线控制: start/pause/resume/rerun
│   │   │   ├── settings.ipc.ts      # 全局设置: API keys, 默认参数
│   │   │   └── system.ipc.ts        # 系统工具: 选择文件夹、打开剪映目录
│   │   └── app-menu.ts              # 原生菜单
│   │
│   ├── preload/
│   │   └── index.ts                 # contextBridge: 暴露类型安全的 API
│   │
│   ├── pipeline/                    # ===== 7 步流水线引擎 =====
│   │   ├── types.ts                 # 所有流水线类型定义 (StepId, StepStatus,
│   │   │                            #   PipelineState, StepOutput 等)
│   │   ├── base-step.ts             # 抽象基类: 生命周期、进度报告、取消
│   │   ├── step-registry.ts         # 步骤注册表: id -> step 实例
│   │   ├── pipeline-engine.ts       # 核心: 编排步骤、管理状态、持久化
│   │   ├── step-context.ts          # 执行上下文: 取消信号、进度回调
│   │   └── steps/
│   │       ├── review-step.ts       # Step 1: 文案预审
│   │       ├── rewrite-step.ts      # Step 2: 智能改写
│   │       ├── storyboard-step.ts   # Step 3: 影视分镜
│   │       ├── prompt-step.ts       # Step 4: 提示词生成
│   │       ├── imagen-step.ts       # Step 5: 批量生图 (并发+降级)
│   │       ├── tts-step.ts          # Step 6: TTS 配音
│   │       └── capcut-step.ts       # Step 7: 剪映打包
│   │
│   ├── providers/                   # ===== 外部 API 适配层 =====
│   │   ├── llm/
│   │   │   ├── base.ts              # interface LLMProvider { chat() }
│   │   │   ├── deepseek.ts          # DeepSeek 实现
│   │   │   ├── qwen.ts              # 通义千问 实现
│   │   │   ├── openai.ts            # OpenAI 实现
│   │   │   └── factory.ts           # 按 config 创建 provider
│   │   ├── imagen/
│   │   │   ├── base.ts              # interface ImagenProvider { generate() }
│   │   │   ├── fal.ts               # fal.ai Flux 实现
│   │   │   ├── siliconflow.ts       # 硅基流动 实现
│   │   │   ├── wanx.ts              # 通义万相 实现
│   │   │   ├── fallback-chain.ts    # 多引擎降级管理器
│   │   │   └── factory.ts
│   │   └── tts/
│   │       ├── base.ts              # interface TTSProvider { synthesize() }
│   │       ├── volcano.ts           # 火山引擎 TTS
│   │       ├── minimax.ts           # MiniMax TTS
│   │       ├── edge-tts.ts          # Edge TTS (免费备选)
│   │       └── factory.ts
│   │
│   ├── capcut/                      # ===== 剪映工程文件生成 =====
│   │   ├── draft-builder.ts         # 主构建器: 组装完整 draft_content.json
│   │   ├── track-builder.ts         # 轨道构建: video/audio/text 三轨
│   │   ├── segment-builder.ts       # 片段构建: timerange + clip + material ref
│   │   ├── material-builder.ts      # 素材引用构建: images/audios/texts
│   │   ├── text-style.ts            # 字幕样式: 字体/颜色/描边/位置
│   │   ├── time-utils.ts            # 微秒时间工具 (1s = 1,000,000 μs)
│   │   ├── constants.ts             # 剪映格式常量 (版本号、默认值)
│   │   └── draft-installer.ts       # 安装到剪映草稿目录
│   │
│   ├── storage/                     # ===== 持久化层 =====
│   │   ├── project-store.ts         # 项目 CRUD + state.json 读写
│   │   ├── asset-store.ts           # 素材文件管理 (图片/音频/SRT)
│   │   ├── config-store.ts          # 全局配置 (API keys, 默认参数)
│   │   └── paths.ts                 # 路径解析: userData, 项目目录, 剪映目录
│   │
│   └── utils/
│       ├── logger.ts                # 结构化日志 (electron-log)
│       ├── retry.ts                 # 指数退避重试
│       ├── crypto.ts                # UUID 生成、MD5 计算
│       ├── audio.ts                 # 音频时长探测 (ffprobe)
│       ├── image.ts                 # 图片尺寸读取
│       └── srt.ts                   # SRT 字幕生成
│
├── src/                             # ===== Renderer Process =====
│   ├── main.tsx                     # React 入口
│   ├── App.tsx                      # 路由 + 全局 Provider
│   │
│   ├── pages/
│   │   ├── project-list.tsx         # 首页: 项目列表 + 新建
│   │   ├── editor.tsx               # 主编辑页: 左输入 / 中流水线 / 右预览
│   │   └── settings.tsx             # 设置页: API 配置
│   │
│   ├── components/
│   │   ├── pipeline/
│   │   │   ├── pipeline-panel.tsx   # 7 步面板容器
│   │   │   ├── step-card.tsx        # 单步卡片 (状态 + 进度 + 操作)
│   │   │   ├── step-progress.tsx    # 进度条
│   │   │   └── pipeline-controls.tsx# 全局控制 (开始/暂停/重跑)
│   │   ├── editor/
│   │   │   ├── script-input.tsx     # 原始文案输入
│   │   │   ├── script-preview.tsx   # 预审/改写结果预览
│   │   │   ├── storyboard-grid.tsx  # 分镜网格展示
│   │   │   ├── image-gallery.tsx    # 生成图片网格
│   │   │   ├── audio-player.tsx     # 配音试听
│   │   │   └── capcut-output.tsx    # 剪映输出信息 + "打开剪映"按钮
│   │   ├── settings/
│   │   │   ├── llm-config.tsx       # LLM 提供商配置
│   │   │   ├── imagen-config.tsx    # 生图提供商配置
│   │   │   ├── tts-config.tsx       # TTS 提供商配置
│   │   │   └── capcut-config.tsx    # 剪映路径 / 视频参数
│   │   └── common/
│   │       ├── toast.tsx
│   │       ├── confirm-dialog.tsx
│   │       └── loading-spinner.tsx
│   │
│   ├── hooks/
│   │   ├── use-pipeline.ts          # 订阅流水线状态 (IPC 事件)
│   │   ├── use-project.ts           # 项目数据管理
│   │   ├── use-ipc.ts               # IPC 调用封装
│   │   └── use-settings.ts          # 设置管理
│   │
│   ├── stores/                      # Zustand 状态管理
│   │   ├── pipeline-store.ts        # 流水线状态 (steps, progress, status)
│   │   ├── project-store.ts         # 项目列表 + 当前项目
│   │   └── settings-store.ts        # 全局设置
│   │
│   ├── types/                       # 共享类型 (与 electron/pipeline/types.ts 对应)
│   │   ├── pipeline.ts
│   │   ├── project.ts
│   │   └── settings.ts
│   │
│   └── styles/
│       └── globals.css
│
├── resources/                       # 打包资源
│   ├── icons/
│   │   ├── icon.ico
│   │   └── icon.png
│   └── prompts/                     # LLM Prompt 模板 (用户可编辑)
│       ├── review.md                # Step 1 预审 prompt
│       ├── rewrite.md               # Step 2 改写 prompt
│       ├── storyboard.md            # Step 3 分镜 prompt
│       └── prompt-gen.md            # Step 4 提示词生成 prompt
│
└── build/                           # 构建输出 (gitignored)
```

---

## 三、数据流设计

### 3.1 全局数据流

```
用户粘贴文案
      │
      ▼
[Renderer: script-input.tsx]
      │  IPC: project.create({ rawText })
      ▼
[Main: project.ipc.ts]
      │  创建项目目录 + 初始化 state.json
      ▼
[Main: PipelineEngine]
      │  读取 state.json → 构造 PipelineState
      │
      │  ┌─── Step 1: Review ──────┐
      │  │  input: rawText         │
      │  │  provider: LLMProvider   │
      │  │  output: cleanedText     │
      │  │  → 写入 state.json       │
      │  │  → emit pipeline:stepChanged
      │  └──────────┬──────────────┘
      │             ▼
      │  ┌─── Step 2: Rewrite ─────┐
      │  │  input: cleanedText      │
      │  │  provider: LLMProvider   │
      │  │  output: { body, title,  │
      │  │    tags, comments }      │
      │  │  → 写入 state.json       │
      │  └──────────┬──────────────┘
      │             ▼
      │  ┌─── Step 3: Storyboard ──┐
      │  │  input: body             │
      │  │  provider: LLMProvider   │
      │  │  output: scenes[]        │
      │  │  (每个 scene = 1分镜)    │
      │  └──────────┬──────────────┘
      │             ▼
      │  ┌─── Step 4: Prompt Gen ──┐
      │  │  input: scenes[], style  │
      │  │  provider: LLMProvider   │
      │  │  output: scenes[].prompt │
      │  └──────────┬──────────────┘
      │             ▼
      │  ┌─── Step 5: Imagen ──────┐
      │  │  input: scenes[]         │
      │  │  provider: FallbackChain │
      │  │  (并发 N 张, 失败降级)   │
      │  │  output: scenes[].image  │
      │  │  → emit pipeline:progress│
      │  │    (每张完成时更新)       │
      │  └──────────┬──────────────┘
      │             ▼
      │  ┌─── Step 6: TTS ─────────┐
      │  │  input: body (全文)      │
      │  │  provider: TTSProvider   │
      │  │  output: { audioPath,    │
      │  │    duration, srtPath,    │
      │  │    segments[].timing }   │
      │  └──────────┬──────────────┘
      │             ▼
      │  ┌─── Step 7: CapCut ──────┐
      │  │  input: 所有前序输出     │
      │  │  builder: DraftBuilder   │
      │  │  output: draftPath       │
      │  │  → 安装到剪映草稿目录    │
      │  └──────────────────────────┘
      │
      ▼
[Main: emit pipeline:completed]
      │
      ▼
[Renderer: capcut-output.tsx]
      显示 "已在剪映中打开" + 打开草稿目录按钮
```

### 3.2 IPC 通道设计

| 方向 | 通道名 | 模式 | 用途 |
|------|--------|------|------|
| R -> M | `project:create` | invoke | 创建新项目 |
| R -> M | `project:list` | invoke | 获取项目列表 |
| R -> M | `project:open` | invoke | 打开已有项目 (加载 state) |
| R -> M | `project:delete` | invoke | 删除项目 |
| R -> M | `project:updateConfig` | invoke | 更新项目配置 (画风/音色等) |
| R -> M | `pipeline:start` | invoke | 启动流水线 (可指定从哪步开始) |
| R -> M | `pipeline:pause` | invoke | 暂停当前步骤 |
| R -> M | `pipeline:resume` | invoke | 恢复执行 |
| R -> M | `pipeline:rerun` | invoke | 重跑指定步骤 (级联标记后续为 stale) |
| R -> M | `pipeline:getState` | invoke | 获取当前完整状态 |
| M -> R | `pipeline:stepChanged` | event | 步骤状态变更通知 |
| M -> R | `pipeline:progress` | event | 步骤内进度更新 (如生图 3/15) |
| M -> R | `pipeline:log` | event | 实时日志输出 |
| M -> R | `project:updated` | event | 项目数据变更通知 |
| R -> M | `settings:get` | invoke | 获取全局设置 |
| R -> M | `settings:set` | invoke | 更新全局设置 |
| R -> M | `system:selectFolder` | invoke | 打开文件夹选择对话框 |
| R -> M | `system:openPath` | invoke | 在资源管理器中打开路径 |

### 3.3 状态持久化设计

每个项目在磁盘上的目录结构:

```
~/.storyforge/projects/{projectId}/
├── state.json                 # 核心状态文件 (断点续跑的依据)
├── config.json                # 项目级配置 (覆盖全局默认)
├── assets/
│   ├── images/
│   │   ├── scene_01.png       # Step 5 输出
│   │   ├── scene_02.png
│   │   └── ...
│   ├── audio/
│   │   ├── narration.mp3      # Step 6 输出 (完整配音)
│   │   └── segments/           # 按分镜切片的音频 (可选)
│   │       ├── seg_01.mp3
│   │       └── ...
│   ├── subtitles/
│   │   └── subtitle.srt       # Step 6 输出
│   └── drafts/
│       └── capcut/             # Step 7 输出
│           ├── draft_content.json
│           └── draft_meta_info.json
└── logs/
    └── pipeline.log            # 执行日志
```

state.json 结构:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "《活着》书单视频",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-15T11:45:00.000Z",

  "pipeline": {
    "status": "paused",
    "currentStep": "imagen",
    "steps": [
      {
        "id": "review",
        "status": "completed",
        "startedAt": "2025-01-15T10:30:05.000Z",
        "completedAt": "2025-01-15T10:30:12.000Z",
        "progress": 100,
        "error": null
      },
      {
        "id": "rewrite",
        "status": "completed",
        "startedAt": "2025-01-15T10:30:12.000Z",
        "completedAt": "2025-01-15T10:30:35.000Z",
        "progress": 100,
        "error": null
      },
      {
        "id": "storyboard",
        "status": "completed",
        "startedAt": "2025-01-15T10:30:35.000Z",
        "completedAt": "2025-01-15T10:30:58.000Z",
        "progress": 100,
        "error": null
      },
      {
        "id": "prompt",
        "status": "completed",
        "startedAt": "2025-01-15T10:30:58.000Z",
        "completedAt": "2025-01-15T10:31:15.000Z",
        "progress": 100,
        "error": null
      },
      {
        "id": "imagen",
        "status": "paused",
        "startedAt": "2025-01-15T10:31:15.000Z",
        "completedAt": null,
        "progress": 40,
        "progressMessage": "生成第 6/15 张...",
        "error": null
      },
      {
        "id": "tts",
        "status": "stale",
        "progress": 0,
        "error": null
      },
      {
        "id": "capcut",
        "status": "stale",
        "progress": 0,
        "error": null
      }
    ]
  },

  "outputs": {
    "review": {
      "cleanedText": "余华的《活着》讲述了...",
      "issues": ["删除了微信号", "替换了1个敏感词"],
      "originalLength": 1520,
      "cleanedLength": 1480
    },
    "rewrite": {
      "title": "3分钟读完《活着》：人为什么要活着？",
      "titleOptions": ["标题1", "标题2", "标题3"],
      "body": "你知道一个人要经历多少苦难...",
      "tags": ["读书", "书单", "余华", "活着"],
      "comments": ["你觉得活着的意义是什么？", "..."],
      "wordCount": 850
    },
    "storyboard": {
      "scenes": [
        {
          "id": 1,
          "text": "你知道一个人要经历多少苦难，才能说出活着这两个字吗？",
          "narration": "你知道一个人要经历多少苦难，才能说出活着这两个字吗？",
          "mood": "悬疑",
          "durationHint": 4.5
        },
        {
          "id": 2,
          "text": "余华的《活着》，给了我们一个答案。",
          "narration": "余华的《活着》，给了我们一个答案。",
          "mood": "温暖",
          "durationHint": 3.0
        }
      ]
    },
    "prompt": {
      "artStyle": "cinematic_photography",
      "scenes": [
        {
          "id": 1,
          "prompt": "A weathered old man sitting alone on a wooden bench...",
          "negativePrompt": "cartoon, anime, watermark, text, low quality",
          "seed": 123456789
        }
      ]
    },
    "imagen": {
      "scenes": [
        {
          "id": 1,
          "imagePath": "C:/Users/.../scene_01.png",
          "width": 1080,
          "height": 1920,
          "engine": "fal",
          "success": true
        },
        {
          "id": 6,
          "imagePath": null,
          "success": false,
          "error": "All engines failed"
        }
      ]
    },
    "tts": {
      "audioPath": "C:/Users/.../narration.mp3",
      "duration": 125.5,
      "srtPath": "C:/Users/.../subtitle.srt",
      "voice": "zh-CN-XiaoxiaoNeural",
      "segments": [
        {
          "sceneId": 1,
          "startMs": 0,
          "endMs": 4500,
          "text": "你知道一个人要经历多少苦难..."
        }
      ]
    },
    "capcut": {
      "draftPath": null,
      "installedToCapCut": false
    }
  },

  "config": {
    "llm": {
      "provider": "deepseek",
      "model": "deepseek-chat",
      "temperature": 0.7
    },
    "imagen": {
      "provider": "fal",
      "model": "fal-ai/flux/dev",
      "width": 1080,
      "height": 1920,
      "concurrency": 3,
      "stylePrefix": "cinematic photography, warm lighting, film grain, "
    },
    "tts": {
      "provider": "volcano",
      "voice": "zh_female_wanwanxiaohe_moon_bigtts",
      "speed": 1.0,
      "pitch": 0
    },
    "video": {
      "width": 1080,
      "height": 1920,
      "fps": 30
    },
    "subtitle": {
      "fontSize": 44,
      "color": "#FFFFFF",
      "strokeColor": "#000000",
      "strokeWidth": 2,
      "positionY": 1550,
      "bold": true
    }
  },

  "errors": [
    {
      "stepId": "imagen",
      "sceneId": 6,
      "message": "All image generation engines failed",
      "timestamp": "2025-01-15T10:42:00.000Z",
      "retryable": true
    }
  ]
}
```

---

## 四、流水线引擎设计

### 4.1 步骤状态机

```
                    ┌─────────┐
          ┌────────►│ pending │◄──────────── 重跑时上游步骤变更
          │         └────┬────┘
          │              │ start
          │              ▼
          │         ┌─────────┐
          │         │ running │
          │         └────┬────┘
          │              │
          │     ┌────────┼────────┐
          │     │        │        │
          │     ▼        ▼        ▼
          │  ┌──────┐ ┌───────┐ ┌────────┐
          │  │paused│ │completed│ │ failed │
          │  └──┬───┘ └───────┘ └────┬───┘
          │     │ resume             │ retry
          │     └──► running ────────┘
          │
          │  上游步骤重跑时
          └──────────────────────────┘
                    → 变为 stale

特殊状态:
  stale     - 上游步骤被重跑，本步骤输出可能已失效，需重新执行
  skipped   - 用户手动跳过 (如已有手动素材)
```

### 4.2 BaseStep 抽象接口

```typescript
// electron/pipeline/types.ts

type StepId = 'review' | 'rewrite' | 'storyboard' | 'prompt' | 'imagen' | 'tts' | 'capcut';
type StepStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'stale' | 'skipped';
type PipelineStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

interface StepContext {
  projectId: string;
  projectDir: string;
  config: ProjectConfig;
  cancelSignal: AbortSignal;
  pauseSignal: AbortSignal;
  onProgress: (progress: number, message: string) => void;
  onLog: (level: 'info' | 'warn' | 'error', message: string) => void;
}

// 每个步骤必须实现的接口
abstract class BaseStep<I, O> {
  abstract readonly id: StepId;
  abstract readonly name: string;
  abstract readonly description: string;

  // 核心执行方法
  abstract execute(input: I, ctx: StepContext): Promise<O>;

  // 可选: 验证输入是否有效 (决定是否需要执行)
  validateInput?(input: I): boolean;

  // 可选: 从 state.json 恢复 (断点续跑)
  canResume(state: StepState): boolean;

  // 可选: 该步骤被重跑时，哪些下游步骤需要标记为 stale
  getDownstreamSteps(): StepId[];
}
```

### 4.3 PipelineEngine 核心逻辑

```typescript
// electron/pipeline/pipeline-engine.ts (伪代码逻辑)

class PipelineEngine {
  private state: PipelineState;
  private cancelController: AbortController | null;
  private pauseController: AbortController | null;

  // 启动流水线 (可从任意步骤开始)
  async start(fromStep?: StepId): Promise<void> {
    const startId = fromStep ?? this.findFirstPendingStep();
    const steps = STEP_ORDER.from(startId);  // 从指定步骤到末尾

    this.state.pipeline.status = 'running';
    this.emit('stepChanged');

    for (const stepId of steps) {
      if (this.cancelController?.signal.aborted) break;
      if (this.pauseController?.signal.aborted) break;

      const step = registry.get(stepId);
      const input = this.resolveInput(stepId);  // 从 outputs 中取
      const ctx = this.createContext(stepId);

      this.updateStep(stepId, { status: 'running', startedAt: now() });
      this.emit('stepChanged');

      try {
        const output = await step.execute(input, ctx);
        this.state.outputs[stepId] = output;
        this.updateStep(stepId, { status: 'completed', progress: 100, completedAt: now() });
        this.persist();  // 写入 state.json
        this.emit('stepChanged');
      } catch (e) {
        if (e instanceof PauseError) {
          this.updateStep(stepId, { status: 'paused' });
        } else {
          this.updateStep(stepId, { status: 'failed', error: e.message });
          this.state.errors.push({ stepId, message: e.message, ... });
        }
        this.persist();
        this.emit('stepChanged');
        break;
      }
    }

    if (allCompleted) this.state.pipeline.status = 'completed';
    this.persist();
  }

  // 重跑指定步骤 (级联标记下游)
  async rerun(stepId: StepId): Promise<void> {
    const downstream = this.getDownstream(stepId);
    for (const id of downstream) {
      this.updateStep(id, { status: 'stale', progress: 0 });
    }
    this.persist();
    this.emit('stepChanged');
    await this.start(stepId);
  }

  // 暂停
  pause(): void {
    this.pauseController?.abort();
    this.state.pipeline.status = 'paused';
    this.persist();
    this.emit('stepChanged');
  }

  // 恢复
  resume(): void {
    this.start(this.state.pipeline.currentStep);
  }

  // 持久化到磁盘
  private persist(): void {
    this.state.updatedAt = new Date().toISOString();
    projectStore.saveState(this.state);
  }
}
```

### 4.4 重跑级联规则

当用户重跑某一步时，下游所有步骤自动标记为 `stale`:

```
重跑 Step 2 (rewrite)
  → Step 3 (storyboard) = stale   (输入是 rewrite 的 body)
  → Step 4 (prompt) = stale       (输入是 storyboard 的 scenes)
  → Step 5 (imagen) = stale       (输入是 prompt 的 scenes)
  → Step 6 (tts) = stale          (输入是 rewrite 的 body)
  → Step 7 (capcut) = stale       (输入是所有前序)

重跑 Step 5 (imagen)
  → Step 7 (capcut) = stale       (图片变了，工程需要重新打包)
  → Step 6 (tts) 不受影响         (TTS 输入是 body，与图片无关)
```

级联关系定义:

```typescript
const DOWNSTREAM_MAP: Record<StepId, StepId[]> = {
  review:    ['rewrite', 'storyboard', 'prompt', 'imagen', 'tts', 'capcut'],
  rewrite:   ['storyboard', 'prompt', 'imagen', 'tts', 'capcut'],
  storyboard:['prompt', 'imagen', 'capcut'],
  prompt:    ['imagen', 'capcut'],
  imagen:    ['capcut'],
  tts:       ['capcut'],
  capcut:    [],
};
```

---

## 五、各流水线步骤的输入/输出数据格式

### Step 1: 文案预审 (review)

```
输入:
  rawText: string                    // 用户粘贴的原始文案

输出 (ReviewOutput):
  cleanedText: string                // 清理后的文案
  issues: Array<{                    // 发现并处理的问题
    type: 'ad' | 'sensitive' | 'format' | 'contact'
    original: string                 // 原始片段
    replaced: string                 // 替换后的内容 (或空)
    position: number                 // 在原文中的位置
  }>
  originalLength: number             // 原始字数
  cleanedLength: number              // 清理后字数

LLM 调用:
  system prompt: resources/prompts/review.md
  输出格式: JSON object
  重试策略: 最多 3 次, 指数退避
```

### Step 2: 智能改写 (rewrite)

```
输入:
  cleanedText: string                // 来自 Step 1

输出 (RewriteOutput):
  title: string                      // 选定的标题 (从 titleOptions[0])
  titleOptions: string[]             // 3 个备选标题
  body: string                       // 改写后的口播正文 (核心输出)
  tags: string[]                     // 话题标签
  comments: string[]                 // 引导评论话术
  wordCount: number                  // 正文字数

约束:
  body 长度: 800-1500 字 (对应 2-4 分钟视频)
  每句话: 15-25 字 (适合口播节奏)
  开头 3 秒必须有 Hook

LLM 调用:
  system prompt: resources/prompts/rewrite.md
  输出格式: JSON object
```

### Step 3: 影视分镜 (storyboard)

```
输入:
  body: string                       // 来自 Step 2 的改写正文

输出 (StoryboardOutput):
  scenes: Array<{
    id: number                       // 分镜序号 (从 1 开始)
    text: string                     // 该分镜对应的口播文本 (将显示为字幕)
    narration: string                // 旁白文本 (通常 = text, 特殊场景可不同)
    mood: string                     // 情绪标签: 悬疑/温暖/震撼/平静/悲伤/激昂
    durationHint: number             // 建议时长 (秒), 后续 TTS 会校准
  }>

约束:
  每个分镜对应 1-2 句话 (15-30 字)
  分镜数量: 通常 8-20 个
  所有分镜的 text 拼接约等于 body (允许微调)

LLM 调用:
  system prompt: resources/prompts/storyboard.md
  输出格式: JSON object
```

### Step 4: 提示词生成 (prompt)

```
输入:
  scenes: Scene[]                    // 来自 Step 3
  artStyle: string                   // 画风: cinematic_photo / oil_painting /
                                     //   chinese_ink / anime / watercolor ...

输出 (PromptOutput):
  artStyle: string                   // 记录使用的画风
  stylePrefix: string                // 统一风格前缀 (保证全片视觉一致)
  negativePrompt: string             // 统一负面提示词
  baseSeed: number                   // 基础随机种子 (用于风格一致性)
  scenes: Array<{
    id: number
    prompt: string                   // 英文绘图提示词 (已拼入 stylePrefix)
    negativePrompt: string           // 该分镜的负面提示词 (叠加统一负面)
    seed: number                     // 该分镜的种子 (baseSeed + id * 7)
  }>

画风预设:
  cinematic_photo:   "cinematic photography, warm lighting, 35mm, film grain, ..."
  oil_painting:      "oil painting, thick brush strokes, impressionist, ..."
  chinese_ink:       "traditional Chinese ink painting, sumi-e, minimalist, ..."
  anime:             "anime style, cel shading, vibrant colors, ..."

LLM 调用:
  system prompt: resources/prompts/prompt-gen.md
  输出格式: JSON object
```

### Step 5: 批量生图 (imagen)

```
输入:
  scenes: Array<{ id, prompt, negativePrompt, seed }>  // 来自 Step 4
  config.imagen: {
    provider, model, width, height, concurrency, stylePrefix
  }

输出 (ImagenOutput):
  scenes: Array<{
    id: number
    imagePath: string | null         // 本地图片绝对路径 (失败时为 null)
    width: number                    // 实际图片宽度
    height: number                   // 实际图片高度
    engine: string                   // 实际使用的引擎 (可能有降级)
    success: boolean
    error?: string                   // 失败原因
    durationMs: number               // 生成耗时
  }>
  totalRequested: number
  totalSuccess: number
  totalFailed: number

执行策略:
  1. 并发生成 (concurrency 控制并发数, 默认 3)
  2. 失败降级: fal -> siliconflow -> wanx (由 FallbackChain 管理)
  3. 每张完成时调用 ctx.onProgress(current/total, "生成第 X/N 张...")
  4. 支持断点续跑: 已成功的图片跳过, 只重试失败的
  5. 图片保存到: {projectDir}/assets/images/scene_{id:03d}.png

降级逻辑 (FallbackChain):
  try engine A (timeout 60s)
  catch -> try engine B (timeout 60s)
  catch -> try engine C (timeout 60s)
  catch -> mark as failed, continue to next image
```

### Step 6: TTS 配音 (tts)

```
输入:
  body: string                       // 来自 Step 2 (完整口播文本)
  scenes: Scene[]                    // 来自 Step 3 (用于时间戳对齐)
  config.tts: { provider, voice, speed, pitch }

输出 (TTSOutput):
  audioPath: string                  // 完整配音音频路径 (MP3)
  duration: number                   // 音频总时长 (秒)
  srtPath: string                    // SRT 字幕文件路径
  voice: string                      // 使用的音色
  segments: Array<{                  // 按分镜对齐的时间戳
    sceneId: number
    startMs: number                  // 该分镜在音频中的起始时间 (毫秒)
    endMs: number                    // 结束时间 (毫秒)
    text: string                     // 该分镜的文本
    duration: number                 // 该分镜时长 (秒)
  }>

执行策略:
  方案 A (推荐): 整体合成
    1. 将所有 scene.text 按顺序拼接, 分镜间插入短暂停顿 (0.3s)
    2. 调用 TTS API 合成完整音频
    3. 用 ffprobe 获取音频总时长
    4. 按分镜文本在音频中做时间对齐 (按字符比例估算)
    5. 生成 SRT 字幕文件

  方案 B (分镜逐句合成, 适用于不支持长文本的 TTS):
    1. 逐句调用 TTS, 每句生成一个 mp3
    2. 用 ffprobe 获取每句时长
    3. 拼接所有音频片段为完整音频 (ffmpeg concat)
    4. 时间戳 = 累加 (每句的 startMs = 前面所有句的 duration 之和)
    5. 生成 SRT

  SRT 格式:
    1
    00:00:00,000 --> 00:00:04,500
    你知道一个人要经历多少苦难...

    2
    00:00:04,500 --> 00:00:07,500
    余华的《活着》，给了我们一个答案。
```

### Step 7: 剪映打包 (capcut)

```
输入 (所有前序输出的集合):
  scenes: Scene[]                              // 来自 Step 3 (分镜文本)
  promptOutput: PromptOutput                    // 来自 Step 4 (不含图片)
  imagenOutput: ImagenOutput                    // 来自 Step 5 (图片路径)
  ttsOutput: TTSOutput                          // 来自 Step 6 (音频+时间戳)
  config.video: { width, height, fps }
  config.subtitle: { fontSize, color, ... }

输出 (CapcutOutput):
  draftPath: string                  // 生成的草稿文件夹路径
  installedToCapCut: boolean          // 是否已安装到剪映草稿目录
  capCutDraftDir: string | null       // 剪映草稿目录路径 (安装后)
  duration: number                    // 工程总时长 (秒)
  trackCount: number                  // 轨道数 (通常 3)
  segmentCount: number                // 总片段数

执行策略:
  1. 构建 draft_content.json (见第六节)
  2. 构建 draft_meta_info.json
  3. 写入 {projectDir}/assets/drafts/capcut/
  4. 尝试安装到剪映草稿目录 (自动检测路径)
  5. 如果剪映未安装, 仅保留在项目目录, 提示用户手动复制
```

---

## 六、剪映 draft_content.json 关键结构说明

这是整个项目最核心的技术点。剪映桌面版使用 JSON 格式存储工程文件，我们需要完全自行构建这个 JSON。

### 6.1 文件位置

```
剪映草稿根目录 (Windows):
  %LOCALAPPDATA%\JianyingPro\User Data\Projects\com.lveditor.draft\

每个草稿是一个文件夹:
  {草稿根目录}\{draft_name}\
    ├── draft_content.json       <- 核心工程文件 (我们要生成的)
    ├── draft_meta_info.json     <- 元信息 (创建时间、缩略图等)
    └── res/                     <- 资源目录 (通常为空, 媒体文件用绝对路径引用)
```

### 6.2 draft_content.json 顶层结构

```json
{
  "id": "draft-uuid",
  "canvas_config": {
    "width": 1080,
    "height": 1920,
    "ratio": "original"
  },
  "duration": 125500000,
  "fps": 30,
  "version": "3.0.0",
  "platform": "win",
  "tracks": [...],
  "materials": {...},
  "relationships": [...],
  "properties": {
    "is_ai_compose": false,
    "mode": 1
  }
}
```

关键字段说明:
- `duration`: 工程总时长, 单位 **微秒 (us)**, 1 秒 = 1,000,000 us
- `fps`: 帧率, 通常 30
- `canvas_config`: 画布尺寸, 竖版视频 1080x1920
- `tracks`: 轨道数组, 按层级排序 (底层在前)
- `materials`: 所有素材的引用中心, 每个素材有唯一 ID
- `relationships`: 片段与素材的关联关系 (新版本剪映使用)

### 6.3 轨道结构 (tracks)

StoryForge 生成 3 条轨道:

```json
"tracks": [
  {
    "id": "track-video-001",
    "type": "video",
    "flag": 0,
    "sort_id": 0,
    "attribute": 0,
    "segments": [...]
  },
  {
    "id": "track-audio-001",
    "type": "audio",
    "flag": 0,
    "sort_id": 1,
    "attribute": 0,
    "segments": [...]
  },
  {
    "id": "track-text-001",
    "type": "text",
    "flag": 0,
    "sort_id": 2,
    "attribute": 0,
    "segments": [...]
  }
]
```

### 6.4 视频轨片段 (图片)

每个分镜图片是一个 video segment:

```json
{
  "id": "seg-video-001",
  "track_id": "track-video-001",
  "material_id": "mat-image-001",
  "target_timerange": {
    "start": 0,
    "duration": 4500000
  },
  "source_timerange": {
    "start": 0,
    "duration": 4500000
  },
  "render_index": 0,
  "clip": {
    "transform": { "x": 0.0, "y": 0.0 },
    "scale": { "x": 1.0, "y": 1.0 },
    "rotation": 0,
    "alpha": 1.0
  },
  "common_keyframes": []
}
```

关键字段:
- `target_timerange`: 片段在时间轴上的位置 (start + duration, us)
  - start: 该分镜在视频中的起始时间 (累加前面所有分镜的 duration)
  - duration: 该分镜持续时间 (来自 TTS segments 的时间戳)
- `source_timerange`: 从源素材中截取的范围 (图片无时间维度, 通常 = target)
- `material_id`: 引用 materials.images 中的素材 ID
- `clip.transform`: 画面位置偏移 (0,0 = 居中)
- `clip.scale`: 缩放比例 (1.0 = 原始大小, 图片可能需要适配画布比例)

### 6.5 音频轨片段 (配音)

整个配音是一个连续的音频片段:

```json
{
  "id": "seg-audio-001",
  "track_id": "track-audio-001",
  "material_id": "mat-audio-001",
  "target_timerange": {
    "start": 0,
    "duration": 125500000
  },
  "source_timerange": {
    "start": 0,
    "duration": 125500000
  },
  "render_index": 0,
  "clip": {
    "transform": { "x": 0.0, "y": 0.0 },
    "scale": { "x": 1.0, "y": 1.0 }
  },
  "volume": 1.0,
  "common_keyframes": []
}
```

关键点:
- 整个配音是一个 segment (不分镜切分, 因为音频是连续的)
- `duration` = TTS 输出的音频总时长 (us)
- `volume`: 1.0 = 原始音量 (如果有 BGM, 配音设为 1.0, BGM 设为 0.15)

### 6.6 字幕轨片段

每个分镜对应一个字幕 segment, 时间与该分镜的配音对齐:

```json
{
  "id": "seg-text-001",
  "track_id": "track-text-001",
  "material_id": "mat-text-001",
  "target_timerange": {
    "start": 0,
    "duration": 4500000
  },
  "source_timerange": {
    "start": 0,
    "duration": 4500000
  },
  "render_index": 0,
  "clip": {
    "transform": { "x": 0.0, "y": 0.31 },
    "scale": { "x": 1.0, "y": 1.0 }
  },
  "common_keyframes": []
}
```

关键点:
- `target_timerange.start` 和 `duration` 与该分镜的 TTS segment 时间戳一致
- `clip.transform.y`: 字幕垂直位置
  - 0.0 = 画面中心
  - 正值 = 向下移动
  - 0.31 约等于 画面 81% 位置 (字幕通常在底部偏上)
  - 计算公式: `(positionY / height - 0.5) * 0.9`
  - 例如 positionY=1550, height=1920: `(1550/1920 - 0.5) * 0.9 = 0.314`

### 6.7 素材库 (materials)

```json
"materials": {
  "videos": [],
  "audios": [
    {
      "id": "mat-audio-001",
      "type": "extract_music",
      "material_name": "narration.mp3",
      "path": "C:/Users/.../narration.mp3",
      "duration": 125500000,
      "md5": "d41d8cd98f00b204e9800998ecf8427e",
      "music_id": "",
      "source_platform": 0
    }
  ],
  "images": [
    {
      "id": "mat-image-001",
      "type": "photo",
      "material_name": "scene_001.png",
      "path": "C:/Users/.../scene_001.png",
      "width": 1080,
      "height": 1920,
      "duration": 4500000,
      "md5": "d41d8cd98f00b204e9800998ecf8427e",
      "is_open_mirror": false
    }
  ],
  "texts": [
    {
      "id": "mat-text-001",
      "type": "subtitle",
      "text": "你知道一个人要经历多少苦难，才能说出活着这两个字吗？",
      "content": {
        "rich_type": "default",
        "text": "你知道一个人要经历多少苦难，才能说出活着这两个字吗？"
      },
      "text_style": {
        "size": 8.0,
        "bold": true,
        "italic": false,
        "underline": false,
        "color": [1.0, 1.0, 1.0],
        "alignment": 1,
        "background_alpha": 0.0,
        "background_color": [0.0, 0.0, 0.0],
        "font_path": "",
        "font_resource_id": "",
        "font_id": "",
        "font_size": 8.0,
        "use_effect": false
      },
      "text_border": {
        "color": [0.0, 0.0, 0.0],
        "width": 0.08,
        "blur": 0.0
      },
      "text_shadow": {
        "color": [0.0, 0.0, 0.0],
        "opacity": 0.0,
        "angle": -45.0,
        "distance": 0.1,
        "blur": 0.1
      }
    }
  ],
  "stickers": [],
  "effects": [],
  "transitions": [],
  "video_effects": [],
  "sound_channels": []
}
```

### 6.8 时间单位换算

剪映内部所有时间单位为 **微秒 (microsecond, us)**:

| 场景 | 值 |
|------|------|
| 1 秒 | 1,000,000 us |
| 1 分钟 | 60,000,000 us |
| 30 fps 的 1 帧 | 33,333 us |
| 典型 2 分钟视频 | 120,000,000 us |

### 6.9 颜色格式

剪映使用 **归一化 RGB 数组**, 范围 0.0-1.0:

| 颜色 | 值 |
|------|------|
| 白色 | [1.0, 1.0, 1.0] |
| 黑色 | [0.0, 0.0, 0.0] |
| 红色 | [1.0, 0.0, 0.0] |
| 黄色 | [1.0, 1.0, 0.0] |

转换公式: `normalized = hex_value / 255.0`
例如 `#FF8800` -> `[1.0, 0.533, 0.0]`

### 6.10 字幕样式参数映射

| 剪映字段 | 含义 | StoryForge 配置映射 |
|----------|------|---------------------|
| `text_style.size` | 字体大小 (剪映内部单位) | `config.subtitle.fontSize / 5.5` |
| `text_style.color` | 文字颜色 | `hexToNormalized(config.subtitle.color)` |
| `text_style.bold` | 是否加粗 | `config.subtitle.bold` |
| `text_style.alignment` | 对齐方式 | 1 = 居中 (固定) |
| `text_border.color` | 描边颜色 | `hexToNormalized(config.subtitle.strokeColor)` |
| `text_border.width` | 描边宽度 | `config.subtitle.strokeWidth / 44 * 0.08` |
| `clip.transform.y` | 垂直位置 | `(config.subtitle.positionY / 1920 - 0.5) * 0.9` |

### 6.11 draft_meta_info.json

```json
{
  "id": "draft-uuid",
  "draft_name": "StoryForge_活着书单_20250115",
  "draft_id": "draft-uuid",
  "duration": 125500000,
  "create_time": 1737000000,
  "modify_time": 1737000000,
  "cover_url": "",
  "canvas_config": {
    "width": 1080,
    "height": 1920,
    "ratio": "original"
  },
  "version": "3.0.0",
  "platform": "win",
  "fps": 30
}
```

### 6.12 构建流程 (DraftBuilder)

```
DraftBuilder.build(input) 流程:

1. 计算总时长
   totalDuration = ttsOutput.duration (us)

2. 创建素材 (MaterialBuilder)
   images:  为每个 imagen scene 创建 image material
   audios:  为 tts audio 创建 audio material
   texts:   为每个 storyboard scene 创建 text material

3. 创建轨道 (TrackBuilder)
   track-video:  sort_id=0
   track-audio:  sort_id=1
   track-text:   sort_id=2

4. 创建片段 (SegmentBuilder)
   4a. 视频片段: 遍历 scenes, 每个生成一个 segment
       target_timerange.start = 累加前序 scene 的 duration
       target_timerange.duration = scene 对应的 tts segment duration
       material_id = 对应的 image material id

   4b. 音频片段: 一个完整 segment
       target_timerange.start = 0
       target_timerange.duration = totalDuration
       material_id = audio material id

   4c. 字幕片段: 遍历 scenes, 每个生成一个 segment
       target_timerange = 与该 scene 的视频片段一致
       material_id = 对应的 text material id
       clip.transform.y = 字幕位置计算

5. 组装顶层 JSON
   { id, canvas_config, duration, fps, tracks, materials, ... }

6. 写入 draft_content.json + draft_meta_info.json
```

### 6.13 图片适配画布的缩放计算

生成的图片尺寸可能不是 1080x1920, 需要计算缩放:

```
当图片宽高比 不等于 画布宽高比时:
  方案: 等比缩放 + 裁切 (cover 模式)

  scale = max(canvasWidth / imgWidth, canvasHeight / imgHeight)
  scaledWidth = imgWidth * scale
  scaledHeight = imgHeight * scale
  // 居中裁切
  offsetX = (scaledWidth - canvasWidth) / 2
  offsetY = (scaledHeight - canvasHeight) / 2

  在 segment.clip 中设置:
    scale.x = scale
    scale.y = scale
    transform.x = -offsetX / canvasWidth    (归一化)
    transform.y = -offsetY / canvasHeight
```

---

## 七、package.json 依赖配置

### 7.1 完整 package.json

```json
{
  "name": "storyforge",
  "version": "1.0.0",
  "description": "文案到剪映工程的全自动流水线工具",
  "main": "dist-electron/main/index.js",
  "author": "StoryForge",
  "license": "MIT",
  "scripts": {
    "dev": "vite",
    "dev:electron": "concurrently \"vite\" \"wait-on tcp:5173 && tsc -p tsconfig.node.json && electron .\"",
    "build": "tsc -p tsconfig.node.json && vite build",
    "build:electron": "npm run build && electron-builder",
    "build:win": "npm run build && electron-builder --win",
    "build:mac": "npm run build && electron-builder --mac",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.22.0",
    "zustand": "^4.5.0",

    "electron-log": "^5.1.0",
    "electron-store": "^8.2.0",
    "uuid": "^9.0.0",
    "nanoid": "^5.0.0",

    "openai": "^4.40.0",
    "axios": "^1.6.0",

    "fluent-ffmpeg": "^2.1.2",
    "ffprobe-static": "^3.1.0",
    "sharp": "^0.33.0"
  },
  "devDependencies": {
    "electron": "^28.2.0",
    "electron-builder": "^24.9.0",
    "typescript": "^5.3.0",
    "vite": "^5.1.0",
    "vite-plugin-electron": "^0.15.5",
    "vite-plugin-electron-renderer": "^0.14.5",
    "@vitejs/plugin-react": "^4.2.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@types/node": "^20.11.0",
    "@types/uuid": "^9.0.0",
    "@types/fluent-ffmpeg": "^2.1.0",
    "eslint": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "concurrently": "^8.2.0",
    "wait-on": "^7.2.0"
  },
  "build": {
    "appId": "com.storyforge.app",
    "productName": "StoryForge",
    "directories": {
      "output": "build"
    },
    "files": [
      "dist-electron/**/*",
      "dist/**/*",
      "resources/**/*"
    ],
    "extraResources": [
      {
        "from": "resources/prompts",
        "to": "prompts"
      }
    ],
    "win": {
      "target": ["nsis"],
      "icon": "resources/icons/icon.ico"
    },
    "mac": {
      "target": ["dmg"],
      "icon": "resources/icons/icon.png"
    }
  }
}
```

### 7.2 依赖选型理由

| 依赖 | 用途 | 选型理由 |
|------|------|----------|
| **zustand** | 前端状态管理 | 轻量, 无 boilerplate, 原生支持订阅模式, 适合 IPC 事件驱动更新 |
| **electron-log** | 日志 | Electron 生态标准, 自动写入文件 + 控制台 |
| **electron-store** | 全局配置 | 加密存储 API keys, schema 验证 |
| **openai** (npm) | LLM 调用 | 兼容所有 OpenAI 格式 API (DeepSeek/通义/自定义), 内置重试 |
| **axios** | HTTP 请求 | 生图 API / TTS API 调用, 支持超时和拦截器 |
| **fluent-ffmpeg** | 音频处理 | 探测音频时长、拼接音频片段 |
| **ffprobe-static** | ffprobe 二进制 | 随应用打包, 用户无需单独安装 FFmpeg |
| **sharp** | 图片处理 | 读取图片尺寸、格式转换、缩放裁切 |
| **uuid / nanoid** | ID 生成 | 剪映素材/片段需要唯一 ID |
| **vite-plugin-electron** | 构建集成 | Vite + Electron 无缝集成, HMR 支持 |

---

## 八、Provider 适配层设计

### 8.1 LLM Provider

```typescript
// electron/providers/llm/base.ts

interface LLMProvider {
  readonly name: string;

  chat(params: {
    systemPrompt: string;
    userMessage: string;
    jsonMode?: boolean;           // 要求返回 JSON
    temperature?: number;
    maxTokens?: number;
  }): Promise<{
    content: string;              // LLM 返回的文本
    usage: { promptTokens: number; completionTokens: number };
  }>;
}
```

所有 LLM provider 实现统一接口, 通过 OpenAI SDK 适配不同后端:

| Provider | base_url | 模型 | 特点 |
|----------|----------|------|------|
| deepseek | `https://api.deepseek.com` | `deepseek-chat` | 性价比最高, 中文好 |
| qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | 免费额度, 国内直连 |
| openai | `https://api.openai.com/v1` | `gpt-4o-mini` | 质量高但贵 |
| custom | 用户自定义 | 用户自定义 | 兼容 OpenAI 格式即可 |

### 8.2 Imagen Provider + FallbackChain

```typescript
// electron/providers/imagen/base.ts

interface ImagenProvider {
  readonly name: string;

  generate(params: {
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
    seed?: number;
  }): Promise<{
    imageBuffer: Buffer;
    width: number;
    height: number;
  }>;
}
```

FallbackChain 降级管理:

```typescript
// electron/providers/imagen/fallback-chain.ts

class FallbackChain {
  private providers: ImagenProvider[];  // 按优先级排序

  async generate(params): Promise<Result> {
    for (const provider of this.providers) {
      try {
        const result = await withTimeout(
          provider.generate(params),
          60_000  // 60s 超时
        );
        return { ...result, engine: provider.name, success: true };
      } catch (e) {
        logger.warn(`${provider.name} failed: ${e.message}`);
        continue;  // 尝试下一个引擎
      }
    }
    return { success: false, error: 'All engines failed' };
  }
}
```

降级链配置示例:

```json
{
  "imagen": {
    "primary": "fal",
    "fallback": ["siliconflow", "wanx"],
    "concurrency": 3,
    "timeout": 60
  }
}
```

### 8.3 TTS Provider

```typescript
// electron/providers/tts/base.ts

interface TTSProvider {
  readonly name: string;

  synthesize(params: {
    text: string;
    voice: string;
    speed?: number;       // 0.5-2.0, 默认 1.0
    pitch?: number;       // -12 到 12, 默认 0
  }): Promise<{
    audioBuffer: Buffer;
    format: 'mp3' | 'wav';
    duration: number;     // 秒
  }>;

  // 获取可用音色列表
  listVoices(): Array<{ id: string; name: string; gender: string; preview?: string }>;
}
```

---

## 九、关键技术决策记录

### ADR-001: 使用 Electron 而非 Python GUI

**状态**: Accepted

**背景**: 已有 Python 原型 (ai-book-video), 但 GUI (tkinter/PyQt) 体验差, 打包体积大, 跨平台困难。

**决策**: 迁移到 Electron + React + TypeScript。

**后果**:
- 正面: UI 体验飞跃, 跨平台一致, npm 生态丰富, 类型安全
- 负面: 需要将 pyJianYingDraft 的剪映格式逻辑移植到 TypeScript, 内存占用更高
- 负面: 剪映格式生成需要自行实现 (无 pyJianYingDraft 等效 TS 库)

### ADR-002: 剪映工程文件自行构建 JSON 而非使用第三方库

**状态**: Accepted

**背景**: pyJianYingDraft 是 Python 库, Electron 生态无等效 TS 库。

**决策**: 在 `electron/capcut/` 模块中自行实现 draft_content.json 的构建逻辑。

**后果**:
- 正面: 完全可控, 可针对不同剪映版本适配
- 负面: 需要持续跟踪剪映版本更新对格式的影响
- 缓解: 模块化设计, 格式常量集中在 constants.ts, 版本变更时只改一处

### ADR-003: state.json 持久化而非 SQLite

**状态**: Accepted

**背景**: 流水线状态需要持久化以支持断点续跑。

**决策**: 使用 JSON 文件 (state.json) 而非 SQLite。

**后果**:
- 正面: 零依赖, 人类可读, 便于调试, 项目可移植 (整个文件夹拷走即可)
- 负面: 不适合大量项目 (>1000), 并发写入需要加锁
- 缓解: 单用户桌面应用, 项目数量有限, 写入时使用 atomic write (写临时文件 + rename)

### ADR-004: TTS 整体合成而非逐句合成

**状态**: Accepted

**背景**: TTS 可以逐句合成后拼接, 也可以整体合成后做时间对齐。

**决策**: 优先整体合成, 逐句合成作为不支持长文本时的 fallback。

**后果**:
- 正面: 音频更自然 (句间过渡连贯), 减少 API 调用次数
- 负面: 时间对齐需要额外处理 (按字符比例估算)
- 缓解: 按字符比例估算 + 分镜文本匹配校准, 精度足够字幕同步

### ADR-005: ffprobe-static 内嵌而非要求用户安装 FFmpeg

**状态**: Accepted

**背景**: 原型中需要用户自行安装 FFmpeg, 是主要的使用障碍。

**决策**: 使用 ffprobe-static 内嵌 ffprobe 二进制, 音频拼接用 fluent-ffmpeg (自动查找 ffprobe)。

**后果**:
- 正面: 用户零配置, 开箱即用
- 负面: 增加约 80MB 打包体积
- 接受: 相比用户体验提升, 体积代价可接受

---

## 十、错误处理与恢复策略

### 10.1 分层错误处理

```
Layer 1: API 调用层 (providers)
  - 网络超时 -> 指数退避重试 (最多 3 次)
  - 429 限流 -> 等待 Retry-After 头后重试
  - 401 认证失败 -> 不重试, 抛出 ConfigurationError

Layer 2: 步骤层 (steps)
  - API 重试耗尽 -> 标记 step 为 failed, 记录 error
  - 部分失败 (如生图 14/15 成功) -> 标记 step 为 completed with warnings
  - 用户取消 -> 标记 step 为 paused

Layer 3: 引擎层 (pipeline-engine)
  - step failed -> 停止流水线, 等待用户决策
  - 用户可选择: 重试该步 / 跳过该步 / 修改配置后重跑
```

### 10.2 断点续跑场景

```
场景 1: 应用崩溃
  -> 重启应用 -> 打开项目 -> 读取 state.json
  -> currentStep 状态为 running -> 自动改为 paused -> 提示用户是否继续

场景 2: 网络中断 (生图到第 8 张时断网)
  -> Step 5 标记为 paused (或 failed)
  -> 已生成的 7 张图片保留在磁盘
  -> 恢复后只重新生成第 8-15 张 (通过检查 imagePath 是否存在)

场景 3: 用户手动暂停
  -> 当前步骤完成后暂停 (不中断进行中的 API 调用)
  -> 状态保存为 paused
  -> 恢复时从当前步骤重新开始 (上次的 API 调用结果已丢失)
```

### 10.3 原子写入

state.json 写入使用原子操作, 防止写入中途崩溃导致文件损坏:

```typescript
// electron/utils/atomic-write.ts (逻辑)
async function atomicWrite(filePath: string, data: string): Promise<void> {
  const tmpPath = filePath + '.tmp';
  await fs.writeFile(tmpPath, data, 'utf-8');
  await fs.rename(tmpPath, filePath);  // rename 是原子操作
}
```

---

## 十一、前端 UI 状态管理

### 11.1 Zustand Store 设计

```typescript
// src/stores/pipeline-store.ts

interface PipelineStore {
  // 状态
  steps: StepState[];
  pipelineStatus: PipelineStatus;
  currentStepId: StepId | null;
  outputs: Partial<Record<StepId, any>>;
  errors: ErrorEntry[];

  // Actions
  updateStep: (stepId: StepId, patch: Partial<StepState>) => void;
  setPipelineStatus: (status: PipelineStatus) => void;
  setOutputs: (outputs: Partial<Record<StepId, any>>) => void;

  // IPC 订阅 (在 App.tsx 中初始化)
  subscribeToIPC: () => () => void;
}
```

### 11.2 IPC 事件订阅

```typescript
// src/hooks/use-pipeline.ts

function usePipeline() {
  const store = usePipelineStore();

  useEffect(() => {
    // 订阅 Main Process 的事件
    const unsubStepChanged = window.electron.on('pipeline:stepChanged', (step) => {
      store.updateStep(step.id, step);
    });

    const unsubProgress = window.electron.on('pipeline:progress', ({ stepId, progress, message }) => {
      store.updateStep(stepId, { progress, progressMessage: message });
    });

    return () => {
      unsubStepChanged();
      unsubProgress();
    };
  }, []);
}
```

### 11.3 StepCard 组件状态映射

```
StepCard 视觉状态:
  pending   -> 灰色, 折叠, 显示 "等待中"
  running   -> 蓝色脉冲, 展开, 显示进度条 + 实时消息
  paused    -> 黄色, 展开, 显示 "已暂停" + "继续" 按钮
  completed -> 绿色, 折叠, 显示耗时 + "查看结果" + "重跑" 按钮
  failed    -> 红色, 展开, 显示错误信息 + "重试" 按钮
  stale     -> 灰色虚线, 折叠, 显示 "需重新执行"
  skipped   -> 灰色, 折叠, 显示 "已跳过"
```

---

## 十二、安全注意事项

### 12.1 API Key 存储

- API keys 存储在 electron-store 中 (使用 AES-256 加密)
- 永远不通过 IPC 传回 renderer (renderer 只看到 masked 版本: `sk-****...****`)
- 项目级 config.json 中不存储 API key, 只存储 provider 名称和模型参数
- API key 在全局 settings 中配置一次, 所有项目共用

### 12.2 contextBridge 暴露面最小化

```typescript
// electron/preload/index.ts

// 只暴露必要的 IPC 方法, 不暴露 Node.js API
contextBridge.exposeInMainWorld('electron', {
  // Project
  createProject: (data) => ipcRenderer.invoke('project:create', data),
  listProjects: () => ipcRenderer.invoke('project:list'),
  openProject: (id) => ipcRenderer.invoke('project:open', id),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),

  // Pipeline
  startPipeline: (projectId, fromStep?) => ipcRenderer.invoke('pipeline:start', projectId, fromStep),
  pausePipeline: (projectId) => ipcRenderer.invoke('pipeline:pause', projectId),
  resumePipeline: (projectId) => ipcRenderer.invoke('pipeline:resume', projectId),
  rerunStep: (projectId, stepId) => ipcRenderer.invoke('pipeline:rerun', projectId, stepId),

  // Events (返回 unsubscribe 函数)
  on: (channel, callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),

  // System
  selectFolder: () => ipcRenderer.invoke('system:selectFolder'),
  openPath: (path) => ipcRenderer.invoke('system:openPath', path),
});
```

### 12.3 文件路径安全

- 所有文件操作限制在项目目录内 (path traversal 防护)
- 用户输入的文案在写入文件前进行 sanitize
- 图片/音频文件路径在 state.json 中存储绝对路径 (剪映需要绝对路径)

---

## 十三、构建与分发

### 13.1 开发环境

```bash
# 安装依赖
npm install

# 开发模式 (Vite HMR + Electron)
npm run dev:electron

# 类型检查
npm run typecheck

# 构建
npm run build:win    # Windows NSIS installer
npm run build:mac    # macOS DMG
```

### 13.2 打包体积优化

| 组件 | 体积 | 优化策略 |
|------|------|----------|
| Electron runtime | ~85 MB | 不可减, 框架基础 |
| ffprobe binary | ~80 MB | 使用 ffprobe-static 精简版 |
| node_modules | ~50 MB | electron-builder 自动 tree-shake |
| React + app code | ~2 MB | Vite 压缩 |
| 资源文件 | ~1 MB | prompts + icons |
| **总计** | **~220 MB** | 可接受范围 |

### 13.3 自动更新 (未来)

```json
// package.json build 配置
"publish": {
  "provider": "github",
  "owner": "storyforge",
  "repo": "storyforge"
}
```

使用 electron-updater 实现, 首版发布后添加。

---

## 十四、与现有 Python 原型的关系

| 模块 | Python 原型 | StoryForge | 迁移策略 |
|------|-------------|------------|----------|
| LLM 调用 | `llm_client.py` | `providers/llm/` | 直接移植逻辑, 用 openai npm 包 |
| 文案预审 | `text_processor.py` | `steps/review-step.ts` | 移植 prompt, 逻辑用 TS 重写 |
| 文案改写 | `script_generator.py` | `steps/rewrite-step.ts` | 移植 prompt |
| 分镜 | `pipeline.py` Phase 1 | `steps/storyboard-step.ts` | 移植 prompt |
| AI 配图 | `image_generator.py` | `providers/imagen/` + `steps/imagen-step.ts` | 移植适配器逻辑 + 新增降级链 |
| TTS | `audio_generator.py` | `providers/tts/` + `steps/tts-step.ts` | 移植音色配置, 新增时间对齐 |
| 剪映导出 | `jianying_exporter.py` (pyJianYingDraft) | `capcut/` | **完全重写** (自行构建 JSON) |
| 视频合成 | `video_composer.py` (MoviePy) | 不需要 | 剪映负责合成, 我们只出工程文件 |
| 配置 | `config.yaml` | `storage/config-store.ts` | 迁移为 JSON 格式 |
| 状态管理 | 无 (脚本式执行) | `pipeline-engine.ts` + `state.json` | **全新设计** |

核心差异:
1. Python 原型最终输出 MP4 (MoviePy 合成), StoryForge 输出剪映工程文件 (用户在剪映中二次编辑 + 导出)
2. Python 原型无状态管理 (一次性执行), StoryForge 有完整的状态持久化和断点续跑
3. Python 原型无 GUI (命令行/Bat 启动), StoryForge 有完整的 React UI
