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
  private autoDehydrate: boolean;

  constructor(
    private configService: ConfigService,
    private db: LowdbService,
    private gitService: GitService,
  ) {
    this.dataDir = this.configService.get<string>('dataDir') || './data';
    this.contentDir = this.configService.get<string>('contentDir') || './data/content';
    this.dbPath = this.configService.get<string>('dbPath') || './data/db/sfc-db.json';
    this.autoHydrate = this.configService.get<boolean>('autoHydrate') ?? true;
    this.autoDehydrate = this.configService.get<boolean>('autoDehydrate') ?? true;
  }

  async onModuleInit() {
    await this.ensureDirectories();

    if (this.autoHydrate && !(await this.hasLocalData())) {
      console.log('[SFC-Fetch] No local data found, attempting hydration...');
      try {
        await this.hydrate();
        console.log('[SFC-Fetch] Hydration complete');
      } catch (error) {
        console.error('[SFC-Fetch] Hydration failed:', (error as Error).message);
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
    const backupId = `backup-${Date.now()}`;
    const zipPath = path.join(this.dataDir, `${backupId}.zip`);
    const zip = new AdmZip();

    // Add database file
    if (await fs.pathExists(this.dbPath)) {
      zip.addLocalFile(this.dbPath);
    }

    // Add content directory
    if (await fs.pathExists(this.contentDir)) {
      zip.addLocalFolder(this.contentDir, 'content');
    }

    // Write zip
    await fs.ensureDir(this.dataDir);
    zip.writeZip(zipPath);

    const sizeBytes = await this.getDirectorySize(this.contentDir);
    const compressedSizeBytes = (await fs.stat(zipPath)).size;
    const totalDocuments = this.db.getDocumentCount();

    // Git operations
    let commitHash: string;
    try {
      await this.gitService.addAndCommit(zipPath, `Backup: ${backupId}`);
      commitHash = await this.gitService.getLastCommitHash();
    } catch (error) {
      console.warn('[Backup] Git commit failed:', (error as Error).message);
      commitHash = 'uncommitted';
    }

    // Save backup metadata
    await this.db.saveBackupMetadata(backupId, {
      commitHash,
      documentsCount: totalDocuments,
      sizeBytes,
      compressedSizeBytes,
    });

    // Cleanup old backups
    await this.cleanupOldBackups();

    return {
      backupId,
      filesArchived: 2,
      sizeBytes,
      compressedSizeBytes,
      commitHash,
      totalDocuments,
    };
  }

  async hydrate(backupId?: string): Promise<{
    restoredFrom: string;
    collectionsRestored: string[];
    documentsRestored: number;
    contentFilesRestored: number;
  }> {
    // Get the latest backup from git
    const latestBackup = await this.gitService.getLatestBackupFile();

    if (!latestBackup) {
      throw new Error('No backup found in git repository');
    }

    const tempZip = path.join(this.dataDir, `temp-${Date.now()}.zip`);
    await this.gitService.downloadFile(latestBackup.path, tempZip);

    const zip = new AdmZip(tempZip);
    const entries = zip.getEntries();

    let documentsRestored = 0;
    const collectionsRestored: string[] = [];

    for (const entry of entries) {
      const entryName = entry.entryName;

      if (entryName === 'sfc-db.json' || entryName.startsWith('sfc-db')) {
        // Restore database
        const destPath = this.dbPath;
        await fs.ensureDir(path.dirname(destPath));
        zip.extractEntryTo(entry, path.dirname(destPath), true, true);
        documentsRestored = this.db.getDocumentCount();
        collectionsRestored.push('database');
      } else if (entryName.startsWith('content/')) {
        // Restore content
        const destPath = this.contentDir;
        await fs.ensureDir(destPath);
        zip.extractEntryTo(entry, destPath, true, true);
        if (!collectionsRestored.includes('content')) {
          collectionsRestored.push('content');
        }
      }
    }

    // Cleanup temp file
    await fs.remove(tempZip);

    const contentFilesRestored = await this.countContentFiles();

    return {
      restoredFrom: latestBackup.path,
      collectionsRestored,
      documentsRestored,
      contentFilesRestored,
    };
  }

  getStatus(): {
    lastBackup: any | null;
    hasLocalData: boolean;
  } {
    return {
      lastBackup: this.db.getLastBackup(),
      hasLocalData: false,
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

  private async cleanupOldBackups() {
    const retention = this.configService.get<number>('backupRetention') || 10;
    const backupDir = this.dataDir;

    if (!(await fs.pathExists(backupDir))) {
      return;
    }

    const files = await fs.readdir(backupDir);
    const zipFiles = files
      .filter((f: string) => f.startsWith('backup-') && f.endsWith('.zip'))
      .sort()
      .reverse();

    if (zipFiles.length > retention) {
      const toDelete = zipFiles.slice(retention);
      for (const file of toDelete) {
        await fs.remove(path.join(backupDir, file));
      }
    }
  }
}
