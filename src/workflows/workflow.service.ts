import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LowdbService } from '../database/lowdb.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WorkflowService {
  private workflowStates: Record<string, string>;
  private stepStatuses: Record<string, string>;

  constructor(
    private readonly db: LowdbService,
    private readonly configService: ConfigService,
  ) {
    this.workflowStates = this.configService.get<Record<string, string>>('workflowStates') || {
      PENDING: 'PENDING',
      DISCOVERED: 'DISCOVERED',
      DOWNLOADING: 'DOWNLOADING',
      PROCESSING: 'PROCESSING',
      COMPLETED: 'COMPLETED',
      FAILED: 'FAILED',
      RETRYING: 'RETRYING',
      RE_RUNNING: 'RE_RUNNING',
      STALE: 'STALE',
    };

    this.stepStatuses = this.configService.get<Record<string, string>>('stepStatuses') || {
      PENDING: 'PENDING',
      RUNNING: 'RUNNING',
      COMPLETED: 'COMPLETED',
      FAILED: 'FAILED',
      SKIPPED: 'SKIPPED',
    };
  }

  getWorkflowStatus(refNo: string, category: string): any | null {
    const doc = this.db.getDocument(refNo, category);
    if (!doc) return null;
    return doc.workflow;
  }

  getSteps(refNo: string, category: string): any | null {
    const doc = this.db.getDocument(refNo, category);
    if (!doc) return null;
    return doc.subworkflow?.steps || [];
  }

  getHistory(refNo: string, category: string): any | null {
    const doc = this.db.getDocument(refNo, category);
    if (!doc) return null;
    return doc.history;
  }

  async retryDocument(
    refNo: string,
    category: string,
    options: { reason?: string; fromStep?: string } = {},
  ): Promise<any> {
    const doc = this.db.getDocument(refNo, category);
    if (!doc) {
      throw new Error('Document not found');
    }

    const now = new Date().toISOString();
    const reason = options.reason || 'manual_retry';
    const fromStep = options.fromStep || null;

    doc.workflow.status = this.workflowStates.RETRYING;
    doc.workflow.retryCount = (doc.workflow.retryCount || 0) + 1;
    doc.workflow.currentStep = fromStep;

    if (!doc.history.retries) doc.history.retries = [];
    doc.history.retries.push({
      retryId: uuidv4(),
      reason,
      fromStep,
      triggeredAt: now,
    });

    doc.updatedAt = now;
    await this.db.upsertDocument(refNo, category, doc);

    return {
      success: true,
      refNo,
      category,
      retryId: doc.history.retries[doc.history.retries.length - 1].retryId,
      fromStep,
    };
  }

  async reRunDocument(
    refNo: string,
    category: string,
    options: { reason?: string; preservePrevious?: boolean } = {},
  ): Promise<any> {
    const doc = this.db.getDocument(refNo, category);
    if (!doc) {
      throw new Error('Document not found');
    }

    const now = new Date().toISOString();
    const reason = options.reason || 'manual_rerun';
    const preservePrevious = options.preservePrevious !== undefined ? options.preservePrevious : true;
    const reRunId = `rr-${Date.now()}`;

    let archivedPath: string | null = null;
    if (preservePrevious && doc.content?.markdownPath) {
      archivedPath = doc.content.markdownPath.replace('content/', 'archive/');
    }

    doc.workflow.status = this.workflowStates.RE_RUNNING;
    doc.workflow.reRunCount = (doc.workflow.reRunCount || 0) + 1;
    doc.workflow.currentStep = null;
    doc.workflow.startedAt = now;
    doc.workflow.completedAt = null;

    if (!doc.history.reRuns) doc.history.reRuns = [];
    doc.history.reRuns.push({
      reRunId,
      reason,
      triggeredAt: now,
      previousMarkdownPath: archivedPath,
    });

    doc.content = {};
    doc.updatedAt = now;
    await this.db.upsertDocument(refNo, category, doc);

    return {
      success: true,
      refNo,
      category,
      reRunId,
      archivedPath,
    };
  }

  async startWorkflow(refNo: string, category: string, reason: string = 'initial_download'): Promise<any> {
    const now = new Date().toISOString();

    const doc = this.db.getDocument(refNo, category);
    if (!doc) {
      throw new Error('Document not found');
    }

    doc.workflow.status = this.workflowStates.DISCOVERED;
    doc.workflow.startedAt = now;
    doc.workflow.currentStep = null;
    doc.workflow.completedAt = null;
    doc.workflow.durationSeconds = 0;

    if (!doc.history.runs) doc.history.runs = [];
    doc.history.runs.push({
      runId: uuidv4(),
      reason,
      startedAt: now,
      status: this.workflowStates.DISCOVERED,
    });

    doc.updatedAt = now;
    await this.db.upsertDocument(refNo, category, doc);

    return doc;
  }

  async startStep(refNo: string, category: string, stepName: string): Promise<any> {
    const now = new Date().toISOString();

    const doc = this.db.getDocument(refNo, category);
    if (!doc) {
      throw new Error('Document not found');
    }

    doc.workflow.currentStep = stepName;

    const existingStep = doc.subworkflow?.steps?.find((s: any) => s.step === stepName);
    if (!existingStep) {
      if (!doc.subworkflow) doc.subworkflow = { steps: [] };
      if (!doc.subworkflow.steps) doc.subworkflow.steps = [];
      doc.subworkflow.steps.push({
        step: stepName,
        status: this.stepStatuses.RUNNING,
        startedAt: now,
        attempts: 1,
      });
    } else {
      existingStep.status = this.stepStatuses.RUNNING;
      existingStep.startedAt = now;
      existingStep.attempts = (existingStep.attempts || 0) + 1;
    }

    doc.updatedAt = now;
    await this.db.upsertDocument(refNo, category, doc);

    return doc;
  }

  async completeStep(
    refNo: string,
    category: string,
    stepName: string,
    metadata: Record<string, any> = {},
  ): Promise<any> {
    const now = new Date().toISOString();

    const doc = this.db.getDocument(refNo, category);
    if (!doc) {
      throw new Error('Document not found');
    }

    const step = doc.subworkflow?.steps?.find((s: any) => s.step === stepName);
    if (step) {
      step.status = this.stepStatuses.COMPLETED;
      step.completedAt = now;
      step.durationMs = new Date(step.startedAt).getTime() - new Date(now).getTime();
      Object.assign(step, metadata);
    }

    doc.updatedAt = now;
    await this.db.upsertDocument(refNo, category, doc);

    return doc;
  }

  async failStep(refNo: string, category: string, stepName: string, error: any): Promise<any> {
    const now = new Date().toISOString();

    const doc = this.db.getDocument(refNo, category);
    if (!doc) {
      throw new Error('Document not found');
    }

    const step = doc.subworkflow?.steps?.find((s: any) => s.step === stepName);
    if (step) {
      step.status = this.stepStatuses.FAILED;
      step.completedAt = now;

      if (!step.errors) step.errors = [];
      step.errors.push({
        attempt: step.attempts,
        timestamp: now,
        errorType: error.type || 'UNKNOWN',
        message: error.message || String(error),
      });
    }

    doc.workflow.status = this.workflowStates.FAILED;
    doc.updatedAt = now;
    await this.db.upsertDocument(refNo, category, doc);

    return doc;
  }

  async completeWorkflow(refNo: string, category: string): Promise<any> {
    const now = new Date().toISOString();

    const doc = this.db.getDocument(refNo, category);
    if (!doc) {
      throw new Error('Document not found');
    }

    doc.workflow.status = this.workflowStates.COMPLETED;
    doc.workflow.completedAt = now;
    doc.workflow.durationSeconds = Math.floor(
      (new Date(now).getTime() - new Date(doc.workflow.startedAt).getTime()) / 1000,
    );

    if (doc.history.runs && doc.history.runs.length > 0) {
      const lastRun = doc.history.runs[doc.history.runs.length - 1];
      lastRun.completedAt = now;
      lastRun.status = this.workflowStates.COMPLETED;
    }

    doc.updatedAt = now;
    await this.db.upsertDocument(refNo, category, doc);

    return doc;
  }
}
