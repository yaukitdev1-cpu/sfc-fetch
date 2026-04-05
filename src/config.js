// Configuration management
require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  dataDir: process.env.DATA_DIR || './data',
  contentDir: process.env.CONTENT_DIR || './data/content',
  archiveDir: process.env.ARCHIVE_DIR || './data/archive',
  dbPath: process.env.DB_PATH || './data/db/sfc.db',
  gitRemote: process.env.GIT_REMOTE || 'origin',
  gitBranch: process.env.GIT_BRANCH || 'master',
  autoHydrate: process.env.AUTO_HYDRATE !== 'false',
  autoDehydrate: process.env.AUTO_DEHYDRATE !== 'false',
  categories: ['circulars', 'guidelines', 'consultations', 'news'],
  workflowStates: {
    PENDING: 'PENDING',
    DISCOVERED: 'DISCOVERED',
    DOWNLOADING: 'DOWNLOADING',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    RETRYING: 'RETRYING',
    RE_RUNNING: 'RE_RUNNING',
    STALE: 'STALE'
  },
  stepStatuses: {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    SKIPPED: 'SKIPPED'
  }
};

module.exports = config;
