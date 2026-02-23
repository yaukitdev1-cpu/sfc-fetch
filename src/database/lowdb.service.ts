import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import * as fs from 'fs-extra';
import * as path from 'path';

interface DocumentData {
  circulars: any[];
  guidelines: any[];
  consultations: any[];
  news: any[];
  backupMetadata: any[];
}

@Injectable()
export class LowdbService implements OnModuleInit, OnModuleDestroy {
  private db: Low<DocumentData>;
  private dbPath: string;

  constructor(private configService: ConfigService) {
    this.dbPath = this.configService.get<string>('dbPath') || './data/db/sfc-db.json';
  }

  async onModuleInit() {
    await this.initialize();
  }

  async onModuleDestroy() {
    await this.close();
  }

  private async initialize() {
    const dbDir = path.dirname(this.dbPath);
    await fs.ensureDir(dbDir);

    const defaultData: DocumentData = {
      circulars: [],
      guidelines: [],
      consultations: [],
      news: [],
      backupMetadata: [],
    };

    this.db = new Low<DocumentData>(new JSONFile<DocumentData>(this.dbPath), defaultData);
    await this.db.read();

    console.log(`[DB] Initialized LowDB at ${this.dbPath}`);
  }

  // Get collection by category
  getCollection(category: string): any[] {
    return this.db.data[category as keyof DocumentData] || [];
  }

  // Get document by refNo
  getDocument(refNo: string, category: string): any | null {
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
  async upsertDocument(refNo: string, category: string, document: any): Promise<any> {
    const collection = this.getCollection(category);
    const index = collection.findIndex((doc: any) => doc._id === refNo);

    document._id = refNo;
    document.category = category;
    document.updatedAt = new Date().toISOString();

    if (index >= 0) {
      collection[index] = { ...collection[index], ...document };
    } else {
      document.createdAt = new Date().toISOString();
      collection.push(document);
    }

    await this.db.write();
    return document;
  }

  // Update workflow status
  async updateWorkflowStatus(
    refNo: string,
    category: string,
    status: string,
    currentStep?: string,
  ): Promise<any | null> {
    const doc = this.getDocument(refNo, category);
    if (!doc) return null;

    doc.workflow.status = status;
    if (currentStep) {
      doc.workflow.currentStep = currentStep;
    }
    doc.workflow.updatedAt = new Date().toISOString();

    await this.db.write();
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
    await this.db.write();
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
    await this.db.write();
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

    await this.db.write();
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

    await this.db.write();
    return doc;
  }

  // Save backup metadata
  async saveBackupMetadata(backupId: string, data: any): Promise<void> {
    this.db.data.backupMetadata.push({
      backupId,
      createdAt: new Date().toISOString(),
      ...data,
    });
    await this.db.write();
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
    };
  }

  // Import data
  async importAll(data: Partial<DocumentData>): Promise<void> {
    if (data.circulars) this.db.data.circulars = [...data.circulars];
    if (data.guidelines) this.db.data.guidelines = [...data.guidelines];
    if (data.consultations) this.db.data.consultations = [...data.consultations];
    if (data.news) this.db.data.news = [...data.news];
    await this.db.write();
  }

  // Close database
  async close(): Promise<void> {
    await this.db.write();
    console.log('[DB] Closed');
  }
}
