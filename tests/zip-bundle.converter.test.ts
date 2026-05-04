import { describe, it, expect, beforeEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs-extra';
import { ZipBundleConverter } from '../src/converters/zip-bundle.converter';
import { ConfigService } from '@nestjs/config';

describe('ZipBundleConverter', () => {
  let converter: ZipBundleConverter;

  beforeEach(() => {
    const mockConfigService = {
      get: (key: string) => {
        const config: Record<string, string> = {
          doclingPath: '/usr/local/bin/docling',
          doclingTimeout: '30000',
        };
        return config[key];
      },
    } as any;
    converter = new ZipBundleConverter(mockConfigService);
  });

  it('should extract and convert main PDF from ZIP bundle', async () => {
    const zipPath = path.join(process.cwd(), 'data/raw/circulars/H644.pdf');
    const exists = await fs.pathExists(zipPath);
    if (!exists) {
      console.log('H644.pdf not found — skipping ZIP test');
      return;
    }

    const result = await converter.convert(zipPath, 'H644');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  }, { timeout: 30000 });

  it('should handle non-existent ZIP file gracefully', async () => {
    await expect(converter.convert('/nonexistent.zip', 'TEST')).rejects.toThrow();
  });
});
