// Content Management Service - Markdown file handling
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

class ContentService {
  constructor() {
    this.contentDir = config.contentDir;
  }

  // Get content directory path for a category
  getCategoryDir(category) {
    return path.join(this.contentDir, category, 'markdown');
  }

  // Save markdown content
  async saveMarkdown(category, refNo, content, options = {}) {
    const { year, language = 'EN', appendixIndex = null, isConclusion = false } = options;

    // Determine subdirectory
    let subDir;
    if (category === 'circulars') {
      subDir = year ? path.join(String(year)) : 'unknown';
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

    // Ensure directory exists
    if (!fs.existsSync(yearDir)) {
      fs.mkdirSync(yearDir, { recursive: true });
    }

    // Build filename
    let fileName = refNo;
    if (appendixIndex !== null) {
      fileName += `_appendix_${appendixIndex}`;
    }
    if (isConclusion) {
      fileName += '_conclusion';
    }
    fileName += '.md';

    const filePath = path.join(yearDir, fileName);

    // Write file
    fs.writeFileSync(filePath, content, 'utf8');

    // Get file stats
    const stats = fs.statSync(filePath);

    // Calculate hash
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // Estimate word count (simple approximation)
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

    return {
      markdownPath: path.relative(this.contentDir, filePath),
      markdownSize: stats.size,
      markdownHash: `sha256:${hash}`,
      wordCount
    };
  }

  // Read markdown content
  getMarkdown(markdownPath) {
    const fullPath = path.join(this.contentDir, markdownPath);

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    return fs.readFileSync(fullPath, 'utf8');
  }

  // Get markdown with metadata
  getMarkdownWithMeta(category, refNo, options = {}) {
    const { year, language = 'EN', appendixIndex = null, isConclusion = false } = options;

    let subDir;
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

    const stats = fs.statSync(path.join(this.contentDir, relativePath));
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    return {
      markdown: content,
      size: stats.size,
      hash: `sha256:${hash}`,
      path: relativePath
    };
  }

  // Archive content for re-run
  archiveMarkdown(markdownPath) {
    const fullPath = path.join(this.contentDir, markdownPath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const archiveDir = path.join(config.archiveDir, 're-runs');
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    const fileName = path.basename(markdownPath);
    const timestamp = Date.now();
    const archivedName = `${fileName.replace('.md', '')}_${timestamp}.md`;
    const archivedPath = path.join(archiveDir, archivedName);

    fs.copyFileSync(fullPath, archivedPath);

    return path.relative(config.archiveDir, archivedPath);
  }

  // Delete markdown file
  deleteMarkdown(markdownPath) {
    const fullPath = path.join(this.contentDir, markdownPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return true;
    }
    return false;
  }

  // Get content statistics
  getStats() {
    const stats = {
      files: 0,
      size: 0,
      byCategory: {}
    };

    const countDir = (dir, category) => {
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

  // Format bytes
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = new ContentService();
