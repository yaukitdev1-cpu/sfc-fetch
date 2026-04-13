import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs-extra';
import * as path from 'path';
import { LowdbService } from '../database/lowdb.service';
import { GitService } from './git.service';
import AdmZip from 'adm-zip';

@Injectable()
export class BackupService implements OnModuleInit {
  private dataDir: string;
  private contentDir: string;
  private dbPath: string;
  private autoHydrate: boolean;
  private backupBranch: string;
  private repoRoot: string;

  constructor(
    private configService: ConfigService,
    private db: LowdbService,
    private gitService: GitService,
  ) {
    this.dataDir = this.configService.get<string>('dataDir') || './data';
    this.contentDir = this.configService.get<string>('contentDir') || './data/content';
    this.dbPath = this.configService.get<string>('dbPath') || './data/db/sfc-db.json';
    this.autoHydrate = this.configService.get<boolean>('autoHydrate') ?? true;
    this.backupBranch = this.configService.get<string>('backupBranch') || 'backup/data';
    this.repoRoot = process.cwd();
  }

  async onModuleInit() {
    await this.gitService.checkoutMainBranch();
    await this.ensureDirectories();

    if (this.autoHydrate && !(await this.hasLocalData())) {
      console.log('[BackupService] No local data found, attempting auto-hydration...');
      try {
        await this.hydrate();
        console.log('[BackupService] Auto-hydration complete');
      } catch (error) {
        console.warn('[BackupService] Auto-hydration failed:', (error as Error).message);
      }
    }
  }

  async ensureDirectories() {
    await fs.ensureDir(path.dirname(this.dbPath));
    await fs.ensureDir(this.contentDir);
  }

  async hasLocalData(): Promise<boolean> {
    const dbExists = await fs.pathExists(this.dbPath);
    const contentExists = await fs.pathExists(this.contentDir);

    if (!dbExists && !contentExists) {
      return false;
    }

    if (dbExists) {
      const stats = await fs.stat(this.dbPath);
      return stats.size > 100;
    }

    return contentExists;
  }

  async dehydrate(): Promise<{
    backupId: string;
    filesArchived: number;
    sizeBytes: number;
    compressedSizeBytes: number;
    commitHash: string;
    totalDocuments: number;
  }> {
    const backupId = `data-backup-${Date.now()}.zip`;
    const zipPath = path.join(this.repoRoot, backupId);
    const zip = new AdmZip();

    const filesToBackup: string[] = [];

    if (await fs.pathExists(this.dbPath)) {
      zip.addLocalFile(this.dbPath);
      filesToBackup.push(this.dbPath);
    }

    if (await fs.pathExists(this.contentDir)) {
      zip.addLocalFolder(this.contentDir, 'content');
      filesToBackup.push(this.contentDir);
    }

    zip.writeZip(zipPath);
    filesToBackup.push(zipPath);

    const sizeBytes = await this.getDirectorySize(this.contentDir);
    const compressedSizeBytes = (await fs.stat(zipPath)).size;
    const totalDocuments = this.db.getDocumentCount();

    let commitHash: string = '';
    try {
      await this.gitService.checkoutBackupBranch();
      await this.gitService.stageAndCommit([backupId], `Backup: ${backupId} - ${totalDocuments} docs`);
      commitHash = await this.gitService.getLastCommitHash();
      await this.gitService.pushCurrentBranch();
      await this.gitService.checkoutMainBranch();
    } catch (error) {
      console.warn('[BackupService] Git operations failed:', (error as Error).message);
    } finally {
      // Always clean up local zip, even on error
      if (await fs.pathExists(zipPath)) {
        await fs.remove(zipPath);
      }
    }

    await this.db.saveBackupMetadata(backupId, {
      commitHash,
      documentsCount: totalDocuments,
      sizeBytes,
      compressedSizeBytes,
    });

    return {
      backupId,
      filesArchived: filesToBackup.length,
      sizeBytes,
      compressedSizeBytes,
      commitHash,
      totalDocuments,
    };
  }

  async hydrate(backupPath?: string): Promise<{
    restoredFrom: string;
    collectionsRestored: string[];
    documentsRestored: number;
    contentFilesRestored: number;
  }> {
    let zipPath = path.join(this.repoRoot, 'temp-restore.zip');

    try {
      let backupInfo: { path: string; commit: string; date: Date } | null;

      if (backupPath) {
        backupInfo = { path: backupPath, commit: '', date: new Date() };
      } else {
        backupInfo = await this.gitService.getLatestBackupInfo();
      }

      if (!backupInfo) {
        throw new Error('No backup found in backup branch');
      }

      const success = await this.gitService.downloadBackupFile(backupInfo.path, zipPath);
      if (!success) {
        throw new Error(`Failed to download backup: ${backupInfo.path}`);
      }

      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();

      let documentsRestored = 0;
      const collectionsRestored: string[] = [];

      await fs.ensureDir(this.dataDir);
      await fs.ensureDir(this.contentDir);

      for (const entry of entries) {
        const entryName = entry.entryName;

        if (entryName === 'sfc-db.json' || entryName.startsWith('sfc-db')) {
          await fs.ensureDir(path.dirname(this.dbPath));
          zip.extractEntryTo(entry, path.dirname(this.dbPath), true, true);
          documentsRestored = this.db.getDocumentCount();
          if (!collectionsRestored.includes('database')) {
            collectionsRestored.push('database');
          }
        } else if (entryName.startsWith('content/')) {
          zip.extractEntryTo(entry, this.contentDir, true, true);
          if (!collectionsRestored.includes('content')) {
            collectionsRestored.push('content');
          }
        }
      }

      await fs.remove(zipPath);
      await this.gitService.checkoutMainBranch();

      const contentFilesRestored = await this.countContentFiles();

      return {
        restoredFrom: backupInfo.path,
        collectionsRestored,
        documentsRestored,
        contentFilesRestored,
      };
    } catch (error) {
      if (await fs.pathExists(zipPath)) {
        await fs.remove(zipPath);
      }
      await this.gitService.checkoutMainBranch();
      throw error;
    }
  }

  async getStatus(): Promise<{
    lastBackup: any | null;
    hasLocalData: boolean;
    backupBranch: string;
    isRepo: boolean;
  }> {
    const hasLocalData = await this.hasLocalData();
    const isRepo = await this.gitService.isRepo();

    return {
      lastBackup: this.db.getLastBackup(),
      hasLocalData,
      backupBranch: this.backupBranch,
      isRepo,
    };
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;

    if (!(await fs.pathExists(dirPath))) {
      return 0;
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true }) as any[];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += await this.getDirectorySize(fullPath);
      } else {
        const stats = await fs.stat(fullPath);
        size += stats.size;
      }
    }

    return size;
  }

  private async countContentFiles(): Promise<number> {
    let count = 0;

    if (!(await fs.pathExists(this.contentDir))) {
      return 0;
    }

    const countDir = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true }) as any[];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await countDir(fullPath);
        } else if (entry.name.endsWith('.md')) {
          count++;
        }
      }
    };

    await countDir(this.contentDir);
    return count;
  }
}