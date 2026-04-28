import { Module } from '@nestjs/common';
import { TurndownServiceImpl } from './turndown.service';
import { DoclingService } from './docling.service';
import { FormatDetectorService } from './format-detector.service';

@Module({
  providers: [TurndownServiceImpl, DoclingService, FormatDetectorService],
  exports: [TurndownServiceImpl, DoclingService, FormatDetectorService],
})
export class ConvertersModule {}
