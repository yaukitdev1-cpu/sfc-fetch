import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import * as fs from 'fs';
import * as path from 'path';

const LOGS_DIR = path.join(process.cwd(), 'logs');
const MAX_LOG_SIZE = 100 * 1024 * 1024; // 100MB max per file
const MAX_RETAINED_FILES = 5;

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function getTimestamp(): string {
  return new Date().toISOString();
}

function rotateLogFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;

  const stats = fs.statSync(filePath);
  if (stats.size < MAX_LOG_SIZE) return;

  // Rotate existing backups
  for (let i = MAX_RETAINED_FILES - 1; i >= 1; i--) {
    const oldPath = `${filePath}.${i}`;
    const newPath = `${filePath}.${i + 1}`;
    if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
    if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
  }
  const firstBackup = `${filePath}.1`;
  if (fs.existsSync(firstBackup)) fs.unlinkSync(firstBackup);
  fs.renameSync(filePath, firstBackup);
}

// Simple file logger that wraps NestJS logger
class FileLogger {
  private logStream: fs.WriteStream;
  private errorStream: fs.WriteStream;
  private logFile: string;
  private errorFile: string;
  private shutdown = false;
  private lastRotateCheck = 0;
  private readonly ROTATE_CHECK_INTERVAL = 1000; // Check rotation every 1000 writes

  constructor() {
    ensureLogsDir();
    this.logFile = path.join(LOGS_DIR, 'app.log');
    this.errorFile = path.join(LOGS_DIR, 'app-error.log');
    rotateLogFile(this.logFile);
    rotateLogFile(this.errorFile);
    this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    this.errorStream = fs.createWriteStream(this.errorFile, { flags: 'a' });
    this.logStream.on('error', (err) => console.error('Log stream error:', err));
    this.errorStream.on('error', (err) => console.error('Error log stream error:', err));
  }

  private checkRotation() {
    this.lastRotateCheck++;
    if (this.lastRotateCheck >= this.ROTATE_CHECK_INTERVAL) {
      this.lastRotateCheck = 0;
      rotateLogFile(this.logFile);
      // Recreate streams if rotated
      if (!fs.existsSync(this.logFile)) {
        this.logStream.end();
        this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
        this.logStream.on('error', (err) => console.error('Log stream error:', err));
      }
    }
  }

  private write(stream: fs.WriteStream, level: string, message: string, context?: string) {
    if (this.shutdown) return;
    const timestamp = getTimestamp();
    const ctx = context ? `[${context}]` : '';
    const line = `${timestamp} ${level}:${ctx} ${message}\n`;
    process.stdout.write(line);
    stream.write(line);
    this.checkRotation();
  }

  log(message: string, context?: string) {
    this.write(this.logStream, 'INFO', message, context);
  }

  error(message: string, trace?: string, context?: string) {
    const timestamp = getTimestamp();
    const ctx = context ? `[${context}]` : '';
    const line = `${timestamp} ERROR:${ctx} ${message}${trace ? '\n' + trace : ''}\n`;
    process.stderr.write(line);
    this.errorStream.write(line);
    this.checkRotation();
  }

  warn(message: string, context?: string) {
    this.write(this.logStream, 'WARN', message, context);
  }

  debug(message: string, context?: string) {
    this.write(this.logStream, 'DEBUG', message, context);
  }

  verbose(message: string, context?: string) {
    this.write(this.logStream, 'VERBOSE', message, context);
  }

  async close(): Promise<void> {
    this.shutdown = true;
    return new Promise((resolve) => {
      this.logStream.on('finish', () => {
        this.errorStream.end(() => resolve());
      });
      this.logStream.end();
      // Fallback timeout in case finish event doesn't fire
      setTimeout(resolve, 1000);
    });
  }
}

async function bootstrap() {
  ensureLogsDir();

  const fileLogger = new FileLogger();
  fileLogger.log('Starting SFC-Fetch server...', 'Bootstrap');
  fileLogger.log(`Logs directory: ${LOGS_DIR}`, 'Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    {
      logger: fileLogger,
    },
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;

  console.log(`[SFC-Fetch] About to call app.init() with 30s timeout...`);
  fileLogger.log(`About to call app.init()...`, 'Bootstrap');

  // Initialize NestJS with timeout
  const initPromise = app.init();
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      console.log(`[SFC-Fetch] WARNING: app.init() timeout after 30s`);
      fileLogger.warn(`app.init() timed out after 30s, forcing continue`, 'Bootstrap');
      resolve();
    }, 30000);
  });

  await Promise.race([initPromise, timeoutPromise]);
  console.log(`[SFC-Fetch] app.init() completed or timed out`);
  fileLogger.log(`app.init() completed or timed out`, 'Bootstrap');

  // Now get the Fastify instance and listen
  // @ts-ignore
  const fastifyInstance = app.getHttpAdapter().getInstance();
  
  console.log(`[SFC-Fetch] Calling fastify.listen() on port ${port}...`);
  fileLogger.log(`Calling fastify.listen() on port ${port}...`, 'Bootstrap');

  await new Promise<void>((resolve, reject) => {
    // @ts-ignore
    fastifyInstance.listen({ port, host: '0.0.0.0' }, (err, address) => {
      if (err) {
        console.log(`[SFC-Fetch] Fastify listen error: ${err.message}`);
        fileLogger.error(`Fastify listen error: ${err.message}`, undefined, 'Bootstrap');
        reject(err);
      } else {
        console.log(`[SFC-Fetch] Fastify listening at ${address}`);
        fileLogger.log(`Fastify listening at ${address}`, 'Bootstrap');
        resolve();
      }
    });
    setTimeout(() => {
      console.log(`[SFC-Fetch] Fastify listen timeout, proceeding anyway`);
      resolve();
    }, 15000);
  });

  fileLogger.log(`Server running on port ${port}`, 'Bootstrap');
  fileLogger.log(`Health check: http://localhost:${port}/health`, 'Bootstrap');
  console.log(`[SFC-Fetch] Server running on port ${port}`);
  console.log(`[SFC-Fetch] Logs directory: ${LOGS_DIR}`);

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[SFC-Fetch] Received ${signal}, shutting down gracefully...`);
    fileLogger.log(`Received ${signal}, shutting down...`, 'Bootstrap');
    await app.close();
    await fileLogger.close();
    console.log(`[SFC-Fetch] Shutdown complete`);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap();