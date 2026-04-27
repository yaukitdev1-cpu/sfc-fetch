import { describe, test, expect, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FormatDetector, FileFormat } from '../src/converters/format-detector';

const RAW_DIR = path.join(__dirname, '../data/raw/circulars');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpPath(ext: string): string {
  return path.join(os.tmpdir(), `fmt_test_${Date.now()}.${ext}`);
}

// ---------------------------------------------------------------------------
// FormatDetector
// ---------------------------------------------------------------------------

describe('FormatDetector', () => {
  let detector: FormatDetector;

  beforeEach(() => {
    detector = new FormatDetector();
  });

  // ---- detectFormat (disk) ----

  describe('detectFormat (from file)', () => {
    test('detects OLE2 magic bytes', async () => {
      const ole2Path = path.join(RAW_DIR, 'H444.pdf');
      if (!fs.existsSync(ole2Path)) {
        expect.skip('OLE2 test file not found, skipping');
        return;
      }
      const fmt = await detector.detectFormat(ole2Path);
      expect(fmt).toBe(FileFormat.OLE2);
    });

    test('detects ZIP magic bytes', async () => {
      const zipPath = path.join(RAW_DIR, 'H679.pdf');
      if (!fs.existsSync(zipPath)) {
        expect.skip('ZIP test file not found, skipping');
        return;
      }
      const fmt = await detector.detectFormat(zipPath);
      expect(fmt).toBe(FileFormat.ZIP);
    });

    test('detects PDF magic bytes', async () => {
      const pdfPath = path.join(RAW_DIR, '24EC53.pdf');
      if (!fs.existsSync(pdfPath)) {
        expect.skip('PDF test file not found, skipping');
        return;
      }
      const fmt = await detector.detectFormat(pdfPath);
      expect(fmt).toBe(FileFormat.PDF);
    });

    test('detects HTML by content scan', async () => {
      const html = '<html><head><title>Test</title></head><body><p>Hello</p></body></html>';
      const p = tmpPath('html');
      fs.writeFileSync(p, html, 'utf8');
      try {
        const fmt = await detector.detectFormat(p);
        expect(fmt).toBe(FileFormat.HTML);
      } finally {
        fs.unlinkSync(p);
      }
    });

    test('treats .htm extension as HTML even without <html> tag', async () => {
      const p = tmpPath('htm');
      fs.writeFileSync(p, '<body>plain htm file</body>', 'utf8');
      try {
        const fmt = await detector.detectFormat(p);
        expect(fmt).toBe(FileFormat.HTML);
      } finally {
        fs.unlinkSync(p);
      }
    });

    test('treats .txt as HTML (basicHtmlToMarkdown path)', async () => {
      const p = tmpPath('txt');
      fs.writeFileSync(p, 'plain text content', 'utf8');
      try {
        const fmt = await detector.detectFormat(p);
        expect(fmt).toBe(FileFormat.HTML);
      } finally {
        fs.unlinkSync(p);
      }
    });

    test('returns UNKNOWN for unknown binary content', async () => {
      const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
      const p = tmpPath('bin');
      fs.writeFileSync(p, buf);
      try {
        const fmt = await detector.detectFormat(p);
        expect(fmt).toBe(FileFormat.UNKNOWN);
      } finally {
        fs.unlinkSync(p);
      }
    });

    test('extension fallback resolves .html without content scan', async () => {
      const p = tmpPath('html');
      fs.writeFileSync(p, 'some text with no html tag', 'utf8');
      try {
        const fmt = await detector.detectFormat(p);
        expect(fmt).toBe(FileFormat.HTML);
      } finally {
        fs.unlinkSync(p);
      }
    });
  });

  // ---- detectFormatFromBuffer ----

  describe('detectFormatFromBuffer', () => {
    test('detects OLE2 from buffer', () => {
      const ole2Path = path.join(RAW_DIR, 'H444.pdf');
      if (!fs.existsSync(ole2Path)) {
        expect.skip('OLE2 test file not found, skipping');
        return;
      }
      const buf = fs.readFileSync(ole2Path);
      const fmt = detector.detectFormatFromBuffer(buf);
      expect(fmt).toBe(FileFormat.OLE2);
    });

    test('detects ZIP from buffer', () => {
      const zipPath = path.join(RAW_DIR, 'H679.pdf');
      if (!fs.existsSync(zipPath)) {
        expect.skip('ZIP test file not found, skipping');
        return;
      }
      const buf = fs.readFileSync(zipPath);
      const fmt = detector.detectFormatFromBuffer(buf);
      expect(fmt).toBe(FileFormat.ZIP);
    });

    test('detects PDF from buffer', () => {
      const pdfPath = path.join(RAW_DIR, '24EC53.pdf');
      if (!fs.existsSync(pdfPath)) {
        expect.skip('PDF test file not found, skipping');
        return;
      }
      const buf = fs.readFileSync(pdfPath);
      const fmt = detector.detectFormatFromBuffer(buf);
      expect(fmt).toBe(FileFormat.PDF);
    });

    test('detects HTML from buffer using filename hint', () => {
      const buf = Buffer.from('Hello world', 'utf8');
      const fmt = detector.detectFormatFromBuffer(buf, 'test.html');
      expect(fmt).toBe(FileFormat.HTML);
    });

    test('returns UNKNOWN for unrecognized buffer without extension hint', () => {
      const buf = Buffer.from([0x00, 0xfe, 0xdead, 0xbeef]);
      const fmt = detector.detectFormatFromBuffer(buf);
      expect(fmt).toBe(FileFormat.UNKNOWN);
    });
  });

  // ---- isOle2 / isZip shortcuts ----

  describe('isOle2', () => {
    test('returns true for OLE2 buffer', () => {
      const ole2Path = path.join(RAW_DIR, 'H444.pdf');
      if (!fs.existsSync(ole2Path)) {
        expect.skip('OLE2 test file not found, skipping');
        return;
      }
      const buf = fs.readFileSync(ole2Path);
      expect(detector.isOle2(buf)).toBe(true);
    });

    test('returns false for PDF buffer', () => {
      const pdfPath = path.join(RAW_DIR, '24EC53.pdf');
      if (!fs.existsSync(pdfPath)) {
        expect.skip('PDF test file not found, skipping');
        return;
      }
      const buf = fs.readFileSync(pdfPath);
      expect(detector.isOle2(buf)).toBe(false);
    });

    test('returns false for buffer shorter than 8 bytes', () => {
      const buf = Buffer.from([0xd0, 0xcf, 0x11]);
      expect(detector.isOle2(buf)).toBe(false);
    });
  });

  describe('isZip', () => {
    test('returns true for ZIP buffer', () => {
      const zipPath = path.join(RAW_DIR, 'H679.pdf');
      if (!fs.existsSync(zipPath)) {
        expect.skip('ZIP test file not found, skipping');
        return;
      }
      const buf = fs.readFileSync(zipPath);
      expect(detector.isZip(buf)).toBe(true);
    });

    test('returns false for PDF buffer', () => {
      const pdfPath = path.join(RAW_DIR, '24EC53.pdf');
      if (!fs.existsSync(pdfPath)) {
        expect.skip('PDF test file not found, skipping');
        return;
      }
      const buf = fs.readFileSync(pdfPath);
      expect(detector.isZip(buf)).toBe(false);
    });

    test('returns false for buffer shorter than 4 bytes', () => {
      const buf = Buffer.from([0x50, 0x4b]);
      expect(detector.isZip(buf)).toBe(false);
    });
  });

  // ---- FileFormat enum values ----

  describe('FileFormat enum', () => {
    test('has all expected values', () => {
      expect(FileFormat.OLE2).toBe('ole2');
      expect(FileFormat.ZIP).toBe('zip');
      expect(FileFormat.PDF).toBe('pdf');
      expect(FileFormat.HTML).toBe('html');
      expect(FileFormat.UNKNOWN).toBe('unknown');
    });
  });
});
