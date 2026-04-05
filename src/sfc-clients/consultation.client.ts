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
  }): Promise<any[]> {
    await this.throttle();
    const url = `${this.baseUrl}/api/consultations/search`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Failed to search consultations: ${response.statusText}`);
    }

    return (await response.json()) as any[];
  }

  async getConsultation(refNo: string): Promise<any> {
    await this.throttle();
    const url = `${this.baseUrl}/api/consultations/${refNo}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get consultation ${refNo}: ${response.statusText}`);
    }

    return response.json();
  }

  async getConsultationPdf(refNo: string): Promise<Buffer> {
    await this.throttle();
    const url = `${this.baseUrl}/api/consultations/${refNo}/pdf`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download consultation PDF: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async getConclusionPdf(refNo: string): Promise<Buffer | null> {
    await this.throttle();
    const url = `${this.baseUrl}/api/consultations/${refNo}/conclusion/pdf`;
    const response = await fetch(url);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to download conclusion PDF: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
