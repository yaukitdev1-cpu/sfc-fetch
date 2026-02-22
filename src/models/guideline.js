// Guidelines Document Model
const BaseDocument = require('./base');

class GuidelineDocument extends BaseDocument {
  constructor(guidelineId) {
    super(guidelineId, 'guidelines');

    // Guideline-specific metadata defaults
    this.metadata.guidelineId = guidelineId;
    this.metadata.hasVersionHistory = false;
    this.metadata.versionCount = 0;
  }

  // Set guideline-specific metadata
  setMetadata(data) {
    Object.assign(this.metadata, {
      guidelineId: data.guidelineId || this._id,
      topics: data.topics || [],
      title: data.title,
      effectiveDate: data.effectiveDate,
      hasVersionHistory: data.hasVersionHistory || false,
      versionCount: data.versionCount || 0,
      language: data.language || 'EN'
    });

    return this;
  }

  // Set source (for guidelines, this is typically HTML scraping)
  setSource(data) {
    this.source = {
      discoveryMethod: data.discoveryMethod || 'html_scrape',
      scrapeUrl: data.scrapeUrl,
      discoveredAt: data.discoveredAt || new Date().toISOString(),
      sourceVersion: data.sourceVersion
    };

    return this;
  }

  // Set content with historical versions
  setContentWithVersions(markdownPath, markdownSize, wordCount = 0, historicalVersions = []) {
    const now = new Date().toISOString();
    this.content = {
      markdownPath,
      markdownSize,
      wordCount,
      lastConverted: now,
      historicalVersions
    };

    this.metadata.hasVersionHistory = historicalVersions.length > 0;
    this.metadata.versionCount = historicalVersions.length + 1;

    return this;
  }
}

// Factory function
function createGuidelineDocument(guidelineId, data = {}) {
  const doc = new GuidelineDocument(guidelineId);
  doc.setMetadata(data);
  if (data.source) {
    doc.setSource(data.source);
  }
  return doc;
}

module.exports = { GuidelineDocument, createGuidelineDocument };
