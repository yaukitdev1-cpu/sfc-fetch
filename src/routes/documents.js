// Document Routes
const express = require('express');
const database = require('../database');
const workflowService = require('../services/workflow');
const contentService = require('../services/content');
const config = require('../config');

const router = express.Router();

// Get document by refNo
router.get('/:category/:refNo', (req, res) => {
  try {
    const { category, refNo } = req.params;

    if (!config.categories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const doc = database.getDocument(refNo, category);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(doc);
  } catch (error) {
    console.error('[Error] GET /:category/:refNo:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get document content (markdown)
router.get('/:category/:refNo/content', (req, res) => {
  try {
    const { category, refNo } = req.params;
    const { appendix, version, type } = req.query;

    if (!config.categories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const doc = database.getDocument(refNo, category);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Determine content path
    let markdownPath;
    let contentOptions = { year: doc.metadata?.year, language: doc.metadata?.language };

    if (category === 'consultations') {
      // Consultations have consultation and conclusion content
      if (type === 'conclusion') {
        markdownPath = doc.content?.conclusionMarkdownPath;
        contentOptions.isConclusion = true;
      } else {
        markdownPath = doc.content?.consultationMarkdownPath;
      }
    } else if (appendix !== undefined) {
      // Circulars with appendices
      markdownPath = doc.content?.appendices?.[parseInt(appendix)]?.markdownPath;
      contentOptions.appendixIndex = parseInt(appendix);
    } else {
      markdownPath = doc.content?.markdownPath;
    }

    if (!markdownPath) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const markdownContent = contentService.getMarkdown(markdownPath);

    if (!markdownContent) {
      return res.status(404).json({ error: 'Content file not found' });
    }

    const stats = require('fs').statSync(require('path').join(config.contentDir, markdownPath));

    res.json({
      refNo,
      category,
      content: {
        markdown: markdownContent,
        size: stats.size,
        hash: doc.content?.markdownHash,
        lastConverted: doc.content?.lastConverted
      },
      metadata: {
        title: doc.metadata?.title,
        issueDate: doc.metadata?.issueDate
      }
    });
  } catch (error) {
    console.error('[Error] GET /:category/:refNo/content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get workflow status
router.get('/:category/:refNo/workflow/status', (req, res) => {
  try {
    const { category, refNo } = req.params;

    if (!config.categories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const status = workflowService.getWorkflowStatus(refNo, category);

    if (!status) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(status);
  } catch (error) {
    console.error('[Error] GET /:category/:refNo/workflow/status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get workflow steps
router.get('/:category/:refNo/workflow/steps', (req, res) => {
  try {
    const { category, refNo } = req.params;

    if (!config.categories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const steps = workflowService.getSteps(refNo, category);

    if (!steps) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(steps);
  } catch (error) {
    console.error('[Error] GET /:category/:refNo/workflow/steps:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Retry failed document
router.post('/:category/:refNo/workflow/retry', (req, res) => {
  try {
    const { category, refNo } = req.params;
    const { reason, fromStep } = req.body;

    if (!config.categories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const result = workflowService.retryDocument(refNo, category, { reason, fromStep });

    res.json(result);
  } catch (error) {
    console.error('[Error] POST /:category/:refNo/workflow/retry:', error);
    res.status(400).json({ error: error.message });
  }
});

// Re-run document from scratch
router.post('/:category/:refNo/workflow/re-run', (req, res) => {
  try {
    const { category, refNo } = req.params;
    const { reason, preservePrevious = true } = req.body;

    if (!config.categories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const result = workflowService.reRunDocument(refNo, category, { reason, preservePrevious });

    res.json(result);
  } catch (error) {
    console.error('[Error] POST /:category/:refNo/workflow/re-run:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get document history
router.get('/:category/:refNo/history', (req, res) => {
  try {
    const { category, refNo } = req.params;

    if (!config.categories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const history = workflowService.getHistory(refNo, category);

    if (!history) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(history);
  } catch (error) {
    console.error('[Error] GET /:category/:refNo/history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List documents in category with filters
router.get('/:category', (req, res) => {
  try {
    const { category } = req.params;
    const { status, year, limit = 100, offset = 0 } = req.query;

    if (!config.categories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const filters = {};
    if (status) filters.status = status;
    if (year) filters.year = parseInt(year);
    if (limit) filters.limit = parseInt(limit);
    if (offset) filters.offset = parseInt(offset);

    const docs = database.getDocuments(category, filters);

    res.json({
      category,
      count: docs.length,
      documents: docs
    });
  } catch (error) {
    console.error('[Error] GET /:category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
