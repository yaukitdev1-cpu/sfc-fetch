// Circulars Document Model
const BaseDocument = require('./base');
const config = require('../config');

class CircularDocument extends BaseDocument {
  constructor(refNo) {
    super(refNo, 'circulars');

    // Circular-specific metadata defaults
    this.metadata.refNo = refNo;
    this.metadata.isLegacyFormat = false;
    this.metadata.isModernFormat = false;
  }

  // Set circular-specific metadata
  setMetadata(data) {
    Object.assign(this.metadata, {
      refNo: data.refNo || this._id,
      refFormat: data.refFormat,
      title: data.title,
      issueDate: data.issueDate,
      year: data.year,
      language: data.language || 'EN',
      documentType: data.documentType,
      departmentCode: data.departmentCode,
      hasAppendices: data.hasAppendices || false,
      appendixCount: data.appendixCount || 0,
      isModernFormat: data.isModernFormat || (data.year && data.year >= 2012),
      isLegacyFormat: data.isLegacyFormat || (data.year && data.year < 2012),
      postDocType: data.postDocType,
      postDocSubtype: data.postDocSubtype,
      hasHtml: data.hasHtml || false,
      lastModified: data.lastModified
    });

    return this;
  }

  // Set source information
  setSource(data) {
    this.source = {
      discoveryMethod: data.discoveryMethod || 'api_search',
      searchEndpoint: data.searchEndpoint,
      contentEndpoint: data.contentEndpoint,
      downloadEndpoint: data.downloadEndpoint,
      discoveredAt: data.discoveredAt || new Date().toISOString(),
      sourceVersion: data.sourceVersion
    };

    return this;
  }

  // Set content with appendices
  setContentWithAppendices(markdownPath, markdownSize, wordCount = 0, appendices = []) {
    const now = new Date().toISOString();
    this.content = {
      markdownPath,
      markdownSize,
      wordCount,
      lastConverted: now,
      appendices: appendices.map((app, index) => ({
        index,
        caption: app.caption,
        markdownPath: app.markdownPath
      }))
    };

    this.metadata.hasAppendices = appendices.length > 0;
    this.metadata.appendixCount = appendices.length;

    return this;
  }
}

// Factory function
function createCircularDocument(refNo, data = {}) {
  const doc = new CircularDocument(refNo);
  doc.setMetadata(data);
  if (data.source) {
    doc.setSource(data.source);
  }
  return doc;
}

module.exports = { CircularDocument, createCircularDocument };
