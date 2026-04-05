// Backup Routes
const express = require('express');
const backupService = require('../services/backup');

const router = express.Router();

// Dehydration - create backup and commit to git
router.post('/dehydrate', async (req, res) => {
  try {
    console.log('[API] POST /dehydrate');
    const result = await backupService.dehydrate();

    res.json({
      backupId: result.backupId,
      filesArchived: result.filesArchived,
      sizeBytes: result.sizeBytes,
      compressedSizeBytes: result.compressedSizeBytes,
      commitHash: result.commitHash,
      totalDocuments: result.totalDocuments
    });
  } catch (error) {
    console.error('[Error] POST /dehydrate:', error);
    res.status(500).json({ error: 'Dehydration failed', message: error.message });
  }
});

// Hydration - restore from git backup
router.post('/hydrate', async (req, res) => {
  try {
    console.log('[API] POST /hydrate');
    const { backupId } = req.body;

    const result = await backupService.hydrate(backupId);

    res.json({
      restoredFrom: result.restoredFrom,
      collectionsRestored: result.collectionsRestored,
      documentsRestored: result.documentsRestored,
      contentFilesRestored: result.contentFilesRestored
    });
  } catch (error) {
    console.error('[Error] POST /hydrate:', error);
    res.status(500).json({ error: 'Hydration failed', message: error.message });
  }
});

// Get backup status
router.get('/backup/status', (req, res) => {
  try {
    const status = backupService.getStatus();

    res.json(status);
  } catch (error) {
    console.error('[Error] GET /backup/status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
