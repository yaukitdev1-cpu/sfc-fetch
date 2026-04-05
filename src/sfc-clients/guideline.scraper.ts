import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';

@Injectable()
export class GuidelineScraper {
  private baseUrl: string;
  private lastRequest = 0;
  private minInterval = 500;

  constructor(private configService: ConfigService) {
    this.baseUrl = 'https://www.sfc.hk';
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    if (timeSinceLastRequest < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastRequest));
    }
    this.lastRequest = Date.now();
  }

  async getGuidelinesList(): Promise<any[]> {
    await this.throttle();
    const url = `${this.baseUrl}/en/Intermediaries/guidelines`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch guidelines list: ${response.statusText}`);
    }

    const html = await response.text();
    return this.parseGuidelinesTable(html);
  }

  private parseGuidelinesTable(html: string): any[] {
    const $ = cheerio.load(html);
    const guidelines: any[] = [];

    $('table.guidelines-table tbody tr').each((_, row) => {
      const $row = $(row);
      const cells = $row.find('td');

      if (cells.length >= 3) {
        const refNo = $(cells[0]).text().trim();
        const title = $(cells[1]).text().trim();
        const effectiveDate = $(cells[2]).text().trim();

        const link = $row.find('a').attr('href');

        if (refNo && title) {
          guidelines.push({
            refNo,
            title,
            effectiveDate,
            url: link ? `${this.baseUrl}${link}` : null,
          });
        }
      }
    });

    return guidelines;
  }

  async getGuidelineDetail(refNo: string): Promise<any> {
    await this.throttle();
    const url = `${this.baseUrl}/en/Intermediaries/guidelines/${refNo}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch guideline ${refNo}: ${response.statusText}`);
    }

    const html = await response.text();
    return this.parseGuidelineDetail(html, refNo);
  }

  private parseGuidelineDetail(html: string, refNo: string): any {
    const $ = cheerio.load(html);

    return {
      refNo,
      title: $('h1.guideline-title').text().trim(),
      content: $('div.guideline-content').html(),
      effectiveDate: $('meta[name="effective-date"]').attr('content'),
      lastUpdated: $('meta[name="last-updated"]').attr('content'),
      versions: this.parseVersionHistory($),
    };
  }

  private parseVersionHistory($: cheerio.CheerioAPI): any[] {
    const versions: any[] = [];

    $('ul.version-history li').each((_, el) => {
      const $el = $(el);
      const date = $el.find('.version-date').text().trim();
      const link = $el.find('a').attr('href');

      if (date) {
        versions.push({
          date,
          url: link ? `${this.baseUrl}${link}` : null,
        });
      }
    });

    return versions;
  }

  async downloadGuidelinePdf(pdfUrl: string): Promise<Buffer> {
    await this.throttle();
    const response = await fetch(pdfUrl);

    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
