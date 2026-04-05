import { QueueService } from '../src/workflows/queue.service';
import { ConfigService } from '@nestjs/config';

// Temporary benchmark script to measure queue throughput
async function benchmarkQueue() {
  const configService = new ConfigService();
  const queueService = new QueueService(configService);
queueService.initializeQueue(); // Explicitly initialize queue (NestJS onModuleInit not triggered manually)
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for queue init

  const jobCount = 10;
  const jobs = Array.from({ length: jobCount }, (_, i) => ({
    category: 'circulars',
    refNo: `bench-${i}`,
    action: 'discover'
  }));

  console.log(`Starting benchmark with ${jobCount} jobs`);
  const start = Date.now();

  // Submit all jobs
  const promises = jobs.map(job => queueService.submitJob(job));
  await Promise.all(promises);

  // Wait for all jobs to complete
  while (queueService.getStats().length > 0 || queueService.getStats().running > 0) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const duration = (Date.now() - start) / 1000;
  console.log(`Benchmark complete: ${jobCount} jobs in ${duration.toFixed(2)}s`);
  console.log(`Throughput: ${(jobCount / duration).toFixed(2)} jobs/s`);

  queueService.destroy();
}

benchmarkQueue().catch(console.error);
