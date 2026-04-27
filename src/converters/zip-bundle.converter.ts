import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { DoclingService } from './docling.service';

@Injectable()
export class ZipBundleConverter {
  private unzipPath: string;
  private timeout: number;

  constructor(
    private configService: ConfigService,
    private doclingService: DoclingService,
  ) {
    this.unzipPath = this.configService.get<string>('unzipPath') || '/usr/bin/unzip';
    this.timeout = this.configService.get<number>('unzipTimeout') || 60000;
  }

  /**
   * Convert a ZIP bundle (e.g. OOXML .docx, .xlsx, or SFC's ZIP-wrapped PDF bundle)
   * by unzipping and finding the main PDF for Docling conversion.
   */
  async convertToMarkdown(filePath: string): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      const tempDir = path.join(os.tmpdir(), `zip_bundle_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      let stdout = '';
      let stderr = '';

      try {
        await fs.ensureDir(tempDir);

        const proc = spawn(this.unzipPath, ['-o', filePath, '-d', tempDir], {
          timeout: this.timeout,
        });

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', async (code) => {
          if (code !== 0 && code !== 2) {
            // unzip returns 2 for some non-fatal conditions (e.g. zipfile is multi-part)
            await fs.remove(tempDir).catch(() => {});
            return reject(new Error(`unzip failed with code ${code}: ${stderr}`));
          }

          try {
            const pdfPath = await this.findMainPdf(tempDir);
            if (!pdfPath) {
              await fs.remove(tempDir).catch(() => {});
              return reject(new Error(`No PDF found in ZIP bundle: ${filePath}`));
            }

            const markdown = await this.doclingService.convertPdfToMarkdown(pdfPath);
            await fs.remove(tempDir).catch(() => {});
            resolve(markdown);
          } catch (err) {
            await fs.remove(tempDir).catch(() => {});
            reject(err);
          }
        });

        proc.on('error', async (err) => {
          await fs.remove(tempDir).catch(() => {});
          reject(err);
        });
      } catch (err) {
        await fs.remove(tempDir).catch(() => {});
        reject(err);
      }
    });
  }

  /**
   * Find the "main" PDF in an extracted ZIP bundle.
   * Strategy:
   *  1. Look for document.pdf / doc.pdf / main.pdf (case-insensitive)
   *  2. Otherwise pick the largest .pdf in the root or immediate subdirs
   */
  private async findMainPdf(dir: string): Promise<string | null> {
    const candidates: string[] = [];

    const scan = async (d: string, depth = 0): Promise<void> => {
      if (depth > 2) return; // Don't recurse too deep
      const entries = await fs.readdir(d);
      for (const entry of entries) {
        const full = path.join(d, entry);
        const stat = await fs.stat(full);
        if (stat.isDirectory()) {
          await scan(full, depth + 1);
        } else if (entry.toLowerCase() === 'document.pdf' ||
                   entry.toLowerCase() === 'doc.pdf' ||
                   entry.toLowerCase() === 'main.pdf') {
          candidates.unshift(full); // Prioritise named files
        } else if (entry.toLowerCase().endsWith('.pdf')) {
          candidates.push(full);
        }
      }
    };

    await scan(dir);

    if (candidates.length === 0) return null;

    // If there are prioritized candidates, pick the first
    const prioritised = candidates.filter(c => {
      const base = path.basename(c).toLowerCase();
      return ['document.pdf', 'doc.pdf', 'main.pdf'].includes(base);
    });
    if (prioritised.length > 0) return prioritised[0];

    // Otherwise pick the largest PDF (most content)
    let largest: string | null = null;
    let largestSize = 0;
    for (const c of candidates) {
      const size = (await fs.stat(c)).size;
      if (size > largestSize) {
        largestSize = size;
        largest = c;
      }
    }
    return largest;
  }

  /**
   * Convert ZIP from a Buffer, writing to a temp file since unzip needs a path.
   */
  async convertBufferToMarkdown(buffer: Buffer, refNo: string): Promise<string> {
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `zip_bundle_${refNo}_${Date.now()}.zip`);
    try {
      await fs.writeFile(tempFile, buffer);
      return await this.convertToMarkdown(tempFile);
    } finally {
      await fs.remove(tempFile).catch(() => {});
    }
  }
}
