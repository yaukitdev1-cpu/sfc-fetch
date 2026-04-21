import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ConsultationClient {
  private baseUrl: string;
  private lastRequest = 0;
  private minInterval = 500;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('sfcBaseUrl') || 'https://apps.sfc.hk/edistributionWeb';
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    if (timeSinceLastRequest < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastRequest));
    }
    this.lastRequest = Date.now();
  }

  async searchConsultations(params: {
    year?: number;
    status?: 'open' | 'closed' | 'concluded';
    limit?: number;
    lang?: string;
    category?: string;
    pageNo?: number;
    pageSize?: number;
  }): Promise<any[]> {
    await this.throttle();
    const url = `${this.baseUrl}/api/consultation/search`;
    const body = {
      lang: params.lang || 'EN',
      category: params.category || '',
      year: params.year?.toString() || 'all',
      pageNo: params.pageNo ?? 0,
      pageSize: params.pageSize || params.limit || 50,
      isLoading: true,
      errors: null,
      items: null,
      total: -1,
      sort: { field: 'cpIssueDate', order: 'desc' },
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to search consultations: ${response.statusText}`);
    }

    const data = await response.json() as { items?: any[] };
    return data.items || [];
  }

  async getConsultation(refNo: string, lang: string = 'EN'): Promise<any> {
    await this.throttle();
    const url = `${this.baseUrl}/api/consultation/content?refNo=${encodeURIComponent(refNo)}&lang=${lang}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get consultation ${refNo}: ${response.statusText}`);
    }

    return response.json() as any;
  }

  async getConsultationPdf(refNo: string, lang: string = 'EN'): Promise<Buffer | null> {
    await this.throttle();
    const url = `${this.baseUrl}/api/consultation/openFile?lang=${lang}&refNo=${encodeURIComponent(refNo)}`;
    const response = await fetch(url);

    if (response.status === 404) {
      return null; // PDF not available for this document
    }

    if (!response.ok) {
      throw new Error(`Failed to download consultation PDF: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      return null;
    }
    return buffer;
  }

  async getConclusionPdf(refNo: string, lang: string = 'EN'): Promise<Buffer | null> {
    await this.throttle();
    const url = `${this.baseUrl}/api/consultation/openFile?lang=${lang}&refNo=${encodeURIComponent(refNo)}&type=conclusion`;
    const response = await fetch(url);

    if (response.status === 404) {
      return null; // Conclusion not yet published
    }

    if (!response.ok) {
      throw new Error(`Failed to download conclusion PDF: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      return null;
    }
    return buffer;
  }

  /**
   * Check what assets are available for a consultation without downloading them.
   * Returns info about PDF availability, conclusion availability, and HTML content.
   */
  async checkConsultationAssets(refNo: string, lang: string = 'EN'): Promise<{
    hasPdf: boolean;
    hasConclusion: boolean;
    hasHtml: boolean;
    html?: string;
  }> {
    const content = await this.getConsultation(refNo, lang);
    return {
      hasPdf: content.fileKeySeq != null && content.fileKeySeq > 0,
      hasConclusion: content.ccRefNo != null,
      hasHtml: !!(content.html && content.html.length > 0),
      html: content.html,
    };
  }
}
