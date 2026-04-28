import { Injectable } from '@nestjs/common';
import * as fs from 'fs-extra';

/**
 * Supported file format types detected via magic bytes.
 */
export enum FileFormat {
  ZIP = 'zip',
  OLE2 = 'ole2',
  PDF = 'pdf',
  UNKNOWN = 'unknown',
}

/**
 * Magic byte signatures for format detection.
 */
const MAGIC_BYTES: Array<{ format: FileFormat; signature: Buffer; offset?: number }> = [
  {
    format: FileFormat.ZIP,
    signature: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    offset: 0,
  },
  {
    format: FileFormat.OLE2,
    signature: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    offset: 0,
  },
  {
    format: FileFormat.PDF,
    signature: Buffer.from('%PDF'),
    offset: 0,
  },
];

@Injectable()
export class FormatDetectorService {
  /**
   * Detect the file format of a given file path by examining its magic bytes.
   *
   * @param filePath - Absolute path to the file to inspect.
   * @returns The detected FileFormat, or FileFormat.UNKNOWN if no match.
   */
  async detectFormat(filePath: string): Promise<FileFormat> {
    const header = await this.readFileHeader(filePath, 8);

    if (!header) {
      return FileFormat.UNKNOWN;
    }

    for (const { format, signature, offset = 0 } of MAGIC_BYTES) {
      const slice = header.slice(offset, offset + signature.length);
      if (slice.equals(signature)) {
        return format;
      }
    }

    return FileFormat.UNKNOWN;
  }

  /**
   * Detect the file format from a buffer's contents.
   *
   * @param buffer - Buffer containing file data.
   * @returns The detected FileFormat, or FileFormat.UNKNOWN if no match.
   */
  detectFormatFromBuffer(buffer: Buffer): FileFormat {
    for (const { format, signature, offset = 0 } of MAGIC_BYTES) {
      const slice = buffer.slice(offset, offset + signature.length);
      if (slice.equals(signature)) {
        return format;
      }
    }

    return FileFormat.UNKNOWN;
  }

  /**
   * Read the first N bytes of a file.
   *
   * @param filePath - Absolute path to the file.
   * @param length - Number of bytes to read (default 8).
   * @returns Buffer containing the header bytes, or null on error.
   */
  private async readFileHeader(filePath: string, length: number = 8): Promise<Buffer | null> {
    try {
      const fd = await fs.open(filePath, 'r');
      const { buffer } = await fd.read(Buffer.alloc(length), 0, length, 0);
      await fd.close();
      return buffer;
    } catch {
      return null;
    }
  }
}
