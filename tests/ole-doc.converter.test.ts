import { describe, it, expect, beforeEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs-extra';
import { OleDocConverter } from '../src/converters/ole-doc.converter';

describe('OleDocConverter', () => {
  let converter: OleDocConverter;

  beforeEach(() => {
    converter = new OleDocConverter();
  });

  it('should report availability of antiword', () => {
    const available = converter.isAvailable();
    // Only test if antiword is installed
    if (!available) console.log('antiword not installed — skipping conversion test');
    expect(typeof available).toBe('boolean');
  });

  it('should throw for non-existent files', async () => {
    if (!converter.isAvailable()) return;
    await expect(converter.convert('/nonexistent/file.doc')).rejects.toThrow();
  });

  it('should convert H357.pdf (actually OLE2 .doc)', async () => {
    if (!converter.isAvailable()) return;
    const ole2Path = path.join(process.cwd(), 'data/raw/circulars/H357.pdf');
    const exists = await fs.pathExists(ole2Path);
    if (!exists) return;

    // H357.pdf has .pdf extension but is actually OLE2 — format detector handles routing
    const result = await converter.convert(ole2Path);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
