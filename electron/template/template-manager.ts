// ============================================================
// Project Template Manager
// Saves and restores complete project configurations as templates.
// Stored in userData/templates/index.json
// ============================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  config: {
    track: string;         // 赛道
    style: string;         // 画风
    voice: string;         // 音色
    mode: 'auto' | 'semi'; // 模式
    aspectRatio: string;   // 画面比例
    bgmId?: string;        // BGM ID
    llmProvider?: string;  // LLM provider
    imagenProvider?: string;
    ttsProvider?: string;
    speed?: number;           // TTS speech speed (0.8-1.5)
    // Custom prompt overrides
    customPrompts?: {
      rewrite?: string;     // rewrite prompt override
      storyboard?: string;  // storyboard prompt override
      imagePrompt?: string; // image prompt override
    };
  };
  createdAt: number;
  updatedAt: number;
}

export class TemplateManager {
  private templatesDir: string;
  private indexPath: string;
  private items: ProjectTemplate[] = [];

  constructor() {
    this.templatesDir = path.join(app.getPath('userData'), 'templates');
    this.indexPath = path.join(this.templatesDir, 'index.json');
    this.ensureDir();
    this.load();
  }

  private ensureDir() {
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
  }

  private load() {
    if (fs.existsSync(this.indexPath)) {
      try {
        const raw = fs.readFileSync(this.indexPath, 'utf-8');
        this.items = JSON.parse(raw);
      } catch {
        this.items = [];
      }
    }
  }

  private save() {
    fs.writeFileSync(this.indexPath, JSON.stringify(this.items, null, 2));
  }

  /** List all templates, sorted by updatedAt descending. */
  list(): ProjectTemplate[] {
    return [...this.items].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Get a single template by ID. */
  getById(id: string): ProjectTemplate | undefined {
    return this.items.find((t) => t.id === id);
  }

  /** Create a new template. */
  create(
    name: string,
    description: string,
    config: ProjectTemplate['config']
  ): ProjectTemplate {
    const now = Date.now();
    const template: ProjectTemplate = {
      id: crypto.randomUUID(),
      name,
      description,
      config,
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(template);
    this.save();
    return template;
  }

  /** Update an existing template. Returns the updated template or undefined. */
  update(
    id: string,
    updates: Partial<Pick<ProjectTemplate, 'name' | 'description' | 'config'>>
  ): ProjectTemplate | undefined {
    const idx = this.items.findIndex((t) => t.id === id);
    if (idx === -1) return undefined;
    const existing = this.items[idx];
    const updated: ProjectTemplate = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };
    this.items[idx] = updated;
    this.save();
    return updated;
  }

  /** Delete a template by ID. Returns true if found and removed. */
  delete(id: string): boolean {
    const idx = this.items.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.items.splice(idx, 1);
    this.save();
    return true;
  }
}

// Singleton instance
let _instance: TemplateManager | null = null;

export function getTemplateManager(): TemplateManager {
  if (!_instance) {
    _instance = new TemplateManager();
  }
  return _instance;
}
