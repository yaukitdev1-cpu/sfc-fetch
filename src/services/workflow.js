// Workflow State Machine Service
const config = require('../config');
const database = require('../database');

class WorkflowService {
  // Get valid state transitions
  getValidTransitions(currentState) {
    const transitions = {
      [config.workflowStates.PENDING]: [config.workflowStates.DISCOVERED],
      [config.workflowStates.DISCOVERED]: [config.workflowStates.DOWNLOADING],
      [config.workflowStates.DOWNLOADING]: [config.workflowStates.PROCESSING, config.workflowStates.FAILED],
      [config.workflowStates.PROCESSING]: [config.workflowStates.COMPLETED, config.workflowStates.FAILED],
      [config.workflowStates.COMPLETED]: [config.workflowStates.RE_RUNNING, config.workflowStates.STALE],
      [config.workflowStates.FAILED]: [config.workflowStates.RETRYING],
      [config.workflowStates.RETRYING]: [config.workflowStates.DOWNLOADING, config.workflowStates.FAILED],
      [config.workflowStates.RE_RUNNING]: [config.workflowStates.PENDING],
      [config.workflowStates.STALE]: [config.workflowStates.RE_RUNNING]
    };

    return transitions[currentState] || [];
  }

  // Check if state transition is valid
  isValidTransition(fromState, toState) {
    const validTransitions = this.getValidTransitions(fromState);
    return validTransitions.includes(toState);
  }

  // Can retry this document
  canRetry(refNo, category) {
    const doc = database.getDocument(refNo, category);
    if (!doc) return { canRetry: false, reason: 'Document not found' };

    const status = doc.workflow?.status;
    const validStatuses = [config.workflowStates.FAILED, config.workflowStates.RETRYING];

    return {
      canRetry: validStatuses.includes(status),
      currentStatus: status
    };
  }

  // Can re-run this document
  canReRun(refNo, category) {
    const doc = database.getDocument(refNo, category);
    if (!doc) return { canReRun: false, reason: 'Document not found' };

    const status = doc.workflow?.status;
    const validStatuses = [
      config.workflowStates.COMPLETED,
      config.workflowStates.STALE,
      config.workflowStates.FAILED
    ];

    return {
      canReRun: validStatuses.includes(status),
      currentStatus: status
    };
  }

  // Get document workflow status
  getWorkflowStatus(refNo, category) {
    const doc = database.getDocument(refNo, category);
    if (!doc) return null;

    const workflow = doc.workflow || {};
    const { canRetry } = this.canRetry(refNo, category);
    const { canReRun } = this.canReRun(refNo, category);

    // Find last error
    let lastError = null;
    if (doc.subworkflow?.steps) {
      const failedSteps = doc.subworkflow.steps.filter(s => s.status === config.stepStatuses.FAILED);
      if (failedSteps.length > 0) {
        const lastFailed = failedSteps[failedSteps.length - 1];
        if (lastFailed.errors && lastFailed.errors.length > 0) {
          lastError = lastFailed.errors[lastFailed.errors.length - 1];
        }
      }
    }

    return {
      refNo,
      category,
      workflow: {
        status: workflow.status,
        currentStep: workflow.currentStep,
        startedAt: workflow.startedAt,
        completedAt: workflow.completedAt,
        durationSeconds: workflow.durationSeconds,
        retryCount: workflow.retryCount || 0,
        reRunCount: workflow.reRunCount || 0
      },
      isRetryable: canRetry,
      isReRunnable: canReRun,
      lastError
    };
  }

  // Get sub-workflow steps
  getSteps(refNo, category) {
    const doc = database.getDocument(refNo, category);
    if (!doc || !doc.subworkflow) return { steps: [] };

    return {
      refNo,
      category,
      steps: doc.subworkflow.steps || []
    };
  }

  // Retry document from failure
  retryDocument(refNo, category, options = {}) {
    const { reason, fromStep } = options;

    const doc = database.getDocument(refNo, category);
    if (!doc) {
      throw new Error('Document not found');
    }

    const { canRetry } = this.canRetry(refNo, category);
    if (!canRetry) {
      throw new Error(`Cannot retry document in status: ${doc.workflow.status}`);
    }

    // Determine step to resume from
    let resumeFromStep = fromStep;
    if (!resumeFromStep && doc.subworkflow?.steps) {
      // Find the failed step
      const failedStep = doc.subworkflow.steps.find(s => s.status === config.stepStatuses.FAILED);
      resumeFromStep = failedStep?.step || doc.workflow.currentStep;
    }

    // Update workflow
    doc.workflow.status = config.workflowStates.RETRYING;
    doc.workflow.retryCount = (doc.workflow.retryCount || 0) + 1;
    doc.workflow.currentStep = resumeFromStep;

    // Add retry to history
    if (!doc.history) doc.history = { runs: [], reRuns: [], errors: [] };
    if (!doc.history.retries) doc.history.retries = [];
    doc.history.retries.push({
      reason: reason || 'manual_retry',
      fromStep: resumeFromStep,
      triggeredAt: new Date().toISOString()
    });

    database.upsertDocument(refNo, category, doc);

    return {
      refNo,
      previousStatus: config.workflowStates.FAILED,
      currentStatus: doc.workflow.status,
      retryCount: doc.workflow.retryCount,
      resumingFromStep: resumeFromStep
    };
  }

  // Re-run document from scratch
  reRunDocument(refNo, category, options = {}) {
    const { reason, preservePrevious = true } = options;

    const doc = database.getDocument(refNo, category);
    if (!doc) {
      throw new Error('Document not found');
    }

    const { canReRun } = this.canReRun(refNo, category);
    if (!canReRun) {
      throw new Error(`Cannot re-run document in status: ${doc.workflow.status}`);
    }

    // Archive previous content
    let archivedPath = null;
    if (preservePrevious && doc.content?.markdownPath) {
      const pathParts = doc.content.markdownPath.split('/');
      const fileName = pathParts.pop();
      archivedPath = [...pathParts, '..', 'archive', fileName].join('/');
    }

    // Update workflow
    doc.workflow.status = config.workflowStates.RE_RUNNING;
    doc.workflow.reRunCount = (doc.workflow.reRunCount || 0) + 1;
    doc.workflow.currentStep = null;
    doc.workflow.startedAt = new Date().toISOString();
    doc.workflow.completedAt = null;

    // Reset content
    doc.content = {};

    // Add re-run to history
    if (!doc.history) doc.history = { runs: [], reRuns: [], errors: [] };
    const reRunId = `rr-${Date.now()}`;
    doc.history.reRuns.push({
      reRunId,
      reason: reason || 'manual_re_run',
      triggeredAt: new Date().toISOString(),
      previousMarkdownPath: archivedPath
    });

    database.upsertDocument(refNo, category, doc);

    return {
      refNo,
      previousStatus: config.workflowStates.COMPLETED,
      currentStatus: doc.workflow.status,
      reRunId,
      reRunCount: doc.workflow.reRunCount,
      archivedContent: archivedPath,
      newContentPath: doc.content.markdownPath
    };
  }

  // Get document history
  getHistory(refNo, category) {
    const doc = database.getDocument(refNo, category);
    if (!doc) return null;

    return {
      refNo,
      category,
      runs: doc.history?.runs || [],
      reRuns: doc.history?.reRuns || [],
      retries: doc.history?.retries || []
    };
  }
}

module.exports = new WorkflowService();
