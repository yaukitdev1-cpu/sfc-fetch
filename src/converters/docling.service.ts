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

    // Docling's --output expects a DIRECTORY, not a file path.
    // It creates a file named after the input PDF inside that directory.
    // e.g., input.pdf -> outputDir/input.pdf.md
    const inputBasename = path.basename(pdfPath, path.extname(pdfPath));
    const expectedOutputFile = path.join(tempDir, `${inputBasename}.md`);

    try {
      await this.runDocling(pdfPath, tempDir);

      if (!(await fs.pathExists(expectedOutputFile))) {
        // Fallback: look for any .md file in the output directory
        const files = await fs.readdir(tempDir);
        const mdFile = files.find(f => f.endsWith('.md'));
        if (!mdFile) {
          throw new Error(`Docling conversion failed - no output file generated at ${expectedOutputFile}`);
        }
        const content = await fs.readFile(path.join(tempDir, mdFile), 'utf8');
        return content as string;
      }

      const content = await fs.readFile(expectedOutputFile, 'utf8');
      return content as string;
    } finally {
      // Cleanup temp directory
      await fs.remove(tempDir).catch(() => {});
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
