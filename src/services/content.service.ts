import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class ContentService {
  private contentDir: string;
  private archiveDir: string;

  constructor(private configService: ConfigService) {
    this.contentDir = this.configService.get<string>('contentDir') || './data/content';
    this.archiveDir = this.configService.get<string>('archiveDir') || './data/archive';
  }

  getCategoryDir(category: string): string {
    return path.join(this.contentDir, category, 'markdown');
  }

  async saveMarkdown(
    category: string,
    refNo: string,
    content: string,
    options: {
      year?: number;
      language?: string;
      appendixIndex?: number | null;
      isConclusion?: boolean;
    } = {},
  ): Promise<{
    markdownPath: string;
    markdownSize: number;
    markdownHash: string;
    wordCount: number;
  }> {
    const { year, language = 'EN', appendixIndex = null, isConclusion = false } = options;

    let subDir: string;
    if (category === 'circulars') {
      subDir = year ? String(year) : 'unknown';
    } else if (category === 'guidelines') {
      subDir = language || 'EN';
    } else if (category === 'consultations') {
      subDir = year ? String(year) : 'unknown';
    } else if (category === 'news') {
      subDir = year ? String(year) : 'unknown';
    } else {
      subDir = 'unknown';
    }

    const categoryDir = this.getCategoryDir(category);
    const yearDir = path.join(categoryDir, subDir);

    await fs.ensureDir(yearDir);

    let fileName = refNo;
    if (appendixIndex !== null) {
      fileName += `_appendix_${appendixIndex}`;
    }
    if (isConclusion) {
      fileName += '_conclusion';
    }
    fileName += '.md';

    const filePath = path.join(yearDir, fileName);
    await fs.writeFile(filePath, content, 'utf8');

    const stats = await fs.stat(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;

    return {
      markdownPath: path.relative(this.contentDir, filePath),
      markdownSize: stats.size,
      markdownHash: `sha256:${hash}`,
      wordCount,
    };
  }

  getMarkdown(markdownPath: string): string | null {
    const fullPath = path.join(this.contentDir, markdownPath);

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    return fs.readFileSync(fullPath, 'utf8');
  }

  async getMarkdownWithMeta(
    category: string,
    refNo: string,
    options: {
      year?: number;
      language?: string;
      appendixIndex?: number | null;
      isConclusion?: boolean;
    } = {},
  ): Promise<{
    markdown: string;
    size: number;
    hash: string;
    path: string;
  } | null> {
    const { year, language = 'EN', appendixIndex = null, isConclusion = false } = options;

    let subDir: string;
    if (category === 'circulars') {
      subDir = year ? String(year) : 'unknown';
    } else if (category === 'guidelines') {
      subDir = language || 'EN';
    } else if (category === 'consultations') {
      subDir = year ? String(year) : 'unknown';
    } else if (category === 'news') {
      subDir = year ? String(year) : 'unknown';
    } else {
      subDir = 'unknown';
    }

    let fileName = refNo;
    if (appendixIndex !== null) {
      fileName += `_appendix_${appendixIndex}`;
    }
    if (isConclusion) {
      fileName += '_conclusion';
    }
    fileName += '.md';

    const relativePath = path.join(category, 'markdown', subDir, fileName);
    const content = this.getMarkdown(relativePath);

    if (!content) {
      return null;
    }

    const fullPath = path.join(this.contentDir, relativePath);
    const stats = fs.statSync(fullPath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    return {
      markdown: content,
      size: stats.size,
      hash: `sha256:${hash}`,
      path: relativePath,
    };
  }

  async archiveMarkdown(markdownPath: string): Promise<string | null> {
    const fullPath = path.join(this.contentDir, markdownPath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const archiveDir = path.join(this.archiveDir, 're-runs');
    await fs.ensureDir(archiveDir);

    const fileName = path.basename(markdownPath);
    const timestamp = Date.now();
    const archivedName = `${fileName.replace('.md', '')}_${timestamp}.md`;
    const archivedPath = path.join(archiveDir, archivedName);

    await fs.copy(fullPath, archivedPath);

    return path.relative(this.archiveDir, archivedPath);
  }

  async deleteMarkdown(markdownPath: string): Promise<boolean> {
    const fullPath = path.join(this.contentDir, markdownPath);
    if (fs.existsSync(fullPath)) {
      await fs.remove(fullPath);
      return true;
    }
    return false;
  }

  getStats(): { files: number; size: number; byCategory: Record<string, { files: number; size: number }> } {
    const stats = {
      files: 0,
      size: 0,
      byCategory: {} as Record<string, { files: number; size: number }>,
    };

    const countDir = (dir: string, category: string) => {
      if (!fs.existsSync(dir)) return;

      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          countDir(fullPath, category);
        } else if (item.endsWith('.md') || item.endsWith('.txt')) {
          stats.files++;
          stats.size += stat.size;

          if (!stats.byCategory[category]) {
            stats.byCategory[category] = { files: 0, size: 0 };
          }
          stats.byCategory[category].files++;
          stats.byCategory[category].size += stat.size;
        }
      }
    };

    for (const category of ['circulars', 'guidelines', 'consultations', 'news']) {
      const categoryDir = path.join(this.contentDir, category, 'markdown');
      countDir(categoryDir, category);
    }

    return stats;
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
