import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs-extra';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { DoclingService } from './docling.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ZipBundleConverter {
  private readonly logger = new Logger(ZipBundleConverter.name);
  private doclingService: DoclingService;

  constructor(
    private configService: ConfigService,
  ) {
    this.doclingService = new DoclingService(configService);
  }

  async convert(zipPath: string, refNo: string, htmlContent?: string): Promise<string> {
    const tempDir = path.join(os.tmpdir(), `zip-conv-${Date.now()}`);
    await fs.ensureDir(tempDir);

    try {
      // Extract ZIP
      await this.extractZip(zipPath, tempDir);
      
      // Find main circular PDF
      const mainPdf = await this.findMainCircularPdf(tempDir);
      if (!mainPdf) {
        throw new Error(`No PDF found in ZIP bundle: ${zipPath}`);
      }

      this.logger.log(`Found main PDF: ${mainPdf}`);
      
      // Convert with Docling
      let markdown = await this.doclingService.convertPdfToMarkdown(mainPdf);
      const meaningfulChars = markdown.replace(/[\x00-\x1f\x7f]/g, '').replace(/\s/g, '').length;
      
      // If PDF conversion produced insufficient content and HTML is available, use HTML
      if (meaningfulChars < 50 && htmlContent) {
        this.logger.warn(`ZIP main PDF produced only ${meaningfulChars} chars, using HTML fallback`);
        markdown = this.basicHtmlToMarkdown(htmlContent);
      }
      
      return markdown;
    } finally {
      await fs.remove(tempDir).catch(() => {});
    }
  }

  private basicHtmlToMarkdown(html: string): string {
    // Simple HTML to markdown conversion
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private async extractZip(zipPath: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('unzip', ['-o', zipPath, '-d', destDir]);
      let stderr = '';
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`unzip failed: ${stderr}`));
      });
      proc.on('error', reject);
    });
  }

  private async findMainCircularPdf(dir: string): Promise<string | null> {
    const entries = fsSync.readdirSync(dir, { recursive: true }) as string[];
    const pdfs = entries.filter(e => String(e).toLowerCase().endsWith('.pdf')) as string[];
    
    if (pdfs.length === 0) return null;
    if (pdfs.length === 1) return path.join(dir, pdfs[0]);

    // Heuristic: prefer filenames containing "Circular" and "Eng" or "Chinese"
    const scored = pdfs.map(pdf => {
      const name = path.basename(pdf).toLowerCase();
      let score = 0;
      if (name.includes('circular')) score += 10;
      if (name.includes('eng') || name.includes('chinese')) score += 5;
      if (/^[1"]/.test(name)) score += 3; // starts with 1 or quote
      return { pdf, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return path.join(dir, scored[0].pdf);
  }
}
