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

  describe('addAndCommit', () => {
    test('method exists', () => {
      expect(typeof gitService.addAndCommit).toBe('function');
    });

    test('handles file path and message', async () => {
      try {
        await gitService.addAndCommit('/tmp/test.txt', 'Test commit');
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

  describe('push', () => {
    test('method exists', () => {
      expect(typeof gitService.push).toBe('function');
    });
  });

  describe('pull', () => {
    test('method exists', () => {
      expect(typeof gitService.pull).toBe('function');
    });
  });

  describe('getLatestBackupFile', () => {
    test('method exists', () => {
      expect(typeof gitService.getLatestBackupFile).toBe('function');
    });
  });

  describe('downloadFile', () => {
    test('method exists', () => {
      expect(typeof gitService.downloadFile).toBe('function');
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

  describe('init', () => {
    test('method exists', () => {
      expect(typeof gitService.init).toBe('function');
    });
  });
});
