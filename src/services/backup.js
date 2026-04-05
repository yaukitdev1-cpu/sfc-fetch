// Backup Service - Git-backed persistence (dehydrate/hydrate)
const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');
const archiver = require('archiver');
const unzipper = require('unzipper');
const config = require('../config');
const database = require('../database');

class BackupService {
  constructor() {
    this.dataDir = config.dataDir;
    this.backupPattern = 'backup_*.zip';
  }

  // Ensure required directories exist
  ensureDirectories() {
    const dirs = [
      this.dataDir,
      path.join(this.dataDir, 'db'),
      path.join(this.dataDir, 'content'),
      path.join(this.dataDir, 'archive'),
      path.join(config.contentDir, 'circulars', 'markdown'),
      path.join(config.contentDir, 'guidelines', 'markdown'),
      path.join(config.contentDir, 'consultations', 'markdown'),
      path.join(config.contentDir, 'news', 'markdown')
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // Check if local data exists
  hasLocalData() {
    const dbFile = config.dbPath;
    return fs.existsSync(dbFile);
  }

  // Get the backup directory path
  getBackupPath() {
    return path.join(this.dataDir, 'backups');
  }

  // Create a timestamped backup ID
  generateBackupId() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `backup_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  // Create zip archive for dehydration
  async createBackupZip(backupId) {
    const backupPath = this.getBackupPath();
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }

    const zipPath = path.join(backupPath, `${backupId}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        resolve({
          zipPath,
          sizeBytes: fs.statSync(zipPath).size,
          filesArchived: archive.pointer()
        });
      });

      archive.on('error', reject);

      archive.pipe(output);

      // Add database files
      const dbDir = path.join(this.dataDir, 'db');
      if (fs.existsSync(dbDir)) {
        archive.directory(dbDir, 'db');
      }

      // Add content files
      const contentDir = config.contentDir;
      if (fs.existsSync(contentDir)) {
        archive.directory(contentDir, 'content');
      }

      // Add archive files
      const archiveDir = config.archiveDir;
      if (fs.existsSync(archiveDir)) {
        archive.directory(archiveDir, 'archive');
      }

