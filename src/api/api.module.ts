import { Module, Global, UseGuards, RateLimit } from '@nestjs/common';
import { CircularsController } from './circulars.controller';
import { GuidelinesController } from './guidelines.controller';
import { ConsultationsController } from './consultations.controller';
import { NewsController } from './news.controller';
import { WorkflowsController } from './workflows.controller';
import { HealthController } from './health.controller';
import { BackupModule } from '../backup/backup.module';
import { WorkflowModule } from '../workflows/workflow.module';
import { ContentService } from '../services/content.service';
import { PassportModule } from '@nestjs/passport';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { ConfigService } from '@nestjs/config';

// OWASP A05: Security Misconfiguration - Global security guards
const GlobalAuthGuard = () => UseGuards(AuthGuard('jwt'), RolesGuard);
const GlobalRateLimit = () => RateLimit({ limit: 100, windowMs: 60000 });

@Global()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
@Module({
  imports: [
    BackupModule,
    WorkflowModule,
    PassportModule.register({ defaultStrategy: 'jwt' })
  ],
  controllers: [
    CircularsController,
    GuidelinesController,
    ConsultationsController,
    NewsController,
    WorkflowsController,
    HealthController,
  ],
  providers: [
    ContentService,
    AuthGuard,
    RolesGuard,
    ConfigService
  ],
  exports: [AuthGuard, RolesGuard]
})
export class ApiModule {}
