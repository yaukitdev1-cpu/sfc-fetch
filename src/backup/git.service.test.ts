import { Test, TestingModule } from '@nestjs/testing';
import { GitService } from './git.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('GitService Unit Tests', () => {
  let gitService: GitService;
  let testRepoDir: string;

  beforeEach(async () => {
    // Create temporary test repository directory
    testRepoDir = `./data/test-git-repo-${Date.now()}`;
    await fs.ensureDir(testRepoDir);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            gitRepoPath: testRepoDir,
            gitPat: 'test-pat-123'
          })
        },
        Logger
      ]
    }).compile();

    gitService = module.get<GitService>(GitService);
    // Initialize test git repository
    await (gitService as any).initializeRepo();
  });

  afterEach(async () => {
    // Clean up test repository
    if (testRepoDir) {
      await fs.remove(testRepoDir);
    }
  });

  test('should initialize git repository successfully', async () => {
    const isGitRepo = await fs.pathExists(path.join(testRepoDir, '.git'));
    expect(isGitRepo).toBe(true);
  });

  test('should stage and commit files', async () => {
    // Create test file
    const testFile = path.join(testRepoDir, 'test-file.md');
    await fs.writeFile(testFile, '# Test Content');

    // Stage and commit
    const commitHash = await gitService.commitChanges('Add test file', ['test-file.md']);
    expect(commitHash).toMatch(/^[a-f0-9]{7,40}$/);
  });

  test('should throw error for invalid file paths', async () => {
    await expect(gitService.commitChanges('Test commit', ['../invalid-file.md'])).rejects.toThrow();
  });

  test('should get latest commit hash', async () => {
    // Create and commit test file
    const testFile = path.join(testRepoDir, 'test-file.md');
    await fs.writeFile(testFile, '# Test Content');
    await gitService.commitChanges('Add test file', ['test-file.md']);

    const latestHash = await gitService.getLatestCommitHash();
    expect(latestHash).toMatch(/^[a-f0-9]{7,40}$/);
  });
});

// Bun test runner configuration
if (import.meta.vitest) {
  const { describe, test, beforeEach, afterEach, expect } = import.meta.vitest;
  export { describe, test, beforeEach, afterEach, expect };
}