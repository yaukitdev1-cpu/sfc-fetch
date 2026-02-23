import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs-extra';
import * as path from 'path';

@Injectable()
export class GitService {
  private git: SimpleGit;
  private repoUrl: string;
  private branch: string;

  constructor(private configService: ConfigService) {
    this.repoUrl = this.configService.get<string>('gitRepoUrl') || '';
    this.branch = this.configService.get<string>('gitBranch') || 'main';

    if (this.repoUrl) {
      const pat = this.configService.get<string>('gitPat') || '';
      const urlWithAuth = this.repoUrl.replace('https://', `https://${pat}@`);
      this.git = simpleGit();
    } else {
      this.git = simpleGit();
    }
  }

  async addAndCommit(filePath: string, message: string): Promise<void> {
    try {
      await this.git.add(filePath);
      await this.git.commit(message);
    } catch (error) {
      // Check if it's a "nothing to commit" case
      const errorMsg = (error as Error).message || '';
      if (!errorMsg.includes('nothing to commit')) {
        throw error;
      }
    }
  }

  async getLastCommitHash(): Promise<string> {
    const log = await this.git.log({ maxCount: 1 });
    return log.latest?.hash || '';
  }

  async push(): Promise<void> {
    if (this.repoUrl) {
      await this.git.push();
    }
  }

  async pull(): Promise<void> {
    await this.git.pull();
  }

  async getLatestBackupFile(): Promise<{ path: string; date: Date } | null> {
    try {
      await this.git.fetch();

      const result = await this.git.raw(['ls-files', '*.zip']);

      if (!result.trim()) {
        return null;
      }

      const files = result.trim().split('\n').filter((f) => f);

      if (files.length === 0) {
        return null;
      }

      // Get the most recent backup file
      const latestFile = files[files.length - 1];

      return {
        path: latestFile,
        date: new Date(),
      };
    } catch (error) {
      console.error('[Git] Error getting latest backup:', error);
      return null;
    }
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    // For HTTPS git, we need to use a different approach
    // This is a simplified version - in production you'd use git's archive feature
    const workDir = await this.git.revparse(['--show-toplevel']);

    // Try to use git show to get the file
    try {
      const content = await this.git.show([`HEAD:${remotePath}`]);
      await fs.writeFile(localPath, content);
    } catch (error) {
      throw new Error(`Failed to download ${remotePath}: ${(error as Error).message}`);
    }
  }

  async isRepo(): Promise<boolean> {
    try {
      return await this.git.checkIsRepo();
    } catch {
      return false;
    }
  }

  async init(repoUrl?: string): Promise<void> {
    if (repoUrl) {
      const pat = this.configService.get<string>('gitPat') || '';
      const urlWithAuth = repoUrl.replace('https://', `https://${pat}@`);

      await this.git.clone(urlWithAuth, '.');
    }
  }
}
