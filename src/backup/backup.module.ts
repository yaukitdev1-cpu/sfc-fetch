import { Module } from '@nestjs/common';
import { BackupService } from './backup.service';
import { GitService } from './git.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [BackupService, GitService],
  exports: [BackupService, GitService],
})
export class BackupModule {}
