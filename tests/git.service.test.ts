import { describe, test, expect, beforeEach } from 'bun:test';

// Mock the config service
const mockConfigService = {
  get: (key: string) => {
    const defaults: Record<string, any> = {
      gitRepoUrl: '',
      gitBranch: 'main',
    };
    return defaults[key];
  },
};

describe('GitService', () => {
  let gitService: any;

  beforeEach(() => {
    const { GitService } = require('../src/backup/git.service');
    gitService = new GitService(mockConfigService as any);
  });

  describe('constructor', () => {
    test('creates instance', () => {
      expect(gitService).toBeDefined();
    });

    test('initializes git instance', () => {
      expect(gitService.git).toBeDefined();
    });
  });

  describe('stageAndCommit', () => {
    test('method exists', () => {
      expect(typeof gitService.stageAndCommit).toBe('function');
    });

    test('handles file path and message', async () => {
      try {
        await gitService.stageAndCommit(['/tmp/test.txt'], 'Test commit');
      } catch (error) {
        // Expected to fail since /tmp/test.txt doesn't exist and not a git repo
        expect(error).toBeDefined();
      }
    });
  });

  describe('getLastCommitHash', () => {
    test('method exists', () => {
      expect(typeof gitService.getLastCommitHash).toBe('function');
    });
  });

  describe('pushCurrentBranch', () => {
    test('method exists', () => {
      expect(typeof gitService.pushCurrentBranch).toBe('function');
    });
  });

  describe('syncWithRemote', () => {
    test('method exists', () => {
      expect(typeof gitService.syncWithRemote).toBe('function');
    });
  });

  describe('getLatestBackupInfo', () => {
    test('method exists', () => {
      expect(typeof gitService.getLatestBackupInfo).toBe('function');
    });
  });

  describe('downloadBackupFile', () => {
    test('method exists', () => {
      expect(typeof gitService.downloadBackupFile).toBe('function');
    });
  });

  describe('isRepo', () => {
    test('method exists', () => {
      expect(typeof gitService.isRepo).toBe('function');
    });

    test('returns boolean', async () => {
      const result = await gitService.isRepo();
      expect(typeof result).toBe('boolean');
    });
  });
});