      archive.finalize();
    });
  }

  // Commit backup to git
  async commitToGit(backupId, zipPath, stats) {
    try {
      // Check if this is a git repo
      const isGitRepo = fs.existsSync(path.join(process.cwd(), '.git'));

      if (!isGitRepo) {
        console.log('[Backup] Not a git repository, skipping commit');
        return { committed: false, reason: 'not_git_repo' };
      }

      // Add the zip file
      execSync(`git add "${zipPath}"`, { cwd: process.cwd() });

      // Create commit
      const commitMessage = `Backup: ${backupId} - ${stats.filesArchived} files, ${Math.round(stats.sizeBytes / 1024)}KB`;
      execSync(`git commit -m "${commitMessage}"`, { cwd: process.cwd() });

      // Get commit hash
      const commitHash = execSync('git rev-parse HEAD', { cwd: process.cwd() }).toString().trim();

      // Try to push
      try {
        execSync(`git push ${config.gitRemote} ${config.gitBranch}`, { cwd: process.cwd() });
        console.log('[Backup] Pushed to remote');
      } catch (e) {
        console.log('[Backup] Could not push to remote (may need manual push)');
      }

      return {
        committed: true,
        commitHash,
        commitMessage
      };
    } catch (error) {
      console.error('[Backup] Git commit error:', error.message);
      return { committed: false, error: error.message };
    }
  }

  // Dehydration - create backup and commit
  async dehydrate() {
    console.log('[Backup] Starting dehydration...');
    const backupId = this.generateBackupId();

    // Ensure directories
    this.ensureDirectories();

    // Get document count before backup
    const totalDocs = database.getDocumentCount();

    // Create zip backup
    const { zipPath, sizeBytes, filesArchived } = await this.createBackupZip(backupId);

    // Commit to git
    const gitResult = await this.commitToGit(backupId, zipPath, { filesArchived, sizeBytes });

    // Save backup metadata
    database.saveBackupMetadata(
      backupId,
      gitResult.commitHash || null,
      null,
      totalDocs,
      sizeBytes
    );

    // Cleanup old backups (keep last 10)
    await this.cleanupOldBackups(10);

    console.log(`[Backup] Dehydration complete: ${backupId}`);

    return {
      backupId,
      filesArchived,
      sizeBytes,
      compressedSizeBytes: sizeBytes,
      commitHash: gitResult.commitHash,
      totalDocuments: totalDocs
    };
  }

  // Find latest backup file
  findLatestBackup() {
    const backupPath = this.getBackupPath();
    if (!fs.existsSync(backupPath)) return null;

    const files = fs.readdirSync(backupPath)
      .filter(f => f.startsWith('backup_') && f.endsWith('.zip'))
      .sort()
      .reverse();

    return files.length > 0 ? path.join(backupPath, files[0]) : null;
  }

  // Pull latest from git
  async pullFromGit() {
    try {
      const isGitRepo = fs.existsSync(path.join(process.cwd(), '.git'));
      if (!isGitRepo) {
        return { pulled: false, reason: 'not_git_repo' };
      }

      execSync(`git pull ${config.gitRemote} ${config.gitBranch}`, { cwd: process.cwd() });
      console.log('[Backup] Pulled from remote');
      return { pulled: true };
    } catch (error) {
      console.error('[Backup] Git pull error:', error.message);
      return { pulled: false, error: error.message };
    }
  }

  // Hydration - restore from backup
  async hydrate(backupId = null) {
    console.log('[Backup] Starting hydration...');

    // If no backupId specified, try to pull latest from git
    if (!backupId && config.autoHydrate) {
      await this.pullFromGit();
    }

    // Find backup file
    let backupFile;
    if (backupId) {
      backupFile = path.join(this.getBackupPath(), `${backupId}.zip`);
      if (!fs.existsSync(backupFile)) {
        throw new Error(`Backup not found: ${backupId}`);
      }
    } else {
      backupFile = this.findLatestBackup();
      if (!backupFile) {
        console.log('[Backup] No backup found, starting fresh');
        this.ensureDirectories();
        return {
          restoredFrom: null,
          collectionsRestored: 0,
          documentsRestored: 0,
          contentFilesRestored: 0
        };
      }
    }

    // Ensure directories exist
    this.ensureDirectories();

    // Extract backup
    await this.extractBackup(backupFile);

    // Count restored items
    const counts = database.getCountsByCategory();
    let documentsRestored = 0;
    for (const count of Object.values(counts)) {
      documentsRestored += count;
    }

    // Count content files
    let contentFilesRestored = 0;
    const contentDir = config.contentDir;
    if (fs.existsSync(contentDir)) {
      const countFiles = (dir) => {
        let count = 0;
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            count += countFiles(fullPath);
          } else if (stat.isFile() && (item.endsWith('.md') || item.endsWith('.txt'))) {
            count++;
          }
        }
        return count;
      };
      contentFilesRestored = countFiles(contentDir);
    }

    const backupName = path.basename(backupFile, '.zip');

    console.log(`[Backup] Hydration complete: ${backupName}`);

    return {
      restoredFrom: backupName,
      collectionsRestored: Object.keys(counts).length,
      documentsRestored,
      contentFilesRestored
    };
  }

  // Extract backup zip
  async extractBackup(backupFile) {
    return new Promise((resolve, reject) => {
      fs.createReadStream(backupFile)
        .pipe(unzipper.Parse())
        .on('entry', (entry) => {
          const fileName = entry.path;
          const type = entry.type;
          const destPath = path.join(this.dataDir, fileName);

          if (type === 'Directory') {
            if (!fs.existsSync(destPath)) {
              fs.mkdirSync(destPath, { recursive: true });
            }
            entry.autodrain();
          } else {
            // Ensure directory exists
            const dir = path.dirname(destPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            entry.pipe(fs.createWriteStream(destPath));
          }
        })
        .on('close', resolve)
        .on('error', reject);
    });
  }

  // Cleanup old backups
  async cleanupOldBackups(keepCount = 10) {
    const backupPath = this.getBackupPath();
    if (!fs.existsSync(backupPath)) return;

    const files = fs.readdirSync(backupPath)
      .filter(f => f.startsWith('backup_') && f.endsWith('.zip'))
      .sort()
      .reverse();

    // Remove old backups
    for (let i = keepCount; i < files.length; i++) {
      const file = files[i];
      fs.unlinkSync(path.join(backupPath, file));
      console.log(`[Backup] Removed old backup: ${file}`);
    }
  }

  // Get backup status
  getStatus() {
    const lastBackup = database.getLastBackup();
    const counts = database.getCountsByCategory();

    let totalDocuments = 0;
    for (const count of Object.values(counts)) {
      totalDocuments += count;
    }

    // Calculate storage size
    let totalSize = 0;
    const calculateSize = (dir) => {
      if (!fs.existsSync(dir)) return 0;
      let size = 0;
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          size += calculateSize(fullPath);
        } else {
          size += stat.size;
        }
      }
      return size;
    };

    totalSize = calculateSize(this.dataDir);

    return {
      lastBackup: lastBackup?.created_at || null,
      backupId: lastBackup?.backup_id || null,
      commitHash: lastBackup?.commit_hash || null,
      totalDocuments,
      totalSize,
      totalSizeFormatted: this.formatBytes(totalSize),
      compressionRatio: lastBackup ? 0.3 : null,
      collections: counts
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = new BackupService();
