export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  dataDir: process.env.DATA_DIR || './data',
  contentDir: process.env.CONTENT_DIR || './data/content',
  archiveDir: process.env.ARCHIVE_DIR || './data/archive',
  dbPath: process.env.DB_PATH || './data/db/sfc-db.json',

  gitRemote: process.env.GIT_REMOTE || 'origin',
  gitBranch: process.env.GIT_BRANCH || 'main',
  gitRepoUrl: process.env.GIT_REPO_URL || '',
  gitPat: process.env.GIT_PAT || '',
  gitUserName: process.env.GIT_USER_NAME || 'SFC Bot',
  gitUserEmail: process.env.GIT_USER_EMAIL || 'bot@example.com',

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
    STALE: 'STALE',
  },

  stepStatuses: {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    SKIPPED: 'SKIPPED',
  },

  sfcBaseUrl: process.env.SFC_BASE_URL || 'https://apps.sfc.hk/edistributionWeb',
  sfcRateLimit: parseInt(process.env.SFC_RATE_LIMIT || '2', 10),
  sfcRetryAttempts: parseInt(process.env.SFC_RETRY_ATTEMPTS || '5', 10),

  // Auto-discovery configuration
  discoveryEnabled: process.env.DISCOVERY_ENABLED !== 'false',
  discoveryScheduleCron: process.env.DISCOVERY_SCHEDULE_CRON || '0 2 * * *',
  discoveryCategories: (process.env.DISCOVERY_CATEGORIES || 'circulars,consultations,news').split(','),
  discoveryStartYear: parseInt(process.env.DISCOVERY_START_YEAR || '1990', 10),
  discoveryPageSize: parseInt(process.env.DISCOVERY_PAGE_SIZE || '100', 10),
  discoveryRequestIntervalMs: parseInt(process.env.DISCOVERY_REQUEST_INTERVAL_MS || '500', 10),

  backupRetention: parseInt(process.env.BACKUP_RETENTION || '10', 10),

  dbEncryption: process.env.DB_ENCRYPTION === 'true' || false,

  doclingPath: process.env.DOCLING_PATH || '/usr/local/bin/docling',
  doclingTimeout: parseInt(process.env.DOCLING_TIMEOUT || '30000', 10),

  queuePath: process.env.QUEUE_PATH || './data/db/sfc-db.json',
  queueMaxRetries: parseInt(process.env.QUEUE_MAX_RETRIES || '5', 10),
});
