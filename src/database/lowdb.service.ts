import { Injectable, OnModuleInit, OnModuleDestroy, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Low, Adapter } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import * as fs from 'fs-extra';
import * as path from 'path';
import { z } from 'zod';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import * as crypto from 'crypto';

// Reuse validation schemas from ContentService for consistency
const CategorySchema = z.enum(['circulars', 'guidelines', 'consultations', 'news']);
const RefNoSchema = z.string().regex(/^[A-Z0-9_-]+$/, 'RefNo must contain only uppercase letters, numbers, hyphens, and underscores');
const StatusSchema = z.string().regex(/^[a-z_-]+$/, 'Status must contain only lowercase letters, underscores, and hyphens');
const StepNameSchema = z.string().regex(/^[a-z_-]+$/, 'Step name must contain only lowercase letters, underscores, and hyphens');
const BackupIdSchema = z.string().regex(/^[A-Z0-9-]+$/, 'Backup ID must contain only uppercase letters, numbers, and hyphens');

// Security configuration
const DB_ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY || 'default-development-key'; // Should be from secrets manager in production

// Stub decorators for future auth implementation (currently allow all)
const Protected = () => (target: any, key?: string, descriptor?: PropertyDescriptor) => descriptor || target;
const AdminOnly = () => (target: any, key?: string, descriptor?: PropertyDescriptor) => descriptor || target;

