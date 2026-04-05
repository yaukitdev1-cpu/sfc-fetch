import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { QueueService } from './queue.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [WorkflowService, QueueService],
  exports: [WorkflowService, QueueService],
})
export class WorkflowModule {}
