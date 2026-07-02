interface ImagenTestParams {
  prompt: string;
  style: string;
  width: number;
  height: number;
  engine?: string;
}

interface ImagenTestResult {
  imagePath: string;
  englishPrompt: string;
}

interface ImagenRegenerateParams {
  projectId: string;
  segmentIndex: number;
  newPrompt?: string;
}

interface ImagenRegenerateResult {
  imagePath: string;
  prompt: string;
}

interface ClonedVoiceItem {
  id: string;
  name: string;
  provider: string;
  voiceId: string;
  samplePath: string;
  status: 'pending' | 'ready' | 'failed';
  error?: string;
  createdAt: number;
}

interface StoryForgeAPI {
  project: {
    create: (config: any) => Promise<any>;
    list: () => Promise<any[]>;
    open: (id: string) => Promise<any>;
    delete: (id: string) => Promise<any>;
    getState: (id: string) => Promise<any>;
    uploadReference: (projectId: string) => Promise<string | null>;
    export: (id: string) => Promise<string | null>;
  };
  pipeline: {
    start: (projectId: string) => Promise<{ success: boolean }>;
    pause: (projectId: string) => Promise<{ success: boolean }>;
    resume: (projectId: string) => Promise<{ success: boolean }>;
    rerunStep: (projectId: string, stepId: string) => Promise<{ success: boolean }>;
    updateSegments: (projectId: string, segments: any[]) => Promise<{ success: boolean }>;
    updateData: (projectId: string, patch: Record<string, any>) => Promise<{ success: boolean }>;
    onProgress: (callback: (data: any) => void) => () => void;
    onStepChanged: (callback: (data: any) => void) => () => void;
  };
  imagen: {
    test: (params: ImagenTestParams) => Promise<ImagenTestResult>;
    regenerate: (params: ImagenRegenerateParams) => Promise<ImagenRegenerateResult>;
  };
  settings: {
    get: () => Promise<any>;
    set: (settings: any) => Promise<void>;
  };
  system: {
    selectFolder: () => Promise<string | null>;
    openFolder: (path: string) => Promise<void>;
    openCapcutDrafts: () => Promise<void>;
  };
  bgm: {
    list: () => Promise<BGMItem[]>;
    add: (name: string, category: string) => Promise<BGMItem | null>;
    remove: (id: string) => Promise<{ success: boolean }>;
  };
  template: {
    list: () => Promise<ProjectTemplate[]>;
    create: (data: { name: string; description: string; config: ProjectTemplate['config'] }) => Promise<ProjectTemplate>;
    delete: (id: string) => Promise<{ success: boolean }>;
    apply: (id: string) => Promise<ProjectTemplate | null>;
  };
  style: {
    list: () => Promise<CustomStyleItem[]>;
    create: (params: { name: string; description: string }) => Promise<CustomStyleItem>;
    delete: (id: string) => Promise<{ success: boolean }>;
    update: (params: { id: string; name?: string; description?: string; promptSuffix?: string }) => Promise<CustomStyleItem>;
  };
  queue: {
    add: (projectId: string) => Promise<{ success: boolean; position: number }>;
    remove: (projectId: string) => Promise<{ success: boolean }>;
    list: () => Promise<QueueItem[]>;
    onChanged: (callback: (data: QueueItem[]) => void) => () => void;
  };
  updater: {
    getInfo: () => Promise<UpdaterInfo>;
    check: () => Promise<{ success: boolean }>;
    download: () => Promise<{ success: boolean }>;
    install: () => Promise<{ success: boolean }>;
    onStatus: (callback: (data: UpdaterInfo) => void) => () => void;
  };
  voiceClone: {
    list: () => Promise<ClonedVoiceItem[]>;
    clone: (params: { name: string }) => Promise<ClonedVoiceItem | null>;
    delete: (id: string) => Promise<boolean>;
  };
}

interface BGMItem {
  id: string;
  name: string;
  category: string;
  filePath: string;
  duration: number;
  addedAt: number;
}

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  config: {
    track: string;
    style: string;
    voice: string;
    mode: 'auto' | 'semi';
    aspectRatio: string;
    bgmId?: string;
    llmProvider?: string;
    imagenProvider?: string;
    ttsProvider?: string;
    speed?: number;
    customPrompts?: {
      rewrite?: string;
      storyboard?: string;
      imagePrompt?: string;
    };
  };
  createdAt: number;
  updatedAt: number;
}

interface CustomStyleItem {
  id: string;
  name: string;
  description: string;
  promptSuffix: string;
  createdAt: number;
}

interface QueueItem {
  projectId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  addedAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

interface UpdaterInfo {
  status: UpdaterStatus;
  version?: string;
  releaseNotes?: string;
  progress?: number;
  error?: string;
  currentVersion: string;
}

interface Window {
  storyforge: StoryForgeAPI;
}
