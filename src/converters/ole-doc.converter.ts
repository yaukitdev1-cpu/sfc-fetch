import { Injectable, Logger } from '@nestjs/common';
import { execSync } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';

const ANTIWORD_PATH = '/usr/bin/antiword';

@Injectable()
export class OleDocConverter {
  private readonly logger = new Logger(OleDocConverter.name);
  private antiwordAvailable: boolean;

  constructor() {
    this.antiwordAvailable = this.checkAntiwordAvailability();
    if (!this.antiwordAvailable) {
      this.logger.warn('antiword not found — OLE2 .doc conversion will throw');
    }
  }

  private checkAntiwordAvailability(): boolean {
    try {
      execSync(`${ANTIWORD_PATH} -h`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  isAvailable(): boolean {
    return this.antiwordAvailable;
  }

  async convert(inputPath: string): Promise<string> {
    if (!this.antiwordAvailable) {
      throw new Error('antiword is not available — install with: sudo apt install antiword');
    }

    if (!fs.existsSync(inputPath)) {
      throw new Error(`File not found: ${inputPath}`);
    }

    try {
      const output = execSync(`${ANTIWORD_PATH} ${inputPath}`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      }) as string;

      // Clean form feeds and normalize line breaks
      return output
        .replace(/\x0c/g, '\n\n')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    } catch (error) {
      throw new Error(`Failed to convert OLE2 document: ${(error as Error).message}`);
    }
  }
}
