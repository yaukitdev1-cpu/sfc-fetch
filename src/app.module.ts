import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApiModule } from './api/api.module';
import { DatabaseModule } from './database/database.module';
import { WorkflowModule } from './workflows/workflow.module';
import { BackupModule } from './backup/backup.module';
import { ConvertersModule } from './converters/converters.module';
import { SfcClientsModule } from './sfc-clients/sfc-clients.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    ApiModule,
    WorkflowModule,
    BackupModule,
    ConvertersModule,
    SfcClientsModule,
  ],
})
export class AppModule {}
