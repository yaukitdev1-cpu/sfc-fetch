import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';

@Injectable()
export class GuidelineScraper {
  private readonly logger = new Logger(GuidelineScraper.name);
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
    const url = `${this.baseUrl}/en/Rules-and-standards/Codes-and-guidelines/Guidelines`;
    this.logger.log(`Fetching guidelines list from: ${url}`);

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

    // The guidelines are in a table with data-code-guideline-id attributes
    // Structure: <tr data-code-guideline-id="{UUID}" data-code-guideline-topics="{Category}">
    $('tr[data-code-guideline-id]').each((_, row) => {
      const $row = $(row);
      const guidelineId = $row.attr('data-code-guideline-id');
      const topics = $row.attr('data-code-guideline-topics');
      const cells = $row.find('td');

      if (cells.length >= 2) {
        const title = $(cells[0]).text().trim();
        const $secondCell = $(cells[1]);
        const $link = $secondCell.find('a').first();
        const effectiveDate = $link.text().trim();
        const pdfUrl = $link.attr('href');

        // Check for version history popup
        const $versionLink = $secondCell.find('a[data-popup-id]');
        const hasVersionHistory = $versionLink.length > 0;
        const popupId = $versionLink.attr('data-popup-id');

        if (guidelineId && title) {
          guidelines.push({
            refNo: guidelineId,
            guidelineId,
            topics: topics ? topics.split(',').map((t: string) => t.trim()) : [],
            title,
            effectiveDate,
            pdfUrl: pdfUrl ? (pdfUrl.startsWith('http') ? pdfUrl : `${this.baseUrl}${pdfUrl}`) : null,
            hasVersionHistory,
            popupId: hasVersionHistory ? popupId : null,
          });
        }
      }
    });

    this.logger.log(`Found ${guidelines.length} guidelines`);
    return guidelines;
  }

  async getGuidelineDetail(guidelineId: string): Promise<any> {
    // The detail page would need the UUID-based URL
    // For now, we get the detail from the list page data
    const list = await this.getGuidelinesList();
    const guideline = list.find(g => g.guidelineId === guidelineId || g.refNo === guidelineId);

    if (!guideline) {
      throw new Error(`Guideline not found: ${guidelineId}`);
    }

    // If there's version history, we need to fetch the popup content
    let versions: any[] = [];
    if (guideline.hasVersionHistory && guideline.popupId) {
      versions = await this.getVersionHistory(guideline.popupId);
    }

    return {
      refNo: guideline.guidelineId,
      guidelineId: guideline.guidelineId,
      topics: guideline.topics,
      title: guideline.title,
      effectiveDate: guideline.effectiveDate,
      pdfUrl: guideline.pdfUrl,
      html: null, // Guidelines are PDF-based, not HTML
      versions,
    };
  }

  private async getVersionHistory(popupId: string): Promise<any[]> {
    // The version history is embedded in the page as a popup div
    // We would need to fetch the page and parse the popup content
    // For now, return empty - would need more complex page parsing
    return [];
  }

  async downloadGuidelinePdf(pdfUrl: string): Promise<Buffer> {
    await this.throttle();
    if (!pdfUrl) {
      throw new Error('No PDF URL provided');
    }

    const response = await fetch(pdfUrl);

    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  // Alias methods for consistent interface with other clients
  async getGuideline(guidelineId: string): Promise<{ refNo: string; title: string; pdfUrl?: string; html?: string; topics?: string[] }> {
    try {
      const detail = await this.getGuidelineDetail(guidelineId);
      return {
        refNo: detail.guidelineId || guidelineId,
        title: detail.title,
        pdfUrl: detail.pdfUrl || undefined,
        html: detail.html,
        topics: detail.topics,
      };
    } catch (error) {
      // Fallback: try to find in list
      const list = await this.getGuidelinesList();
      const guideline = list.find(g => g.guidelineId === guidelineId || g.refNo === guidelineId);
      if (guideline) {
        return {
          refNo: guideline.guidelineId,
          title: guideline.title,
          pdfUrl: guideline.pdfUrl || undefined,
          html: undefined,
          topics: guideline.topics,
        };
      }
      throw error;
    }
  }

  async downloadPdf(pdfUrl: string): Promise<Buffer> {
    return this.downloadGuidelinePdf(pdfUrl);
  }
}
