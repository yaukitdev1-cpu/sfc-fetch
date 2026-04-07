import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CircularClient {
  private baseUrl: string;
  private lastRequest = 0;
  private minInterval = 500; // 2 requests per second = 500ms between requests

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

  async searchCirculars(params: {
    year?: number;
    refNo?: string;
    limit?: number;
    lang?: string;
    category?: string;
    pageNo?: number;
    pageSize?: number;
  }): Promise<any[]> {
    await this.throttle();
    const url = `${this.baseUrl}/api/circular/search`;
    const body = {
      lang: params.lang || 'EN',
      category: params.category || 'all',
      year: params.year || 2025,
      pageNo: params.pageNo ?? 0,
      pageSize: params.pageSize || params.limit || 100,
      sort: { field: 'issueDate', order: 'desc' },
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to search circulars: ${response.statusText}`);
    }

    const data = await response.json() as { items?: any[] };
    return data.items || [];
  }

  async getCircular(refNo: string, lang: string = 'EN'): Promise<any> {
    await this.throttle();
    const url = `${this.baseUrl}/api/circular/content?refNo=${encodeURIComponent(refNo)}&lang=${lang}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get circular ${refNo}: ${response.statusText}`);
    }

    return response.json() as any;
  }

  async getCircularPdf(refNo: string, lang: string = 'EN'): Promise<Buffer> {
    await this.throttle();
    const url = `${this.baseUrl}/api/circular/openFile?lang=${lang}&refNo=${encodeURIComponent(refNo)}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download PDF for ${refNo}: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async getCircularHtml(refNo: string, lang: string = 'EN'): Promise<string> {
    await this.throttle();
    const url = `${this.baseUrl}/api/circular/content?refNo=${encodeURIComponent(refNo)}&lang=${lang}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get HTML for ${refNo}: ${response.statusText}`);
    }

    const data = await response.json() as { html?: string };
    return data.html || '';
  }
}
