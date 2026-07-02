import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import {
  ProjectConfig,
  ProjectState,
  StepState,
  STEP_ORDER,
} from './types';
import { pipelineEngine } from './pipeline-engine';

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function now(): number {
  return Date.now();
}

/** Write data to a temp file then rename -- atomic on most OSes. */
function atomicWriteSync(filePath: string, data: string): void {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, data, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

/** Resolve the root directory that holds all project folders. */
function getProjectsRoot(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'storyforge', 'projects');
  } catch {
    const home = require('os').homedir();
    return path.join(home, '.storyforge', 'projects');
  }
}

// ------------------------------------------------------------
// ProjectManager
// ------------------------------------------------------------

/**
 * Manages project CRUD operations and on-disk directory structure.
 *
 * Each project lives in its own directory:
 *   {projectsRoot}/{uuid}/
 *     state.json
 *     images/
 *     audio/
 */
export class ProjectManager {

  /**
   * Create a new project with the given configuration.
   *
   * 1. Generate a uuid.
   * 2. Create the project directory + subdirectories.
   * 3. Initialize state.json with all steps set to `pending`.
   * 4. Return the new ProjectState.
   */
  createProject(config: ProjectConfig): ProjectState {
    const id = uuidv4();
    const projectDir = this.getProjectDir(id);

    // Create directory tree
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'images'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'audio'), { recursive: true });

    // Build initial step states
    const steps: StepState[] = STEP_ORDER.map(stepId => ({
      id: stepId,
      status: 'pending' as const,
      progress: 0,
      message: '',
    }));

    const timestamp = now();
    const state: ProjectState = {
      id,
      config,
      steps,
      data: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // Persist
    const stateFile = path.join(projectDir, 'state.json');
    const json = JSON.stringify(state, null, 2);
    atomicWriteSync(stateFile, json);

    // Warm the engine cache
    pipelineEngine.cacheState(state);

    return state;
  }

  /**
   * List all projects by scanning the projects root directory.
   *
   * Returns an array of ProjectState objects sorted by updatedAt
   * descending (most recently updated first).
   */
  listProjects(): ProjectState[] {
    const root = getProjectsRoot();
    if (!fs.existsSync(root)) return [];

    const entries = fs.readdirSync(root, { withFileTypes: true });
    const projects: ProjectState[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const stateFile = path.join(root, entry.name, 'state.json');
      if (!fs.existsSync(stateFile)) continue;

      try {
        const raw = fs.readFileSync(stateFile, 'utf-8');
        const state = JSON.parse(raw) as ProjectState;
        projects.push(state);
      } catch {
        // Silently skip corrupted state files
        console.warn(`[ProjectManager] Skipping unreadable project: ${entry.name}`);
      }
    }

    // Sort by updatedAt descending
    projects.sort((a, b) => b.updatedAt - a.updatedAt);
    return projects;
  }

  /**
   * Load a single project's state from disk.
   * Throws if the project does not exist.
   */
  getProject(id: string): ProjectState {
    const stateFile = path.join(this.getProjectDir(id), 'state.json');
    if (!fs.existsSync(stateFile)) {
      throw new Error(`Project "${id}" not found`);
    }

    const raw = fs.readFileSync(stateFile, 'utf-8');
    const state = JSON.parse(raw) as ProjectState;
    return state;
  }

  /**
   * Delete a project and all its files from disk.
   * Also evicts the project from the engine's in-memory cache.
   */
  deleteProject(id: string): void {
    const projectDir = this.getProjectDir(id);
    if (!fs.existsSync(projectDir)) {
      throw new Error(`Project "${id}" not found`);
    }

    // Remove from engine cache first
    pipelineEngine.evictState(id);

    // Recursively remove the project directory
    fs.rmSync(projectDir, { recursive: true, force: true });
  }

  /**
   * Export a project as a zip file.
   * Packs the project directory (state.json, images/, audio/) into a zip.
   * Uses Electron's dialog to let the user choose the save location,
   * then uses PowerShell's Compress-Archive to create the zip.
   * Returns the zip file path, or null if the user cancelled.
   */
  async exportProject(id: string): Promise<string | null> {
    const projectDir = this.getProjectDir(id);
    if (!fs.existsSync(projectDir)) {
      throw new Error(`Project "${id}" not found`);
    }

    const state = this.getProject(id);
    const safeName = (state.config.name || id).replace(/[<>:"/\\|?*]/g, '_');

    const { dialog } = require('electron');
    const os = require('os');

    const result = await dialog.showSaveDialog({
      title: '导出项目',
      defaultPath: path.join(os.homedir(), 'Downloads', `${safeName}.zip`),
      filters: [{ name: 'ZIP 文件', extensions: ['zip'] }],
    });

    if (result.canceled || !result.filePath) return null;

    const zipPath = result.filePath;

    // Remove existing file if present (Compress-Archive requires it)
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }

    // Windows: use PowerShell Compress-Archive
    const escapedSrc = projectDir.replace(/'/g, "''");
    const escapedDest = zipPath.replace(/'/g, "''");
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${escapedSrc}\\*' -DestinationPath '${escapedDest}' -Force"`,
      { timeout: 60000 },
    );

    return zipPath;
  }

  /**
   * Return the absolute path to a project's directory.
   */
  getProjectDir(id: string): string {
    return path.join(getProjectsRoot(), id);
  }
}

/** Singleton project manager shared across the application. */
export const projectManager = new ProjectManager();
