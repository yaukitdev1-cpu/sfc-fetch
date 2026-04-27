import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Magic bytes for known file formats.
 * Order matters: OLE2 must be checked before ZIP since OLE2 compound
 * documents can have embedded ZIP streams (not a concern here but good practice).
 */
export enum FileFormat {
  OLE2 = 'ole2',       // Microsoft Word .doc (OLE2 Compound Document)
  ZIP = 'zip',         // ZIP archive (including DOCX, XLSX, OOXML)
  PDF = 'pdf',         // PDF
  HTML = 'html',       // HTML
  UNKNOWN = 'unknown',
}

const MAGIC_BYTES: Array<{ format: FileFormat; bytes: Buffer; offset?: number }> = [
  { format: FileFormat.OLE2, bytes: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },
  { format: FileFormat.PDF, bytes: Buffer.from([0x25, 0x50, 0x44, 0x46]) }, // %PDF
  { format: FileFormat.ZIP, bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]) },  // PK..
  { format: FileFormat.ZIP, bytes: Buffer.from([0x50, 0x4b, 0x05, 0x06]) },  // PK.. (empty archive)
  { format: FileFormat.ZIP, bytes: Buffer.from([0x50, 0x4b, 0x07, 0x08]) },  // PK.. (spanned)
];

const HTML_SIGNATURE = /<html/i;
const MAX_SIG_CHECK = 16 * 1024; // Check first 16KB for HTML
const SIG_CHECK_SIZE = 8; // Magic byte window size

export class FormatDetector {
  /**
   * Detect file format by reading magic bytes.
   * Falls back to HTML detection via content scan if magic bytes don't match.
   * Falls back to extension-based detection as last resort.
   */
  async detectFormat(filePath: string): Promise<FileFormat> {
    const ext = path.extname(filePath).toLowerCase();

    const buffer = await fs.readFile(filePath);

    // Check magic bytes
    for (const sig of MAGIC_BYTES) {
      const offset = sig.offset || 0;
      if (buffer.length >= offset + sig.bytes.length) {
        const slice = buffer.slice(offset, offset + sig.bytes.length) as Buffer;
        if (slice.equals(sig.bytes)) {
          return sig.format;
        }
      }
    }

    // Check for HTML within first MAX_SIG_CHECK bytes
    if (ext === '.html' || ext === '.htm' || ext === '.xhtml') {
      const head = buffer.slice(0, MAX_SIG_CHECK).toString('utf8', 0, Math.min(MAX_SIG_CHECK, buffer.length));
      if (HTML_SIGNATURE.test(head)) {
        return FileFormat.HTML;
      }
    }

    // Extension-based fallback (for HTML and plain text)
    if (ext === '.html' || ext === '.htm' || ext === '.xhtml') {
      return FileFormat.HTML;
    }

    if (ext === '.txt' || ext === '.text') {
      return FileFormat.HTML; // Treat plain text as HTML for basicHtmlToMarkdown
    }

    return FileFormat.UNKNOWN;
  }

  /**
   * Detect format from a Buffer (without writing to disk).
   */
  detectFormatFromBuffer(buffer: Buffer, filename?: string): FileFormat {
    const ext = filename ? path.extname(filename).toLowerCase() : '';

    for (const sig of MAGIC_BYTES) {
      const offset = sig.offset || 0;
      if (buffer.length >= offset + sig.bytes.length) {
        const slice = buffer.slice(offset, offset + sig.bytes.length) as Buffer;
        if (slice.equals(sig.bytes)) {
          return sig.format;
        }
      }
    }

    if (ext === '.html' || ext === '.htm' || ext === '.xhtml') {
      const head = buffer.slice(0, MAX_SIG_CHECK).toString('utf8', 0, Math.min(MAX_SIG_CHECK, buffer.length));
      if (HTML_SIGNATURE.test(head)) {
        return FileFormat.HTML;
      }
    }

    if (ext === '.html' || ext === '.htm' || ext === '.xhtml') {
      return FileFormat.HTML;
    }

    if (ext === '.txt' || ext === '.text') {
      return FileFormat.HTML;
    }

    return FileFormat.UNKNOWN;
  }

  /**
   * Check if a buffer starts with OLE2 magic bytes.
   */
  isOle2(buffer: Buffer): boolean {
    if (buffer.length < 8) return false;
    return buffer.slice(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  }

  /**
   * Check if a buffer starts with ZIP magic bytes.
   */
  isZip(buffer: Buffer): boolean {
    if (buffer.length < 4) return false;
    return buffer.slice(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  }
}
