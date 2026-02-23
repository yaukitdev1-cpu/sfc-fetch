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
    limit?: number;
  }): Promise<any[]> {
    await this.throttle();
    const url = `${this.baseUrl}/api/news/search`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Failed to search news: ${response.statusText}`);
    }

    return (await response.json()) as any[];
  }

  async getNews(refNo: string): Promise<any> {
    await this.throttle();
    const url = `${this.baseUrl}/api/news/${refNo}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get news ${refNo}: ${response.statusText}`);
    }

    return response.json();
  }

  async getNewsContent(refNo: string): Promise<string> {
    await this.throttle();
    const url = `${this.baseUrl}/api/news/${refNo}/content`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get news content ${refNo}: ${response.statusText}`);
    }

    return response.text();
  }
}
