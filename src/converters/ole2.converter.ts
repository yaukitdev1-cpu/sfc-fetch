import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class Ole2Converter {
  private antiwordPath: string;
  private timeout: number;

  constructor(private configService: ConfigService) {
    this.antiwordPath = this.configService.get<string>('antiwordPath') || '/usr/bin/antiword';
    this.timeout = this.configService.get<number>('antiwordTimeout') || 30000;
  }

  async convertToMarkdown(filePath: string): Promise<string> {
    const antiwordExists = await fs.pathExists(this.antiwordPath);
    if (!antiwordExists) {
      throw new Error(`antiword not found at ${this.antiwordPath}. Install with: sudo apt-get install antiword`);
    }

    return new Promise<string>((resolve, reject) => {
      const proc = spawn(this.antiwordPath, ['-w', '0', filePath], {
        timeout: this.timeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout || '# OLE2 document\n\nNo text content extracted.');
        } else if (code === 1) {
          // Exit code 1 with stderr means it couldn't decode the file
          reject(new Error(`antiword could not decode the file (exit 1): ${stderr || 'unknown error'}`));
        } else {
          reject(new Error(`antiword failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Convert OLE2 from a Buffer, writing to a temp file since antiword needs a path.
   */
  async convertBufferToMarkdown(buffer: Buffer, refNo: string): Promise<string> {
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `ole2_${refNo}_${Date.now()}.doc`);
    try {
      await fs.writeFile(tempFile, buffer);
      const result = await this.convertToMarkdown(tempFile);
      return result;
    } finally {
      await fs.remove(tempFile).catch(() => {});
    }
  }

  isAvailable(): boolean {
    try {
      return fs.existsSync(this.antiwordPath);
    } catch {
      return false;
    }
  }
}
