// News Document Model
const BaseDocument = require('./base');

class NewsDocument extends BaseDocument {
  constructor(newsRefNo) {
    super(newsRefNo, 'news');

    // News-specific metadata defaults
    this.metadata.newsRefNo = newsRefNo;
  }

  // Set news-specific metadata
  setMetadata(data) {
    Object.assign(this.metadata, {
      newsRefNo: data.newsRefNo || this._id,
      title: data.title,
      issueDate: data.issueDate,
      year: data.year,
      newsType: data.newsType,
      hasExternalLink: data.hasExternalLink || false,
      hasImages: data.hasImages || false,
      imageCount: data.imageCount || 0,
      hasAppendices: data.hasAppendices || false
    });

    return this;
  }

  // Set source information
  setSource(data) {
    this.source = {
      discoveryMethod: data.discoveryMethod || 'api_search',
      searchEndpoint: data.searchEndpoint,
      contentEndpoint: data.contentEndpoint,
      discoveredAt: data.discoveredAt || new Date().toISOString(),
      sourceVersion: data.sourceVersion
    };

    return this;
  }

  // Set content with images and plain text
  setFullContent(
    markdownPath,
    markdownSize,
    plainTextPath = null,
    wordCount = 0,
    images = []
  ) {
    const now = new Date().toISOString();
    this.content = {
      markdownPath,
      markdownSize,
      plainTextPath,
      wordCount,
      lastConverted: now,
      images: images.map((img, index) => ({
        index,
        caption: img.caption,
        imagePath: img.imagePath
      }))
    };

    this.metadata.hasImages = images.length > 0;
    this.metadata.imageCount = images.length;

    return this;
  }
}

// Factory function
function createNewsDocument(newsRefNo, data = {}) {
  const doc = new NewsDocument(newsRefNo);
  doc.setMetadata(data);
  if (data.source) {
    doc.setSource(data.source);
  }
  return doc;
}

module.exports = { NewsDocument, createNewsDocument };
