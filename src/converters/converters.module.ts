import { Module } from '@nestjs/common';
import { TurndownServiceImpl } from './turndown.service';
import { DoclingService } from './docling.service';

@Module({
  providers: [TurndownServiceImpl, DoclingService],
  exports: [TurndownServiceImpl, DoclingService],
})
export class ConvertersModule {}
