import { Module } from '@nestjs/common';
import { TurndownServiceImpl } from './turndown.service';
import { DoclingService } from './docling.service';
import { FormatDetectorService } from './format-detector.service';
import { OleDocConverter } from './ole-doc.converter';
import { ZipBundleConverter } from './zip-bundle.converter';

@Module({
  providers: [
    TurndownServiceImpl,
    DoclingService,
    FormatDetectorService,
    OleDocConverter,
    ZipBundleConverter,
  ],
  exports: [
    TurndownServiceImpl,
    DoclingService,
    FormatDetectorService,
    OleDocConverter,
    ZipBundleConverter,
  ],
})
export class ConvertersModule {}
