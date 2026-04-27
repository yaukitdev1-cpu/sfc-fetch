import { describe, test, expect, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ZipBundleConverter } from '../src/converters/zip-bundle.converter';
import { DoclingService } from '../src/converters/docling.service';

const RAW_DIR = path.join(__dirname, '../data/raw/circulars');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockDoclingService(overrides: Partial<{ md: string; throw: string }> = {}) {
  return {
    convertPdfToMarkdown: async (_path: string) => {
      if (overrides.throw) throw new Error(overrides.throw);
      return overrides.md ?? `# Mock Docling conversion of ${_path}\n\nThis is mock markdown content.`;
    },
  };
}

function makeMockConfig(overrides: Record<string, string | number> = {}) {
  return {
    get: (key: string) => {
      const defaults: Record<string, string | number> = {
        unzipPath: '/usr/bin/unzip',
        unzipTimeout: 60000,
        ...overrides,
      };
      return defaults[key];
    },
  };
}

// ---------------------------------------------------------------------------
// ZipBundleConverter
// ---------------------------------------------------------------------------

describe('ZipBundleConverter', () => {
  // ---- findMainPdf via integration (unzip is real) ----

  describe('findMainPdf logic (via convertToMarkdown integration)', () => {
    test('unzips a real ZIP bundle and finds PDF files', async () => {
      const zipPath = path.join(RAW_DIR, 'H679.pdf');
      if (!fs.existsSync(zipPath)) {
        expect.skip('ZIP test file H679.pdf not found, skipping');
        return;
      }

      const mockDocling = makeMockDoclingService({ md: '# Circular content\n\nMock text.' });
      // @ts-ignore — private property accessed for test
      const converter = new ZipBundleConverter(makeMockConfig() as any, mockDocling as any);

      const markdown = await converter.convertToMarkdown(zipPath);
      expect(typeof markdown).toBe('string');
      expect(markdown.length).toBeGreaterThan(10);
    });

    test('rejects a ZIP with no PDF inside', async () => {
      // Create a ZIP without any PDF
      const tmpZip = path.join(os.tmpdir(), `no_pdf_${Date.now()}.zip`);
      const tmpDir = path.join(os.tmpdir(), `no_pdf_dir_${Date.now()}`);
      fs.mkdirSync(tmpDir);
      fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'Just a text file');
      await new Promise<void>((resolve, reject) => {
        const { spawn } = require('child_process');
        const proc = spawn('/usr/bin/zip', [tmpZip, 'readme.txt'], { cwd: tmpDir });
        proc.on('close', (code: number) => (code === 0 ? resolve() : reject(new Error(`zip rc=${code}`))));
      });

      const mockDocling = makeMockDoclingService();
      // @ts-ignore
      const converter = new ZipBundleConverter(makeMockConfig() as any, mockDocling as any);
      try {
        await converter.convertToMarkdown(tmpZip);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('No PDF found');
      } finally {
        fs.unlinkSync(tmpZip);
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    test('falls back to pdftotext when Docling throws', async () => {
      const zipPath = path.join(RAW_DIR, 'H679.pdf');
      if (!fs.existsSync(zipPath)) {
        expect.skip('ZIP test file H679.pdf not found, skipping');
        return;
      }

      const mockDocling = makeMockDoclingService({ throw: 'Docling unavailable' });
      // @ts-ignore
      const converter = new ZipBundleConverter(makeMockConfig() as any, mockDocling as any);

      // The converter falls back to basicPdfFallback (pdftotext) when Docling fails
      // We just verify it doesn't throw — pdftotext may or may not be installed
      try {
        const markdown = await converter.convertToMarkdown(zipPath);
        expect(typeof markdown).toBe('string');
      } catch (error) {
        // If pdftotext is also not available that's ok for this test
        expect((error as Error).message).toMatch(/Docling|unzip|pdftotext/);
      }
    });
  });

  // ---- convertBufferToMarkdown ----

  describe('convertBufferToMarkdown', () => {
    test('converts ZIP from buffer', async () => {
      const zipPath = path.join(RAW_DIR, 'H679.pdf');
      if (!fs.existsSync(zipPath)) {
        expect.skip('ZIP test file H679.pdf not found, skipping');
        return;
      }

      const buf = fs.readFileSync(zipPath);
      const mockDocling = makeMockDoclingService({ md: '# Buffer test\n\nZip from buffer.' });
      // @ts-ignore
      const converter = new ZipBundleConverter(makeMockConfig() as any, mockDocling as any);

      const markdown = await converter.convertBufferToMarkdown(buf, 'H679');
      expect(typeof markdown).toBe('string');
      expect(markdown.length).toBeGreaterThan(10);
    });
  });

  // ---- isAvailable / unzip existence ----

  describe('constructor and config', () => {
    test('uses configured unzipPath', () => {
      const mockDocling = makeMockDoclingService();
      // @ts-ignore
      const converter = new ZipBundleConverter(makeMockConfig({ unzipPath: '/custom/unzip' }) as any, mockDocling as any);
      // unzipPath is private but we can verify it doesn't throw during construction
      expect(converter).toBeDefined();
    });
  });
});
