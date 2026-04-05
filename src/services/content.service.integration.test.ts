import { Test, TestingModule } from '@nestjs/testing';
import { ContentService } from './content.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('ContentService Integration Tests', () => {
  let contentService: ContentService;
  let testContentDir: string;

  beforeEach(async () => {
    // Create temporary test content directory
    testContentDir = `./data/test-content-${Date.now()}`;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            contentDir: testContentDir,
            archiveDir: `./data/test-archive-${Date.now()}`
          })
        }
      ]
    }).compile();

    contentService = module.get<ContentService>(ContentService);
  });

  afterEach(async () => {
    // Clean up test directories
    if (testContentDir) {
      await fs.remove(testContentDir);
    }
    const archiveDir = (contentService as any).archiveDir;
    if (archiveDir) {
      await fs.remove(archiveDir);
    }
  });

  test('should throw BadRequestException for invalid category', async () => {
    await expect(contentService.saveMarkdown(
      'invalid-category',
      'TEST-001',
      '# Test Content'
    )).rejects.toThrow(BadRequestException);
  });

  test('should throw BadRequestException for invalid refNo', async () => {
    await expect(contentService.saveMarkdown(
      'circulars',
      'test_001', // Lowercase refNo (invalid per schema)
      '# Test Content'
    )).rejects.toThrow(BadRequestException);
  });

  test('should throw BadRequestException for path traversal in markdown path', async () => {
    await expect(contentService.archiveMarkdown(
      '../invalid-path.md'
    )).rejects.toThrow(BadRequestException);
  });

  test('should successfully save markdown with valid parameters', async () => {
    const result = await contentService.saveMarkdown(
      'circulars',
      'TEST-001',
      '# Valid Test Content',
      { year: 2026 }
    );

    expect(result.markdownPath).toContain('circulars/markdown/2026/TEST-001.md');
    expect(result.markdownSize).toBeGreaterThan(0);
    expect(result.markdownHash).toStartWith('sha256:');
  });

  test('should successfully validate and get markdown with meta', async () => {
    // First save valid markdown
    await contentService.saveMarkdown(
      'guidelines',
      'TEST-002',
      '# Guideline Content',
      { language: 'EN' }
    );

    // Then get it with valid parameters
    const result = await contentService.getMarkdownWithMeta(
      'guidelines',
      'TEST-002',
      { language: 'EN' }
    );

    expect(result).not.toBeNull();
    expect(result?.markdown).toContain('# Guideline Content');
  });
});

// Bun test runner configuration
if (import.meta.vitest) {
  const { describe, test, beforeEach, afterEach, expect } = import.meta.vitest;
  export { describe, test, beforeEach, afterEach, expect };
}