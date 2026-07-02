import { create } from 'zustand';

// 定义步骤
export const STEP_NAMES: Record<string, string> = {
  review: '文案预审',
  rewrite: '智能改写',
  storyboard: '影视分镜',
  prompt: '提示词生成',
  imagen: '批量生图',
  tts: 'TTS 配音',
  capcut: '剪映打包',
  compose: '视频合成',
};

export const STEP_IDS = Object.keys(STEP_NAMES);

export interface StepState {
  id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'stale' | 'skipped';
  progress: number;
  message: string;
  error?: string;
}

export interface Project {
  id: string;
  config: {
    name: string;
    originalText: string;
    track: string;
    style: string;
    voice: string;
    mode: 'auto' | 'semi';
    aspectRatio: '9:16' | '16:9';
  };
  steps: StepState[];
  data: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

interface AppState {
  // 当前页面
  page: 'create' | 'list' | 'settings' | 'detail' | 'imagelab';
  setPage: (page: AppState['page']) => void;

  // 项目列表
  projects: Project[];
  setProjects: (projects: Project[]) => void;

  // 当前查看的项目
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;

  // 当前项目状态（实时更新）
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  updateStepProgress: (stepId: string, progress: number, message: string, status: string) => void;

  // 加载状态
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  page: 'create',
  setPage: (page) => set({ page }),

  projects: [],
  setProjects: (projects) => set({ projects }),

  currentProjectId: null,
  setCurrentProjectId: (id) => set({ currentProjectId: id }),

  currentProject: null,
  setCurrentProject: (project) => set({ currentProject: project }),
  updateStepProgress: (stepId, progress, message, status) => {
    const current = get().currentProject;
    if (!current) return;
    set({
      currentProject: {
        ...current,
        steps: current.steps.map((s) =>
          s.id === stepId
            ? { ...s, progress, message, status: status as StepState['status'] }
            : s
        ),
      },
    });
  },

  loading: false,
  setLoading: (loading) => set({ loading }),
}));
