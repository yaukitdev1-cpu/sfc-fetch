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
  }): Promise<any[]> {
    await this.throttle();
    const url = `${this.baseUrl}/api/circulars/search`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Failed to search circulars: ${response.statusText}`);
    }

    return (await response.json()) as any[];
  }

  async getCircular(refNo: string): Promise<any> {
    await this.throttle();
    const url = `${this.baseUrl}/api/circulars/${refNo}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get circular ${refNo}: ${response.statusText}`);
    }

    return response.json();
  }

  async getCircularPdf(refNo: string): Promise<Buffer> {
    await this.throttle();
    const url = `${this.baseUrl}/api/circulars/${refNo}/pdf`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download PDF for ${refNo}: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async getCircularHtml(refNo: string): Promise<string> {
    await this.throttle();
    const url = `${this.baseUrl}/api/circulars/${refNo}/html`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get HTML for ${refNo}: ${response.statusText}`);
    }

    return response.text();
  }
}
