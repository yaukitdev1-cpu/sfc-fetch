import { describe, it, expect, beforeEach } from 'bun:test';
import * as fs from 'fs-extra';
import * as path from 'path';
import { FormatDetectorService, FileFormat } from '../src/converters/format-detector.service';

describe('FormatDetectorService', () => {
  let service: FormatDetectorService;

  beforeEach(() => {
    service = new FormatDetectorService();
  });

  it('should detect OLE2 magic bytes', async () => {
    // H357.pdf is actually an OLE2 .doc file
    const ole2Path = path.join(process.cwd(), 'data/raw/circulars/H357.pdf');
    if (!(await fs.pathExists(ole2Path))) return;
    const format = await service.detectFormat(ole2Path);
    expect(format).toBe(FileFormat.OLE2);
  });

  it('should detect ZIP magic bytes', async () => {
    // H644.pdf is actually a ZIP bundle
    const zipPath = path.join(process.cwd(), 'data/raw/circulars/H644.pdf');
    if (!(await fs.pathExists(zipPath))) return;
    const format = await service.detectFormat(zipPath);
    expect(format).toBe(FileFormat.ZIP);
  });

  it('should detect PDF magic bytes', async () => {
    // Find a real PDF in raw
    const rawDir = path.join(process.cwd(), 'data/raw/circulars');
    if (!(await fs.pathExists(rawDir))) return;

    // Create a real PDF for testing (just %PDF header)
    const testPdfPath = path.join(process.cwd(), 'data/raw/circulars/__test__.pdf');
    await fs.writeFile(testPdfPath, Buffer.from('%PDF-1.4'));
    const format = await service.detectFormat(testPdfPath);
    expect(format).toBe(FileFormat.PDF);
    await fs.remove(testPdfPath);
  });

  it('should return UNKNOWN for unrecognized formats', async () => {
    const unknownPath = path.join(process.cwd(), 'data/raw/circulars/__test__.unknown');
    await fs.writeFile(unknownPath, 'random content');
    const format = await service.detectFormat(unknownPath);
    expect(format).toBe(FileFormat.UNKNOWN);
    await fs.remove(unknownPath);
  });

  it('should detect format from buffer directly', () => {
    const ole2Buf = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(service.detectFormatFromBuffer(ole2Buf)).toBe(FileFormat.OLE2);

    const zipBuf = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    expect(service.detectFormatFromBuffer(zipBuf)).toBe(FileFormat.ZIP);

    const pdfBuf = Buffer.from('%PDF');
    expect(service.detectFormatFromBuffer(pdfBuf)).toBe(FileFormat.PDF);
  });
});
