import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ContentService } from '../src/services/content.service';

// Mock ConfigService
const mockConfigService = {
  get: (key: string) => {
    const defaults: Record<string, any> = {
      contentDir: './test-data/content',
      archiveDir: './test-data/archive',
    };
    return defaults[key];
  },
};

describe('ContentService', () => {
  let contentService: ContentService;
  const testContentDir = './test-data/content';
  const testArchiveDir = './test-data/archive';

  beforeEach(async () => {
    // Clean up test directories before each test
    await fs.remove(testContentDir);
    await fs.remove(testArchiveDir);

    // Create fresh service instance
    contentService = new ContentService(mockConfigService as any);
  });

  afterEach(async () => {
    // Clean up after tests
    await fs.remove(testContentDir);
    await fs.remove(testArchiveDir);
  });

  describe('getCategoryDir', () => {
    test('returns correct path for circulars', () => {
      const result = contentService.getCategoryDir('circulars');
      expect(result).toContain('circulars');
      expect(result).toContain('markdown');
    });

    test('returns correct path for guidelines', () => {
      const result = contentService.getCategoryDir('guidelines');
      expect(result).toContain('guidelines');
    });

    test('returns correct path for consultations', () => {
      const result = contentService.getCategoryDir('consultations');
      expect(result).toContain('consultations');
    });

    test('returns correct path for news', () => {
      const result = contentService.getCategoryDir('news');
      expect(result).toContain('news');
    });
  });

  describe('saveMarkdown', () => {
    test('saves markdown file for circulars with year', async () => {
      const content = '# Test Circular\n\nTest content';
      const result = await contentService.saveMarkdown('circulars', '26EC01', content, { year: 2026 });

      expect(result.markdownPath).toContain('circulars');
      expect(result.markdownPath).toContain('2026');
      expect(result.markdownPath).toContain('26EC01');
      expect(result.markdownSize).toBeGreaterThan(0);
      expect(result.markdownHash).toMatch(/^sha256:/);
      expect(result.wordCount).toBeGreaterThan(0);
    });

    test('saves markdown file for guidelines with language', async () => {
      const content = '# Test Guideline\n\nTest content';
      const result = await contentService.saveMarkdown('guidelines', 'GL01', content, { language: 'EN' });

      expect(result.markdownPath).toContain('guidelines');
      expect(result.markdownPath).toContain('EN');
    });

    test('saves markdown file with appendix index', async () => {
      const content = '# Appendix A';
      const result = await contentService.saveMarkdown('circulars', '26EC01', content, { year: 2026, appendixIndex: 0 });

      expect(result.markdownPath).toContain('appendix_0');
    });

    test('saves markdown file with conclusion flag', async () => {
      const content = '# Conclusion';
      const result = await contentService.saveMarkdown('circulars', '26EC01', content, { year: 2026, isConclusion: true });

      expect(result.markdownPath).toContain('conclusion');
    });

    test('creates directory structure if not exists', async () => {
      const content = '# Test';
      await contentService.saveMarkdown('circulars', 'TEST01', content, { year: 2026 });

      const dirExists = await fs.pathExists(path.join(testContentDir, 'circulars', 'markdown', '2026'));
      expect(dirExists).toBe(true);
    });

    test('calculates correct word count', async () => {
      const content = 'One two three four five';
      const result = await contentService.saveMarkdown('circulars', 'TEST02', content, { year: 2026 });

      expect(result.wordCount).toBe(5);
    });
  });

  describe('getMarkdown', () => {
    test('returns null for non-existent file', () => {
      const result = contentService.getMarkdown('nonexistent/file.md');
      expect(result).toBeNull();
    });

    test('returns content for existing file', async () => {
      const content = '# Test Content';
      await contentService.saveMarkdown('circulars', 'TEST03', content, { year: 2026 });

      const result = contentService.getMarkdown('circulars/markdown/2026/TEST03.md');
      expect(result).toBe(content);
    });
  });

  describe('getMarkdownWithMeta', () => {
    test('returns null for non-existent file', async () => {
      const result = await contentService.getMarkdownWithMeta('circulars', 'NONEXISTENT', { year: 2026 });
      expect(result).toBeNull();
    });

    test('returns content with metadata for existing file', async () => {
      const content = '# Test\nContent here';
      await contentService.saveMarkdown('circulars', 'TEST04', content, { year: 2026 });

      const result = await contentService.getMarkdownWithMeta('circulars', 'TEST04', { year: 2026 });

      expect(result).not.toBeNull();
      expect(result?.markdown).toBe(content);
      expect(result?.size).toBeGreaterThan(0);
      expect(result?.hash).toMatch(/^sha256:/);
      expect(result?.path).toContain('TEST04');
    });
  });

  describe('archiveMarkdown', () => {
    test('returns null for non-existent file', async () => {
      const result = await contentService.archiveMarkdown('nonexistent/file.md');
      expect(result).toBeNull();
    });

    test('archives existing file', async () => {
      const content = '# Test to Archive';
      await contentService.saveMarkdown('circulars', 'TEST05', content, { year: 2026 });

      const result = await contentService.archiveMarkdown('circulars/markdown/2026/TEST05.md');

      expect(result).not.toBeNull();
      expect(result).toContain('re-runs');
    });
  });

  describe('deleteMarkdown', () => {
    test('returns false for non-existent file', async () => {
      const result = await contentService.deleteMarkdown('nonexistent/file.md');
      expect(result).toBe(false);
    });

    test('deletes existing file', async () => {
      const content = '# Test';
      await contentService.saveMarkdown('circulars', 'TEST06', content, { year: 2026 });

      const result = await contentService.deleteMarkdown('circulars/markdown/2026/TEST06.md');
      expect(result).toBe(true);

      const fileExists = await fs.pathExists(path.join(testContentDir, 'circulars/markdown/2026/TEST06.md'));
      expect(fileExists).toBe(false);
    });
  });

  describe('getStats', () => {
    test('returns zero stats for empty directory', () => {
      const stats = contentService.getStats();
      expect(stats.files).toBe(0);
      expect(stats.size).toBe(0);
    });

    test('returns correct stats with files', async () => {
      await contentService.saveMarkdown('circulars', 'TEST07', 'content 1', { year: 2026 });
      await contentService.saveMarkdown('guidelines', 'TEST08', 'content 2', { language: 'EN' });

      const stats = contentService.getStats();
      expect(stats.files).toBe(2);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('formatBytes', () => {
    test('formats 0 bytes', () => {
      expect(contentService.formatBytes(0)).toBe('0 Bytes');
    });

    test('formats bytes', () => {
      expect(contentService.formatBytes(1024)).toBe('1 KB');
    });

    test('formats megabytes', () => {
      expect(contentService.formatBytes(1048576)).toBe('1 MB');
    });

    test('formats gigabytes', () => {
      expect(contentService.formatBytes(1073741824)).toBe('1 GB');
    });

    test('handles fractional values', () => {
      const result = contentService.formatBytes(1536);
      expect(result).toContain('KB');
    });
  });
});
