// SQLite Database Layer - Document-oriented NoSQL-like storage
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('./config');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.dbPath = config.dbPath;
  }

  // Initialize database and create tables
  initialize() {
    // Ensure directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    // Create collections (tables)
    this.createTables();

    console.log(`[DB] Initialized at ${this.dbPath}`);
    return this;
  }

  createTables() {
    // Base documents table with JSON storage
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS documents (
        _id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_category ON documents(category);
      CREATE INDEX IF NOT EXISTS idx_category_status ON documents(category, json_extract(document_json, '$.workflow.status'));
    `;

    this.db.exec(createTableSQL);

    // Create backup metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS backup_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backup_id TEXT UNIQUE,
        created_at TEXT DEFAULT (datetime('now')),
        commit_hash TEXT,
        commit_url TEXT,
        documents_count INTEGER,
        size_bytes INTEGER
      );
    `);
  }

  // Insert or update a document
  upsertDocument(refNo, category, document) {
    const stmt = this.db.prepare(`
      INSERT INTO documents (_id, category, document_json, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(_id) DO UPDATE SET
        document_json = excluded.document_json,
        updated_at = datetime('now')
    `);

    stmt.run(refNo, category, JSON.stringify(document));
    return document;
  }

  // Get a document by refNo
  getDocument(refNo, category) {
    const stmt = this.db.prepare(`
      SELECT document_json FROM documents
      WHERE _id = ? AND category = ?
    `);

    const row = stmt.get(refNo, category);
    return row ? JSON.parse(row.document_json) : null;
  }

  // Get all documents in a category with optional filters
  getDocuments(category, filters = {}) {
    let sql = `SELECT document_json FROM documents WHERE category = ?`;
    const params = [category];

    if (filters.status) {
      sql += ` AND json_extract(document_json, '$.workflow.status') = ?`;
      params.push(filters.status);
    }

    if (filters.year) {
      sql += ` AND json_extract(document_json, '$.metadata.year') = ?`;
      params.push(filters.year);
    }

    if (filters.limit) {
      sql += ` LIMIT ?`;
      params.push(filters.limit);
    }

    if (filters.offset) {
      sql += ` OFFSET ?`;
      params.push(filters.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);

    return rows.map(row => JSON.parse(row.document_json));
  }

  // Get all documents count
  getDocumentCount(category = null) {
    if (category) {
      const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM documents WHERE category = ?`);
      return stmt.get(category).count;
    }

    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM documents`);
    return stmt.get().count;
  }

  // Get count by category
  getCountsByCategory() {
    const stmt = this.db.prepare(`
      SELECT category, COUNT(*) as count
      FROM documents
      GROUP BY category
    `);

    const rows = stmt.all();
    const counts = {};
    for (const row of rows) {
      counts[row.category] = row.count;
    }
    return counts;
  }

  // Update workflow status
  updateWorkflowStatus(refNo, category, status, currentStep = null) {
    const doc = this.getDocument(refNo, category);
    if (!doc) return null;

    doc.workflow.status = status;
    if (currentStep) {
      doc.workflow.currentStep = currentStep;
    }
    doc.workflow.updatedAt = new Date().toISOString();

    return this.upsertDocument(refNo, category, doc);
  }

  // Add a sub-workflow step
  addStep(refNo, category, step) {
    const doc = this.getDocument(refNo, category);
    if (!doc) return null;

    if (!doc.subworkflow) {
      doc.subworkflow = { steps: [] };
    }
    if (!doc.subworkflow.steps) {
      doc.subworkflow.steps = [];
    }

    doc.subworkflow.steps.push(step);
    return this.upsertDocument(refNo, category, doc);
  }

  // Update a step
  updateStep(refNo, category, stepName, updates) {
    const doc = this.getDocument(refNo, category);
    if (!doc || !doc.subworkflow || !doc.subworkflow.steps) return null;

    const step = doc.subworkflow.steps.find(s => s.step === stepName);
    if (!step) return null;

    Object.assign(step, updates);
    return this.upsertDocument(refNo, category, doc);
  }

  // Add error to step
  addStepError(refNo, category, stepName, error) {
    const doc = this.getDocument(refNo, category);
    if (!doc || !doc.subworkflow || !doc.subworkflow.steps) return null;

    const step = doc.subworkflow.steps.find(s => s.step === stepName);
    if (!step) return null;

    if (!step.errors) step.errors = [];
    step.errors.push(error);

    return this.upsertDocument(refNo, category, doc);
  }

  // Add to history
  addHistory(refNo, category, entry) {
    const doc = this.getDocument(refNo, category);
    if (!doc) return null;

    if (!doc.history) {
      doc.history = { runs: [], reRuns: [], errors: [] };
    }
    if (!doc.history.runs) doc.history.runs = [];
    if (!doc.history.reRuns) doc.history.reRuns = [];

    if (entry.type === 'run') {
      doc.history.runs.push(entry.data);
    } else if (entry.type === 'reRun') {
      doc.history.reRuns.push(entry.data);
    }

    return this.upsertDocument(refNo, category, doc);
  }

  // Save backup metadata
  saveBackupMetadata(backupId, commitHash, commitUrl, documentsCount, sizeBytes) {
    const stmt = this.db.prepare(`
      INSERT INTO backup_metadata (backup_id, commit_hash, commit_url, documents_count, size_bytes)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(backupId, commitHash, commitUrl, documentsCount, sizeBytes);
  }

  // Get last backup
  getLastBackup() {
    const stmt = this.db.prepare(`
      SELECT * FROM backup_metadata
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return stmt.get() || null;
  }

  // Export all data as JSON
  exportAll() {
    const stmt = this.db.prepare(`SELECT _id, category, document_json FROM documents`);
    const rows = stmt.all();

    const data = {
      circulars: [],
      guidelines: [],
      consultations: [],
      news: []
    };

    for (const row of rows) {
      const doc = JSON.parse(row.document_json);
      if (data[row.category]) {
        data[row.category].push(doc);
      }
    }

    return data;
  }

  // Import data
  importAll(data) {
    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents (_id, category, document_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);

    const importMany = this.db.transaction((category, docs) => {
      for (const doc of docs) {
        insertStmt.run(doc._id, category, JSON.stringify(doc));
      }
    });

    for (const [category, docs] of Object.entries(data)) {
      if (docs && docs.length > 0) {
        importMany(category, docs);
      }
    }
  }

  // Close database
  close() {
    if (this.db) {
      this.db.close();
      console.log('[DB] Closed');
    }
  }
}

module.exports = new DatabaseManager();
