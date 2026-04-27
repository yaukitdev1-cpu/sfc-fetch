import { describe, test, expect, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { Ole2Converter } from '../src/converters/ole2.converter';

const RAW_DIR = path.join(__dirname, '../data/raw/circulars');

// ---------------------------------------------------------------------------
// Mock config service
// ---------------------------------------------------------------------------
function makeMockConfig(overrides: Record<string, string | number> = {}) {
  return {
    get: (key: string) => {
      const defaults: Record<string, string | number> = {
        antiwordPath: '/usr/bin/antiword',
        antiwordTimeout: 30000,
        ...overrides,
      };
      return defaults[key];
    },
  };
}

// ---------------------------------------------------------------------------
// Ole2Converter
// ---------------------------------------------------------------------------

describe('Ole2Converter', () => {
  let converter: Ole2Converter;

  beforeEach(() => {
    converter = new Ole2Converter(makeMockConfig() as any);
  });

  // ---- constructor ----

  describe('constructor', () => {
    test('sets antiwordPath from config', () => {
      const c = new Ole2Converter(makeMockConfig({ antiwordPath: '/custom/antiword' }) as any);
      expect(c.antiwordPath).toBe('/custom/antiword');
    });

    test('sets timeout from config', () => {
      const c = new Ole2Converter(makeMockConfig({ antiwordTimeout: 60000 }) as any);
      expect(c.timeout).toBe(60000);
    });
  });

  // ---- isAvailable ----

  describe('isAvailable', () => {
    test('returns true when antiword exists at configured path', () => {
      const result = converter.isAvailable();
      expect(typeof result).toBe('boolean');
    });

    test('returns false for non-existent path', () => {
      const c = new Ole2Converter(makeMockConfig({ antiwordPath: '/nonexistent/antiword' }) as any);
      expect(c.isAvailable()).toBe(false);
    });
  });

  // ---- convertToMarkdown ----

  describe('convertToMarkdown', () => {
    test('converts a real OLE2 .doc file to markdown', async () => {
      const ole2Path = path.join(RAW_DIR, 'H444.pdf');
      if (!fs.existsSync(ole2Path)) {
        expect.skip('OLE2 test file H444.pdf not found, skipping');
        return;
      }

      const markdown = await converter.convertToMarkdown(ole2Path);
      expect(typeof markdown).toBe('string');
      expect(markdown.length).toBeGreaterThan(100);
      // antiword prepends the text directly (no markdown wrapper expected)
      expect(markdown).toContain('SFO'); // Our Ref: SFO/IS/021/2006
    });

    test('produces meaningful word count from real OLE2', async () => {
      const ole2Path = path.join(RAW_DIR, 'H357.pdf');
      if (!fs.existsSync(ole2Path)) {
        expect.skip('OLE2 test file H357.pdf not found, skipping');
        return;
      }

      const markdown = await converter.convertToMarkdown(ole2Path);
      const words = markdown.split(/\s+/).filter(Boolean);
      expect(words.length).toBeGreaterThan(1000);
    });

    test('rejects non-existent file path', async () => {
      try {
        await converter.convertToMarkdown('/nonexistent/file.doc');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('antiword');
      }
    });

    test('rejects when antiword not found', async () => {
      const c = new Ole2Converter(makeMockConfig({ antiwordPath: '/nonexistent/antiword' }) as any);
      try {
        await c.convertToMarkdown(path.join(RAW_DIR, 'H444.pdf'));
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('antiword not found');
      }
    });
  });

  // ---- convertBufferToMarkdown ----

  describe('convertBufferToMarkdown', () => {
    test('converts OLE2 from buffer', async () => {
      const ole2Path = path.join(RAW_DIR, 'H463.pdf');
      if (!fs.existsSync(ole2Path)) {
        expect.skip('OLE2 test file H463.pdf not found, skipping');
        return;
      }

      const buf = fs.readFileSync(ole2Path);
      const markdown = await converter.convertBufferToMarkdown(buf, 'H463');
      expect(typeof markdown).toBe('string');
      expect(markdown.length).toBeGreaterThan(50);
    });

    test('handles small OLE2 file', async () => {
      const ole2Path = path.join(RAW_DIR, 'H463.pdf');
      if (!fs.existsSync(ole2Path)) {
        expect.skip('OLE2 test file H463.pdf not found, skipping');
        return;
      }

      const buf = fs.readFileSync(ole2Path);
      const markdown = await converter.convertBufferToMarkdown(buf, 'tiny');
      const words = markdown.split(/\s+/).filter(Boolean);
      expect(words.length).toBeGreaterThan(10);
    });
  });
});
