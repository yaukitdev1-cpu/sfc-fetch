// SFC Fetch Microservice - Main Entry Point
const express = require('express');
const config = require('./config');
const database = require('./database');
const backupService = require('./services/backup');
const contentService = require('./services/content');

// Routes
const documentsRouter = require('./routes/documents');
const backupRouter = require('./routes/backup');

const app = express();
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const counts = database.getCountsByCategory();
    const backupStatus = backupService.getStatus();
    const contentStats = contentService.getStats();

    let totalDocs = 0;
    for (const count of Object.values(counts)) {
      totalDocs += count;
    }

    res.json({
      status: 'healthy',
      collections: {
        circulars: { count: counts.circulars || 0, status: 'loaded' },
        guidelines: { count: counts.guidelines || 0, status: 'loaded' },
        consultations: { count: counts.consultations || 0, status: 'loaded' },
        news: { count: counts.news || 0, status: 'loaded' }
      },
      lastBackup: backupStatus.lastBackup,
      activeWorkflows: 0, // Could track in-progress workflows
      storageUsage: contentStats.size,
      storageUsageFormatted: contentService.formatBytes(contentStats.size)
    });
  } catch (error) {
    console.error('[Error] Health check failed:', error);
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// Mount routes
app.use('/', documentsRouter);
app.use('/', backupRouter);

// Query endpoint
app.post('/query', (req, res) => {
  try {
    const { category, filters = {}, sort, pagination = {} } = req.body;

    if (!category || !config.categories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const queryFilters = {};
    if (filters.status) queryFilters.status = filters.status;
    if (filters.year) queryFilters.year = filters.year;
    if (pagination.limit) queryFilters.limit = pagination.limit;
    if (pagination.offset) queryFilters.offset = pagination.offset;

    const docs = database.getDocuments(category, queryFilters);

    res.json({
      category,
      count: docs.length,
      documents: docs
    });
  } catch (error) {
    console.error('[Error] POST /query:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Workflow list endpoint
app.get('/workflows', (req, res) => {
  try {
    const { status, category } = req.query;

    let categories = config.categories;
    if (category && config.categories.includes(category)) {
      categories = [category];
    }

    const results = [];
    for (const cat of categories) {
      const filters = {};
      if (status) filters.status = status;

      const docs = database.getDocuments(cat, filters);
      for (const doc of docs) {
        results.push({
          refNo: doc._id,
          category: cat,
          workflow: doc.workflow
        });
      }
    }

    res.json({
      count: results.length,
      workflows: results
    });
  } catch (error) {
    console.error('[Error] GET /workflows:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Error] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Initialize and start server
async function start() {
  console.log('[SFC-Fetch] Starting microservice...');

  // Ensure directories exist
  backupService.ensureDirectories();

  // Initialize database
  database.initialize();

  // Hydration check on startup
  if (config.autoHydrate && !backupService.hasLocalData()) {
    console.log('[SFC-Fetch] No local data found, attempting hydration...');
    try {
      await backupService.hydrate();
      console.log('[SFC-Fetch] Hydration complete');
    } catch (error) {
      console.error('[SFC-Fetch] Hydration failed:', error.message);
    }
  }

  // Start server
  app.listen(config.port, () => {
    console.log(`[SFC-Fetch] Server running on port ${config.port}`);
    console.log(`[SFC-Fetch] Health check: http://localhost:${config.port}/health`);
  });
}

// Graceful shutdown
async function shutdown() {
  console.log('[SFC-Fetch] Shutting down...');

  // Dehydration on shutdown
  if (config.autoDehydrate) {
    console.log('[SFC-Fetch] Running dehydration...');
    try {
      await backupService.dehydrate();
      console.log('[SFC-Fetch] Dehydration complete');
    } catch (error) {
      console.error('[SFC-Fetch] Dehydration failed:', error.message);
    }
  }

  // Close database
  database.close();

  console.log('[SFC-Fetch] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the service
start().catch(error => {
  console.error('[SFC-Fetch] Failed to start:', error);
  process.exit(1);
});

module.exports = app;
