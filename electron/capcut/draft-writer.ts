// ============================================================
// DraftWriter — 将 DraftContent 写入剪映草稿目录
// ============================================================

import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { DraftContent, DraftInfo, DraftMetaInfo } from './types';

/** 剪映桌面版可能的草稿根目录（按优先级排列） */
const DRAFT_DIR_CANDIDATES = [
  // CapCut 国际版
  path.join(
    os.homedir(),
    'AppData', 'Local',
    'CapCut', 'User Data', 'Projects', 'com.lveditor.draft'
  ),
  // 剪映专业版（JianyingPro）
  path.join(
    os.homedir(),
    'AppData', 'Local',
    'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft'
  ),
];

export class DraftWriter {
  /**
   * 自动检测并返回第一个存在的剪映草稿根目录。
   * 如果都不存在则返回 CapCut 的默认路径（后续写入时会自动创建）。
   */
  static getCapcutDraftsDir(): string {
    for (const dir of DRAFT_DIR_CANDIDATES) {
      if (fs.existsSync(dir)) {
        return dir;
      }
    }
    // 回退到 CapCut 默认路径
    return DRAFT_DIR_CANDIDATES[0];
  }

  /**
   * 将已构建好的 DraftContent 写入剪映草稿目录。
   *
   * @param draftContent - DraftBuilder.build() 的输出
   * @param title        - 草稿显示名称
   * @param customDraftsDir - 可选，自定义草稿根目录（用于测试或指定路径）
   * @returns 新建草稿文件夹的绝对路径
   */
  async write(
    draftContent: DraftContent,
    title: string,
    customDraftsDir?: string
  ): Promise<string> {
    const draftsRoot = customDraftsDir ?? DraftWriter.getCapcutDraftsDir();

    // 草稿子目录使用 uuid 命名
    const draftId = uuidv4();
    const draftDir = path.join(draftsRoot, draftId);

    // 确保目录存在（含父级）
    fs.mkdirSync(draftDir, { recursive: true });

    const now = Date.now(); // 毫秒时间戳

    // 1. draft_content.json
    const contentPath = path.join(draftDir, 'draft_content.json');
    fs.writeFileSync(contentPath, JSON.stringify(draftContent, null, 2), 'utf-8');

    // 2. draft_info.json
    const draftInfo: DraftInfo = {
      name: title,
      id: draftId,
      create_time: now,
      modify_time: now,
      draft_root_path: draftDir,
    };
    const infoPath = path.join(draftDir, 'draft_info.json');
    fs.writeFileSync(infoPath, JSON.stringify(draftInfo, null, 2), 'utf-8');

    // 3. draft_meta_info.json
    const metaInfo: DraftMetaInfo = {
      draft_id: draftId,
      draft_name: title,
      draft_fold_path: draftDir,
      tm_draft_create: now,
      tm_draft_modified: now,
    };
    const metaPath = path.join(draftDir, 'draft_meta_info.json');
    fs.writeFileSync(metaPath, JSON.stringify(metaInfo, null, 2), 'utf-8');

    return draftDir;
  }
}
