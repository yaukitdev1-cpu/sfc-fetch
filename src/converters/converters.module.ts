import { Module } from '@nestjs/common';
import { TurndownServiceImpl } from './turndown.service';
import { DoclingService } from './docling.service';
import { FormatDetector } from './format-detector';
import { Ole2Converter } from './ole2.converter';
import { ZipBundleConverter } from './zip-bundle.converter';

@Module({
  providers: [TurndownServiceImpl, DoclingService, FormatDetector, Ole2Converter, ZipBundleConverter],
  exports: [TurndownServiceImpl, DoclingService, FormatDetector, Ole2Converter, ZipBundleConverter],
})
export class ConvertersModule {}
