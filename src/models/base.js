// Base Document Model
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

class BaseDocument {
  constructor(refNo, category) {
    this._id = refNo;
    this.category = category;
    this.metadata = {};
    this.source = {};
    this.content = {};
    this.workflow = {
      status: config.workflowStates.PENDING,
      currentStep: null,
      startedAt: null,
      completedAt: null,
      durationSeconds: 0,
      retryCount: 0,
      reRunCount: 0
    };
    this.subworkflow = {
      steps: []
    };
    this.history = {
      runs: [],
      reRuns: [],
      errors: []
    };
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  // Start a new workflow run
  startWorkflow(reason = 'initial_download') {
    const now = new Date().toISOString();
    this.workflow.status = config.workflowStates.DISCOVERED;
    this.workflow.startedAt = now;
    this.workflow.currentStep = null;
    this.workflow.completedAt = null;
    this.workflow.durationSeconds = 0;

    // Add to history
    this.history.runs.push({
      runId: uuidv4(),
      reason,
      startedAt: now,
      status: config.workflowStates.DISCOVERED
    });

    this.updatedAt = now;
    return this;
  }

  // Start a step
  startStep(stepName) {
    const now = new Date().toISOString();
    this.workflow.currentStep = stepName;

    const existingStep = this.subworkflow.steps.find(s => s.step === stepName);
    if (!existingStep) {
      this.subworkflow.steps.push({
        step: stepName,
        status: config.stepStatuses.RUNNING,
        startedAt: now,
        attempts: 1
      });
    } else {
      existingStep.status = config.stepStatuses.RUNNING;
      existingStep.startedAt = now;
      existingStep.attempts = (existingStep.attempts || 0) + 1;
    }

    this.updatedAt = now;
    return this;
  }

  // Complete a step
  completeStep(stepName, metadata = {}) {
    const now = new Date().toISOString();
    const step = this.subworkflow.steps.find(s => s.step === stepName);

    if (step) {
      step.status = config.stepStatuses.COMPLETED;
      step.completedAt = now;
      step.durationMs = new Date(step.startedAt).getTime() - new Date(now).getTime();
      Object.assign(step, metadata);
    }

    this.updatedAt = now;
    return this;
  }

  // Fail a step
  failStep(stepName, error) {
    const now = new Date().toISOString();
    const step = this.subworkflow.steps.find(s => s.step === stepName);

    if (step) {
      step.status = config.stepStatuses.FAILED;
      step.completedAt = now;

      if (!step.errors) step.errors = [];
      step.errors.push({
        attempt: step.attempts,
        timestamp: now,
        errorType: error.type || 'UNKNOWN',
        message: error.message || String(error)
      });
    }

    this.workflow.status = config.workflowStates.FAILED;
    this.updatedAt = now;
    return this;
  }

  // Mark workflow complete
  completeWorkflow() {
    const now = new Date().toISOString();
    this.workflow.status = config.workflowStates.COMPLETED;
    this.workflow.completedAt = now;
    this.workflow.durationSeconds = Math.floor(
      (new Date(now).getTime() - new Date(this.workflow.startedAt).getTime()) / 1000
    );

    // Update history
    if (this.history.runs.length > 0) {
      const lastRun = this.history.runs[this.history.runs.length - 1];
      lastRun.completedAt = now;
      lastRun.status = config.workflowStates.COMPLETED;
    }

    this.updatedAt = now;
    return this;
  }

  // Set content
  setContent(markdownPath, markdownSize, wordCount = 0) {
    const now = new Date().toISOString();
    this.content = {
      markdownPath,
      markdownSize,
      wordCount,
      lastConverted: now
    };
    this.updatedAt = now;
    return this;
  }

  // Retry workflow
  retry(reason, fromStep) {
    const now = new Date().toISOString();
    this.workflow.status = config.workflowStates.RETRYING;
    this.workflow.retryCount = (this.workflow.retryCount || 0) + 1;
    this.workflow.currentStep = fromStep;

    // Add retry entry
    if (!this.history.retries) this.history.retries = [];
    this.history.retries.push({
      retryId: uuidv4(),
      reason,
      fromStep,
      triggeredAt: now
    });

    this.updatedAt = now;
    return this;
  }

  // Re-run workflow
  reRun(reason, preservePrevious = true) {
    const now = new Date().toISOString();
    const reRunId = `rr-${Date.now()}`;

    // Archive current content path if preserving
    let archivedPath = null;
    if (preservePrevious && this.content.markdownPath) {
      archivedPath = this.content.markdownPath.replace('content/', 'archive/');
    }

    this.workflow.status = config.workflowStates.RE_RUNNING;
    this.workflow.reRunCount = (this.workflow.reRunCount || 0) + 1;
    this.workflow.currentStep = null;
    this.workflow.startedAt = now;
    this.workflow.completedAt = null;

    // Add re-run entry
    this.history.reRuns.push({
      reRunId,
      reason,
      triggeredAt: now,
      previousMarkdownPath: archivedPath
    });

    // Reset content
    this.content = {};

    this.updatedAt = now;
    return { document: this, reRunId, archivedPath };
  }

  // Convert to JSON
  toJSON() {
    return {
      _id: this._id,
      category: this.category,
      metadata: this.metadata,
      source: this.source,
      content: this.content,
      workflow: this.workflow,
      subworkflow: this.subworkflow,
      history: this.history,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // From JSON
  static fromJSON(json) {
    const doc = new BaseDocument(json._id, json.category);
    Object.assign(doc, json);
    return doc;
  }
}

module.exports = BaseDocument;
