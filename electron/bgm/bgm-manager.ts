// ============================================================
// BGM Library Manager
// Manages a local library of MP3 files stored in userData/bgm
// ============================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';

export interface BGMItem {
  id: string;        // UUID
  name: string;      // display name
  category: string;  // e.g. "轻松", "悲伤", "激昂", "古风", "电子"
  filePath: string;  // absolute path to the copied file
  duration: number;  // estimated duration in seconds
  addedAt: number;   // epoch ms
}

export class BGMManager {
  private bgmDir: string;
  private indexPath: string;
  private items: BGMItem[] = [];

  constructor() {
    this.bgmDir = path.join(app.getPath('userData'), 'bgm');
    this.indexPath = path.join(this.bgmDir, 'index.json');
    this.ensureDir();
    this.load();
  }

  private ensureDir() {
    if (!fs.existsSync(this.bgmDir)) {
      fs.mkdirSync(this.bgmDir, { recursive: true });
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

  /**
   * Add a BGM file to the library.
   * Copies the source file into the bgm directory.
   * Duration is estimated from file size (~128kbps MP3 ≈ 16KB/s).
   */
  async addBGM(filePath: string, name: string, category: string): Promise<BGMItem> {
    const id = crypto.randomUUID();
    const ext = path.extname(filePath);
    const destPath = path.join(this.bgmDir, `${id}${ext}`);
    fs.copyFileSync(filePath, destPath);

    // Estimate duration from file size (128kbps MP3 ≈ 16KB/s)
    const stats = fs.statSync(destPath);
    const duration = Math.round(stats.size / 16000);

    const item: BGMItem = {
      id,
      name,
      category,
      filePath: destPath,
      duration,
      addedAt: Date.now(),
    };
    this.items.push(item);
    this.save();
    return item;
  }

  /** Return all BGM items, sorted by addedAt descending. */
  listBGM(): BGMItem[] {
    return [...this.items].sort((a, b) => b.addedAt - a.addedAt);
  }

  /** Return all unique category names. */
  listCategories(): string[] {
    const set = new Set(this.items.map((i) => i.category));
    return Array.from(set).sort();
  }

  /** Filter BGM items by category. */
  listByCategory(category: string): BGMItem[] {
    return this.items.filter((i) => i.category === category);
  }

  /** Delete a BGM item and its file. Returns true if found and removed. */
  removeBGM(id: string): boolean {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    const item = this.items[idx];
    if (fs.existsSync(item.filePath)) {
      try {
        fs.unlinkSync(item.filePath);
      } catch {
        // File may be locked or already gone; ignore
      }
    }
    this.items.splice(idx, 1);
    this.save();
    return true;
  }

  /** Get a single BGM item by ID. */
  getBGM(id: string): BGMItem | undefined {
    return this.items.find((i) => i.id === id);
  }
}

// Singleton instance
let _instance: BGMManager | null = null;

export function getBGMManager(): BGMManager {
  if (!_instance) {
    _instance = new BGMManager();
  }
  return _instance;
}
