import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NewsClient {
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

  async searchNews(params: {
    year?: number;
    month?: number;
    limit?: number;
    lang?: string;
    category?: string;
    pageNo?: number;
    pageSize?: number;
  }): Promise<any[]> {
    await this.throttle();
    const url = `${this.baseUrl}/api/news/search`;
    const body = {
      lang: params.lang || 'EN',
      category: params.category || 'all',
      year: params.year || 'all',
      month: params.month ?? 'all',
      pageNo: params.pageNo ?? 0,
      pageSize: params.pageSize || params.limit || 20,
      sort: { field: 'issueDate', order: 'desc' },
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to search news: ${response.statusText}`);
    }

    const data = await response.json() as { items?: any[] };
    return data.items || [];
  }

  async getNews(refNo: string, lang: string = 'EN'): Promise<any> {
    await this.throttle();
    // Use the content API to get full news details
    const url = `${this.baseUrl}/api/news/content?refNo=${encodeURIComponent(refNo)}&lang=${lang}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get news ${refNo}: ${response.statusText}`);
    }

    return response.json() as any;
  }

  async getNewsContent(refNo: string, lang: string = 'EN'): Promise<string> {
    await this.throttle();
    const url = `${this.baseUrl}/api/news/content?refNo=${encodeURIComponent(refNo)}&lang=${lang}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get news content ${refNo}: ${response.statusText}`);
    }

    const data = await response.json() as { html?: string };
    return data.html || '';
  }
}
