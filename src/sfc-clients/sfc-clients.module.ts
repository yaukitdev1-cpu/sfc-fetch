import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CircularClient } from './circular.client';
import { ConsultationClient } from './consultation.client';
import { NewsClient } from './news.client';
import { GuidelineScraper } from './guideline.scraper';

@Module({
  imports: [ConfigModule],
  providers: [CircularClient, ConsultationClient, NewsClient, GuidelineScraper],
  exports: [CircularClient, ConsultationClient, NewsClient, GuidelineScraper],
})
export class SfcClientsModule {}
