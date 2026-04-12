import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class DoclingService {
  private doclingPath: string;
  private timeout: number;

  constructor(private configService: ConfigService) {
    this.doclingPath = this.configService.get<string>('doclingPath') || '/usr/local/bin/docling';
    this.timeout = this.configService.get<number>('doclingTimeout') || 30000;
  }

  async convertPdfToMarkdown(pdfPath: string): Promise<string> {
    // Check if docling is available
    const doclingExists = await fs.pathExists(this.doclingPath);

    if (!doclingExists) {
      throw new Error(`Docling not found at ${this.doclingPath}. Please install Docling CLI.`);
    }

    const tempDir = path.join(os.tmpdir(), `docling-${Date.now()}`);
    await fs.ensureDir(tempDir);

    const outputPath = path.join(tempDir, 'output.md');

    try {
      await this.runDocling(pdfPath, outputPath);

      if (!(await fs.pathExists(outputPath))) {
        throw new Error('Docling conversion failed - no output file generated');
      }

      const content = await fs.readFile(outputPath, 'utf8');
      return content as string;
    } finally {
      // Cleanup temp directory
      await fs.remove(tempDir);
    }
  }

  private runDocling(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Docling outputs to a directory and creates a file named after the input
      // Use the docling CLI directly
      const proc = spawn(this.doclingPath, [
        inputPath,
        '--to',
        'md',
        '--output',
        outputPath,
      ], {
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
          resolve();
        } else {
          reject(new Error(`Docling failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  isAvailable(): boolean {
    try {
      return fs.existsSync(this.doclingPath);
    } catch {
      return false;
    }
  }
}
