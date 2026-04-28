import { describe, test, expect, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { Ole2Converter } from '../src/converters/ole2.converter';

const RAW_DIR = path.join(__dirname, '../data/raw/circulars');

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

describe('Ole2Converter', () => {
  let converter: Ole2Converter;

  beforeEach(() => {
    converter = new Ole2Converter(makeMockConfig());
  });

  test('antiword availability check', async () => {
    const available = await converter.isAvailable();
    expect(typeof available).toBe('boolean');
  });

  test('throws for non-existent file', async () => {
    await expect(converter.convertToMarkdown('/nonexistent/file.doc')).rejects.toThrow();
  });

  test('converts H357.pdf (actually OLE2 .doc) to markdown', async () => {
    const ole2Path = path.join(RAW_DIR, 'H357.pdf');
    if (!fs.existsSync(ole2Path)) {
      console.log('H357.pdf not found — skipping');
      return;
    }
    const result = await converter.convertToMarkdown(ole2Path);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
