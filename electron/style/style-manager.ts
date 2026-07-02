// ============================================================
// Custom Style Manager
// ============================================================

import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface CustomStyle {
  id: string;
  name: string;           // 用户给画风起的中文名
  description: string;    // 用户的原始描述（如"日本动漫风格，类似新海诚"）
  promptSuffix: string;   // LLM 生成的英文画风后缀
  createdAt: number;
}

export class StyleManager {
  private styleDir: string;
  private indexPath: string;
  private items: CustomStyle[] = [];

  constructor() {
    this.styleDir = path.join(app.getPath('userData'), 'styles');
    this.indexPath = path.join(this.styleDir, 'index.json');
    this.ensureDir();
    this.load();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.styleDir)) {
      fs.mkdirSync(this.styleDir, { recursive: true });
    }
  }

  private load(): void {
    if (fs.existsSync(this.indexPath)) {
      try {
        this.items = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
      } catch {
        this.items = [];
      }
    }
  }

  private save(): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(this.items, null, 2), 'utf-8');
  }

  list(): CustomStyle[] {
    return [...this.items];
  }

  create(style: Omit<CustomStyle, 'id' | 'createdAt'>): CustomStyle {
    const item: CustomStyle = {
      ...style,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    this.items.push(item);
    this.save();
    return item;
  }

  delete(id: string): boolean {
    const idx = this.items.findIndex(i => i.id === id);
    if (idx === -1) return false;
    this.items.splice(idx, 1);
    this.save();
    return true;
  }

  update(id: string, patch: Partial<Pick<CustomStyle, 'name' | 'description' | 'promptSuffix'>>): CustomStyle | null {
    const item = this.items.find(i => i.id === id);
    if (!item) return null;
    if (patch.name !== undefined) item.name = patch.name;
    if (patch.description !== undefined) item.description = patch.description;
    if (patch.promptSuffix !== undefined) item.promptSuffix = patch.promptSuffix;
    this.save();
    return { ...item };
  }

  getById(id: string): CustomStyle | undefined {
    return this.items.find(i => i.id === id);
  }
}

let instance: StyleManager;

export function getStyleManager(): StyleManager {
  if (!instance) instance = new StyleManager();
  return instance;
}