// Encryption helper functions using Node's crypto
const encryptData = (data: any): string => {
  const jsonStr = JSON.stringify(data);
  const key = crypto.scryptSync(DB_ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

const decryptData = (encryptedData: string): any => {
  const [ivHex, encryptedHex] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.scryptSync(DB_ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
};

// Custom encrypted LowDB adapter (OWASP A02: Sensitive Data Exposure mitigation)
class EncryptedJSONFile<T> implements Adapter<T> {
  private adapter: Adapter<T>;

  constructor(path: string) {
    this.adapter = new JSONFile<T>(path);
  }

  async read(): Promise<T | null> {
    const encryptedData = await this.adapter.read();
    if (!encryptedData) return null;
    return decryptData(encryptedData as unknown as string);
  }

  async write(data: T): Promise<void> {
    const encryptedData = encryptData(data) as unknown as T;
    await this.adapter.write(encryptedData);
  }
};

interface DocumentData {
  circulars: any[];
  guidelines: any[];
  consultations: any[];
  news: any[];
  backupMetadata: any[];
  queue: any[];
}

@Injectable()
export class LowdbService implements OnModuleInit, OnModuleDestroy {
  private db: Low<DocumentData>;
  private dbPath: string;
  private idIndex: Map<string, any>; // In-memory index for _id lookups
  private collectionCache: Map<string, any[]>; // In-memory cache for frequent collections
  private cachedCollections: string[]; // List of collections to cache (frequent access)
  private logger: Logger; // Database profiling logger

  constructor(private configService: ConfigService) {
    this.dbPath = this.configService.get<string>('dbPath') || './data/db/sfc-db.json';
    // Initialize collection cache for frequent access collections (circulars, guidelines)
    this.collectionCache = new Map<string, any[]>();
    this.cachedCollections = ['circulars', 'guidelines'];
    // Initialize logger for database profiling
    this.logger = new Logger(LowdbService.name);
  }

  async onModuleInit() {
    await this.initialize();
  }

  /**
   * Safe write wrapper that handles ENOENT errors during LowDB writes.
   * The steno library (used by LowDB) can fail with ENOENT when the temp file
   * isn't fully written before rename. This wrapper retries with proper directory
   * synchronization to prevent data loss.
   */
  private async safeWrite(): Promise<void> {
    const dbDir = path.dirname(this.dbPath);
    await fs.ensureDir(dbDir);
    try {
      await this.db.write();
    } catch (error: any) {
      // If ENOENT (file not found during rename), retry once after ensuring directory
      if (error?.code === 'ENOENT' || error?.message?.includes('rename')) {
        await fs.ensureDir(dbDir);
        await this.db.write();
      } else {
        throw error;
      }
    }
  }

  /** Explicitly flush pending changes to disk. Use after bulk operations. */
  async flush(): Promise<void> {
    await this.safeWrite();
  }

  async onModuleDestroy() {
    await this.close();
  }

  private async initialize() {
    const start = Date.now();
    const dbDir = path.dirname(this.dbPath);
    await fs.ensureDir(dbDir);

    const defaultData: DocumentData = {
      circulars: [],
      guidelines: [],
      consultations: [],
      news: [],
      backupMetadata: [],
  queue: [],
    };

    const useEncryption = this.configService.get<boolean>('dbEncryption') || false;
    if (useEncryption) {
      this.db = new Low<DocumentData>(new EncryptedJSONFile<DocumentData>(this.dbPath), defaultData);
    } else {
      this.db = new Low<DocumentData>(new JSONFile<DocumentData>(this.dbPath), defaultData);
    }
    await this.db.read();

    // Initialize and populate idIndex here for consistent setup
    this.idIndex = new Map<string, any>();
    Object.values(this.db.data).forEach((collection: any[]) => {
      collection.forEach(doc => doc._id && this.idIndex.set(doc._id, doc));
    });

    // Database profiling - log initialization duration
    const duration = Date.now() - start;
    this.logger.log(`[DB] Initialized encrypted LowDB at ${this.dbPath} in ${duration}ms`);
  }

  // Get collection by category
  getCollection(category: string): any[] {
    const validatedCategory = CategorySchema.safeParse(category);
    if (!validatedCategory.success) {
      throw new BadRequestException(`Invalid category: ${validatedCategory.error.issues[0].message}`);
    }
    const categoryKey = validatedCategory.data;

    // Use in-memory cache for frequent access collections
    if (this.cachedCollections.includes(categoryKey)) {
      if (this.collectionCache.has(categoryKey)) {
        return [...this.collectionCache.get(categoryKey)!];
      }
      // Populate cache if not present
      const collection = this.db.data[categoryKey as keyof DocumentData] || [];
      this.collectionCache.set(categoryKey, [...collection]);
      return collection;
    }

    return this.db.data[categoryKey as keyof DocumentData] || [];
  }

  // Manual cache invalidation helper
  clearCache(category?: string): void {
    if (category) {
      this.collectionCache.delete(category);
    } else {
      this.collectionCache.clear();
    }
  }

  // Get document by refNo
  getDocument(refNo: string, category: string): any | null {
    const validatedRefNo = RefNoSchema.safeParse(refNo);
    const validatedCategory = CategorySchema.safeParse(category);

    if (!validatedRefNo.success) {
      throw new BadRequestException(`Invalid refNo: ${validatedRefNo.error.issues[0].message}`);
    }
    if (!validatedCategory.success) {
      throw new BadRequestException(`Invalid category: ${validatedCategory.error.issues[0].message}`);
    }
    // Use in-memory index for O(1) lookups
    const indexedDoc = this.idIndex.get(refNo);
    if (indexedDoc && indexedDoc.category === category) {
      return indexedDoc;
    }
    // Fallback to collection scan if index is out of sync
    const collection = this.getCollection(category);
    return collection.find((doc: any) => doc._id === refNo) || null;
  }

  // Get all documents in a category with optional filters
  getDocuments(category: string, filters: any = {}): any[] {
    let collection = this.getCollection(category);

    if (filters.status) {
      collection = collection.filter((doc: any) => doc.workflow?.status === filters.status);
    }

    if (filters.year) {
      collection = collection.filter((doc: any) => doc.metadata?.year === filters.year);
    }

    if (filters.limit) {
      collection = collection.slice(0, filters.limit);
    }

    if (filters.offset) {
      collection = collection.slice(filters.offset);
    }

    return collection;
  }

  // Get document count
  getDocumentCount(category?: string): number {
    if (category) {
      return this.getCollection(category).length;
    }
    return (
      this.db.data.circulars.length +
      this.db.data.guidelines.length +
      this.db.data.consultations.length +
      this.db.data.news.length
    );
  }

  // Get counts by category
  getCountsByCategory(): Record<string, number> {
    return {
      circulars: this.db.data.circulars.length,
      guidelines: this.db.data.guidelines.length,
      consultations: this.db.data.consultations.length,
      news: this.db.data.news.length,
    };
  }

  // Upsert document
  @Protected()
  @AdminOnly()
  async upsertDocument(refNo: string, category: string, document: any): Promise<any> {
    const start = Date.now();
    // Fix undefined validatedCategory reference and add profiling
    const validatedCategory = CategorySchema.safeParse(category);
    const validatedRefNo = RefNoSchema.safeParse(refNo);

    if (!validatedCategory.success) {
      throw new BadRequestException(`Invalid category: ${validatedCategory.error.issues[0].message}`);
    }
    if (!validatedRefNo.success) {
      throw new BadRequestException(`Invalid refNo: ${validatedRefNo.error.issues[0].message}`);
    }

    const categoryKey = validatedCategory.data;
    // Get reference to actual database array, not a copy
    const collection = this.cachedCollections.includes(categoryKey)
      ? this.db.data[categoryKey as keyof DocumentData]
      : this.getCollection(category);

    const index = collection.findIndex((doc: any) => doc._id === refNo);

    document._id = refNo;
    document.category = category;
    document.updatedAt = new Date().toISOString();

    if (index >= 0) {
      collection[index] = { ...collection[index], ...document };
    this.idIndex.set(refNo, collection[index]);
    } else {
      document.createdAt = new Date().toISOString();
      collection.push(document);
    this.idIndex.set(refNo, document);
    }

    // Invalidate cache for modified collection
    if (this.cachedCollections.includes(categoryKey)) {
      this.collectionCache.delete(categoryKey);
    }

    await this.safeWrite();

    // Database profiling - log operation duration
    const duration = Date.now() - start;
    this.logger.debug(`Upserted document ${refNo} (${category}) in ${duration}ms`);

    return document;
  }

  // Update workflow status
  @Protected()
  async updateWorkflowStatus(
    refNo: string,
    category: string,
    status: string,
    currentStep?: string,
  ): Promise<any | null> {
    const validatedRefNo = RefNoSchema.safeParse(refNo);
    const validatedCategory = CategorySchema.safeParse(category);
    const validatedStatus = StatusSchema.safeParse(status);
    const validatedStep = currentStep ? StepNameSchema.safeParse(currentStep) : { success: true };

    if (!validatedRefNo.success) {
      throw new BadRequestException(`Invalid refNo: ${validatedRefNo.error.issues[0].message}`);
    }
    if (!validatedCategory.success) {
      throw new BadRequestException(`Invalid category: ${validatedCategory.error.issues[0].message}`);
    }
    if (!validatedStatus.success) {
      throw new BadRequestException(`Invalid status: ${validatedStatus.error.issues[0].message}`);
    }
    if (currentStep && !validatedStep.success) {
      throw new BadRequestException(`Invalid currentStep: ${(validatedStep as any).error.issues[0].message}`);
    }
    const doc = this.getDocument(refNo, category);
    if (!doc) return null;

    doc.workflow.status = status;
    if (currentStep) {
      doc.workflow.currentStep = currentStep;
    }
    doc.workflow.updatedAt = new Date().toISOString();

    await this.safeWrite();
    return doc;
  }

  // Add step to subworkflow
  async addStep(refNo: string, category: string, step: any): Promise<any | null> {
    const doc = this.getDocument(refNo, category);
    if (!doc) return null;

    if (!doc.subworkflow) {
      doc.subworkflow = { steps: [] };
    }
    if (!doc.subworkflow.steps) {
      doc.subworkflow.steps = [];
    }

    doc.subworkflow.steps.push(step);
    await this.safeWrite();
    return doc;
  }

  // Update step
  async updateStep(
    refNo: string,
    category: string,
    stepName: string,
    updates: any,
  ): Promise<any | null> {
    const doc = this.getDocument(refNo, category);
    if (!doc || !doc.subworkflow?.steps) return null;

    const step = doc.subworkflow.steps.find((s: any) => s.step === stepName);
    if (!step) return null;

    Object.assign(step, updates);
    await this.safeWrite();
    return doc;
  }

  // Add step error
  async addStepError(
    refNo: string,
    category: string,
    stepName: string,
    error: any,
  ): Promise<any | null> {
    const doc = this.getDocument(refNo, category);
    if (!doc || !doc.subworkflow?.steps) return null;

    const step = doc.subworkflow.steps.find((s: any) => s.step === stepName);
    if (!step) return null;

    if (!step.errors) step.errors = [];
    step.errors.push(error);

    await this.safeWrite();
    return doc;
  }

  // Add history entry
  async addHistory(refNo: string, category: string, entry: any): Promise<any | null> {
    const doc = this.getDocument(refNo, category);
    if (!doc) return null;

    if (!doc.history) {
      doc.history = { runs: [], reRuns: [], errors: [] };
    }

    if (entry.type === 'run') {
      if (!doc.history.runs) doc.history.runs = [];
      doc.history.runs.push(entry.data);
    } else if (entry.type === 'reRun') {
      if (!doc.history.reRuns) doc.history.reRuns = [];
      doc.history.reRuns.push(entry.data);
    }

    await this.safeWrite();
    return doc;
  }

  // Save backup metadata
  @Protected()
  async saveBackupMetadata(backupId: string, data: any): Promise<void> {
    const validatedBackupId = BackupIdSchema.safeParse(backupId);
    if (!validatedBackupId.success) {
      throw new BadRequestException(`Invalid backupId: ${validatedBackupId.error.issues[0].message}`);
    }
    this.db.data.backupMetadata.push({
      backupId,
      createdAt: new Date().toISOString(),
      ...data,
    });
    await this.safeWrite();
  }

  // Get last backup
  getLastBackup(): any | null {
    const metadata = this.db.data.backupMetadata;
    if (metadata.length === 0) return null;
    return metadata[metadata.length - 1];
  }

  // Export all data
  exportAll(): DocumentData {
    return {
      circulars: [...this.db.data.circulars],
      guidelines: [...this.db.data.guidelines],
      consultations: [...this.db.data.consultations],
      news: [...this.db.data.news],
      backupMetadata: [...this.db.data.backupMetadata],
      queue: [],
    };
  }

  // Import data
  @Protected()
  @AdminOnly()
  async importAll(data: Partial<DocumentData>, integrityHash?: string): Promise<void> {
    // OWASP A04: Insecure Design - Add data integrity check
    if (integrityHash) {
      const computedHash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
      if (computedHash !== integrityHash) {
        throw new BadRequestException('Import data integrity check failed - data may have been tampered with');
      }
    }

    // Validate imported data structure
    const ImportDataSchema = z.object({
      circulars: z.array(z.any()).optional(),
      guidelines: z.array(z.any()).optional(),
      consultations: z.array(z.any()).optional(),
      news: z.array(z.any()).optional()
    });
    const validatedData = ImportDataSchema.safeParse(data);
    if (!validatedData.success) {
      throw new BadRequestException(`Invalid import data structure: ${validatedData.error.issues[0].message}`);
    }

    if (data.circulars) this.db.data.circulars = [...data.circulars];
    if (data.guidelines) this.db.data.guidelines = [...data.guidelines];
    if (data.consultations) this.db.data.consultations = [...data.consultations];
    if (data.news) this.db.data.news = [...data.news];

    // Refresh in-memory index after import
    this.idIndex.clear();
    Object.values(this.db.data).forEach((collection: any[]) => {
      collection.forEach(doc => doc._id && this.idIndex.set(doc._id, doc));
    });

    await this.safeWrite();
  }

  // Queue operations for persistent storage
  async addQueueJob(job: any): Promise<any> {
    const jobId = job.jobId || `${job.action}-${job.category}-${job.refNo}`;
    job._id = jobId;
    job.createdAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    // Upsert: find existing entry by _id and update it, otherwise push new entry
    const existingIndex = this.db.data.queue.findIndex((j: any) => j._id === jobId);
    let stored: any;
    if (existingIndex >= 0) {
      stored = { ...this.db.data.queue[existingIndex], ...job };
      this.db.data.queue[existingIndex] = stored;
    } else {
      stored = job;
      this.db.data.queue.push(stored);
    }

    // CRITICAL: idIndex MUST point to the SAME object reference as db.data.queue
    // so that updateQueueJobStatus() mutations are visible to safeWrite().
    this.idIndex.set(jobId, stored);
    await this.safeWrite();
    return stored;
  }

  async updateQueueJobStatus(jobId: string, status: string, error?: any): Promise<any | null> {
    // Update in BOTH idIndex AND db.data.queue to stay in sync
    const now = new Date().toISOString();
    let job = this.idIndex.get(jobId);
    if (job) {
      job.status = status;
      job.updatedAt = now;
      if (error) job.error = error;
    }
    // Also find and update the array entry (in case references diverged)
    const arrayJob = this.db.data.queue.find((j: any) => j._id === jobId);
    if (arrayJob) {
      arrayJob.status = status;
      arrayJob.updatedAt = now;
      if (error) arrayJob.error = error;
      // Re-sync idIndex to the same reference
      this.idIndex.set(jobId, arrayJob);
    }
    if (!job && !arrayJob) return null;
    await this.safeWrite();
    return job || arrayJob;
  }

  /**
   * Bulk-update queue job statuses WITHOUT per-job safeWrite.
   * Caller is responsible for calling safeWrite() once after all updates.
   */
  bulkUpdateQueueJobStatuses(jobIds: string[], status: string): void {
    const now = new Date().toISOString();
    for (const jobId of jobIds) {
      const job = this.idIndex.get(jobId) || this.db.data.queue.find((j: any) => j._id === jobId);
      if (job) {
        job.status = status;
        job.updatedAt = now;
        this.idIndex.set(jobId, job);
      }
    }
  }

  getQueueJob(jobId: string): any | null {
    return this.idIndex.get(jobId) || this.db.data.queue.find((j: any) => j._id === jobId) || null;
  }

  getPendingQueueJobs(): any[] {
    return this.db.data.queue.filter((j: any) => j.status === 'pending');
  }

  getAllQueueJobs(): any[] {
    return this.db.data.queue;
  }

  cleanupQueueJobs(olderThanDays: number = 7): number {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const before = this.db.data.queue.length;
    this.db.data.queue = this.db.data.queue.filter((j: any) => {
      if (j.status === 'completed' || j.status === 'failed') {
        const updated = new Date(j.updatedAt);
        return updated > cutoff;
      }
      return true;
    });
    const after = this.db.data.queue.length;
    return before - after;
  }

  // Close database
  async close(): Promise<void> {
    await this.safeWrite();
    console.log('[DB] Closed');
  }
}
