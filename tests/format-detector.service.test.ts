import { describe, test, expect, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FormatDetector, FileFormat } from '../src/converters/format-detector';

const RAW_DIR = path.join(__dirname, '../data/raw/circulars');

function tmpPath(ext: string): string {
  return path.join(os.tmpdir(), `fmt_test_${Date.now()}.${ext}`);
}

describe('FormatDetector', () => {
  let detector: FormatDetector;

  beforeEach(() => {
    detector = new FormatDetector();
  });

  test('detects OLE2 magic bytes', async () => {
    const ole2Path = path.join(RAW_DIR, 'H357.pdf');
    if (!fs.existsSync(ole2Path)) return;
    const format = await detector.detectFormat(ole2Path);
    expect(format).toBe(FileFormat.OLE2);
  });

  test('detects ZIP magic bytes', async () => {
    const zipPath = path.join(RAW_DIR, 'H644.pdf');
    if (!fs.existsSync(zipPath)) return;
    const format = await detector.detectFormat(zipPath);
    expect(format).toBe(FileFormat.ZIP);
  });

  test('detects PDF magic bytes from buffer', () => {
    const buf = Buffer.from('%PDF-1.4');
    expect(detector.detectFormatFromBuffer(buf)).toBe(FileFormat.PDF);
  });

  test('detects OLE2 from buffer', () => {
    const buf = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(detector.detectFormatFromBuffer(buf)).toBe(FileFormat.OLE2);
  });

  test('detects ZIP from buffer', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    expect(detector.detectFormatFromBuffer(buf)).toBe(FileFormat.ZIP);
  });

  test('returns UNKNOWN for unrecognized format', () => {
    const buf = Buffer.from('hello world');
    expect(detector.detectFormatFromBuffer(buf)).toBe(FileFormat.UNKNOWN);
  });

  test('writes and reads back a test file', async () => {
    const testPath = tmpPath('bin');
    fs.writeFileSync(testPath, Buffer.from([0x00, 0x01, 0x02]));
    const format = await detector.detectFormat(testPath);
    expect(format).toBe(FileFormat.UNKNOWN);
    fs.unlinkSync(testPath);
  });
});
