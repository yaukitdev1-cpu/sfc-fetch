import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import simpleGit, { SimpleGit, GitError } from 'simple-git';
import * as fs from 'fs-extra';
import * as path from 'path';

@Injectable()
export class GitService {
  private git: SimpleGit;
  private repoUrl: string;
  private branch: string;
  private backupBranch: string;

  constructor(private configService: ConfigService) {
    this.repoUrl = this.configService.get<string>('gitRepoUrl') || '';
    this.branch = this.configService.get<string>('gitBranch') || 'main';
    this.backupBranch = this.configService.get<string>('backupBranch') || 'backup/data';
    this.git = simpleGit();
  }

  private async safeGitOperation<T>(
    operation: () => Promise<T>,
    fallback: T,
    errorContext: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const gitError = error as GitError;
      const message = gitError.message || String(error);
      console.warn(`[GitService] ${errorContext}: ${message}`);
      return fallback;
    }
  }

  async isRepo(): Promise<boolean> {
    return this.safeGitOperation(
      async () => await this.git.checkIsRepo(),
      false,
      'Not a git repository',
    );
  }

  async syncWithRemote(): Promise<boolean> {
    return this.safeGitOperation(async () => {
      await this.git.fetch('origin');
      await this.git.fetch('--all');
      return true;
    }, false, 'Failed to sync with remote');
  }

  async getCurrentBranch(): Promise<string> {
    return this.safeGitOperation(async () => {
      const branch = await this.git.branch();
      return branch.current;
    }, '', 'Failed to get current branch');
  }

  async checkoutOrCreateBranch(branchName: string, createFrom: string = 'origin/main'): Promise<boolean> {
    return this.safeGitOperation(async () => {
      const currentBranch = await this.getCurrentBranch();
      if (currentBranch === branchName) {
        return true;
      }

      const branches = await this.git.branchLocal();
      if (branches.all.includes(branchName)) {
        await this.git.checkout(branchName);
        return true;
      }

      await this.git.checkoutBranch(branchName, createFrom);
      return true;
    }, false, `Failed to checkout/create branch ${branchName}`);
  }

  async checkoutBackupBranch(): Promise<boolean> {
    return this.safeGitOperation(async () => {
      await this.git.fetch('origin', ['--prune']);

      const remoteBranches = (await this.git.branch(['-r'])).all;
      const backupBranchExists = remoteBranches.includes(`origin/${this.backupBranch}`);

      if (backupBranchExists) {
        await this.git.branch([`-t`, this.backupBranch, `origin/${this.backupBranch}`]);
        await this.git.checkout(this.backupBranch);
      } else {
        await this.checkoutOrCreateBranch(this.backupBranch);
      }

      return true;
    }, false, 'Failed to checkout backup branch');
  }

  async checkoutMainBranch(): Promise<boolean> {
    return this.safeGitOperation(async () => {
      const mainBranch = this.configService.get<string>('gitBranch') || 'main';
      const branches = await this.git.branchLocal();

      if (branches.all.includes(mainBranch)) {
        await this.git.checkout(mainBranch);
      } else {
        const remoteBranches = (await this.git.branch(['-r'])).all;
        if (remoteBranches.includes(`origin/${mainBranch}`)) {
          await this.git.checkout(mainBranch);
        } else if (remoteBranches.includes('origin/master')) {
          await this.git.checkout('master');
        } else if (remoteBranches.includes('origin/main')) {
          await this.git.checkout('main');
        }
      }

      return true;
    }, false, 'Failed to checkout main branch');
  }

  async getBackupFiles(): Promise<string[]> {
    return this.safeGitOperation(async () => {
      await this.checkoutBackupBranch();
      const result = await this.git.raw(['ls-files', '-z']);
      if (!result.trim()) {
        return [];
      }
      const files = result.split('\0').filter(f => f && (f.endsWith('.zip') || f.endsWith('.json')));
      return files;
    }, [], 'Failed to get backup files');
  }

  async getLatestBackupInfo(): Promise<{ path: string; commit: string; date: Date } | null> {
    return this.safeGitOperation(async () => {
      const files = await this.getBackupFiles();
      if (files.length === 0) {
        return null;
      }

      const fileInfo: { path: string; commit: string; date: Date }[] = [];
      for (const file of files) {
        try {
          const log = await this.git.log({ file, maxCount: 1 });
          if (log.latest) {
            fileInfo.push({
              path: file,
              commit: log.latest.hash,
              date: new Date(log.latest.date),
            });
          }
        } catch {
          // Skip files without log info
        }
      }

      if (fileInfo.length === 0) {
        return null;
      }

      fileInfo.sort((a, b) => b.date.getTime() - a.date.getTime());
      return fileInfo[0];
    }, null, 'Failed to get latest backup info');
  }

  async stageAndCommit(files: string[], message: string): Promise<string> {
    return this.safeGitOperation(async () => {
      for (const file of files) {
        await this.git.add(file);
      }
      const result = await this.git.commit(message);
      return result.commit;
    }, '', 'Failed to stage and commit');
  }

  async pushCurrentBranch(): Promise<boolean> {
    return this.safeGitOperation(async () => {
      const currentBranch = await this.getCurrentBranch();
      if (currentBranch) {
        const remote = this.configService.get<string>('gitRemote') || 'origin';
        await this.git.push(remote, currentBranch, ['--set-upstream']);
      }
      return true;
    }, false, 'Failed to push branch');
  }

  async downloadBackupFile(remotePath: string, localPath: string): Promise<boolean> {
    return this.safeGitOperation(async () => {
      await this.checkoutBackupBranch();
      const content = await this.git.show([`HEAD:${remotePath}`]);
      await fs.writeFile(localPath, content);
      return true;
    }, false, `Failed to download backup file ${remotePath}`);
  }

  async cleanup(): Promise<void> {
    await this.safeGitOperation(async () => {
      await this.git.raw(['gc', '--prune=now']);
    }, undefined, 'Cleanup failed');
  }

  async getLastCommitHash(): Promise<string> {
    return this.safeGitOperation(async () => {
      const log = await this.git.log({ maxCount: 1 });
      return log.latest?.hash || '';
    }, '', 'Failed to get commit hash');
  }

  async getRepoRoot(): Promise<string> {
    return this.safeGitOperation(async () => {
      return await this.git.revparse(['--show-toplevel']);
    }, process.cwd(), 'Failed to get repo root');
  }
}