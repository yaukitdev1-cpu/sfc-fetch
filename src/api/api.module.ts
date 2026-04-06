import { Module } from '@nestjs/common';
import { CircularsController } from './circulars.controller';
import { GuidelinesController } from './guidelines.controller';
import { ConsultationsController } from './consultations.controller';
import { NewsController } from './news.controller';
import { WorkflowsController } from './workflows.controller';
import { HealthController } from './health.controller';
import { QueueController } from './queue.controller';
import { BackupController } from './backup.controller';
import { BackupModule } from '../backup/backup.module';
import { WorkflowModule } from '../workflows/workflow.module';
import { SfcClientsModule } from '../sfc-clients/sfc-clients.module';
import { ContentService } from '../services/content.service';

@Module({
  imports: [BackupModule, WorkflowModule, SfcClientsModule],
  controllers: [
    CircularsController,
    GuidelinesController,
    ConsultationsController,
    NewsController,
    WorkflowsController,
    HealthController,
    QueueController,
    BackupController,
  ],
  providers: [ContentService],
})
export class ApiModule {}
