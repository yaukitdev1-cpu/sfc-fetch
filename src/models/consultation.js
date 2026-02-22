// Consultations Document Model
const BaseDocument = require('./base');

class ConsultationDocument extends BaseDocument {
  constructor(cpRefNo) {
    super(cpRefNo, 'consultations');

    // Consultation-specific metadata defaults
    this.metadata.cpRefNo = cpRefNo;
    this.metadata.isConcluded = false;
  }

  // Set consultation-specific metadata
  setMetadata(data) {
    Object.assign(this.metadata, {
      cpRefNo: data.cpRefNo || this._id,
      cpTitle: data.cpTitle,
      cpIssueDate: data.cpIssueDate,
      isConcluded: data.isConcluded || false,
      commentDeadline: data.commentDeadline,
      ccRefNo: data.ccRefNo,
      ccIssueDate: data.ccIssueDate,
      year: data.year
    });

    return this;
  }

  // Set source information
  setSource(data) {
    this.source = {
      discoveryMethod: data.discoveryMethod || 'api_search',
      searchEndpoint: data.searchEndpoint,
      consultationEndpoint: data.consultationEndpoint,
      conclusionEndpoint: data.conclusionEndpoint,
      discoveredAt: data.discoveredAt || new Date().toISOString(),
      sourceVersion: data.sourceVersion
    };

    return this;
  }

  // Set content with consultation and conclusion papers
  setContentWithConclusion(
    consultationPath,
    consultationSize,
    conclusionPath = null,
    conclusionSize = 0,
    appendices = []
  ) {
    const now = new Date().toISOString();
    this.content = {
      consultationMarkdownPath: consultationPath,
      consultationMarkdownSize: consultationSize,
      conclusionMarkdownPath: conclusionPath,
      conclusionMarkdownSize: conclusionSize,
      lastConverted: now,
      appendices: appendices.map((app, index) => ({
        index,
        caption: app.caption,
        markdownPath: app.markdownPath
      }))
    };

    return this;
  }
}

// Factory function
function createConsultationDocument(cpRefNo, data = {}) {
  const doc = new ConsultationDocument(cpRefNo);
  doc.setMetadata(data);
  if (data.source) {
    doc.setSource(data.source);
  }
  return doc;
}

module.exports = { ConsultationDocument, createConsultationDocument };
