import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WorkflowService } from './workflow.service';
import { QueueService } from './queue.service';
import { DatabaseModule } from '../database/database.module';
import { SfcClientsModule } from '../sfc-clients/sfc-clients.module';
import { ConvertersModule } from '../converters/converters.module';
import { ContentService } from '../services/content.service';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    SfcClientsModule,
    ConvertersModule,
  ],
  providers: [WorkflowService, QueueService, ContentService],
  exports: [WorkflowService, QueueService],
})
export class WorkflowModule {}
