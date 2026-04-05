import { LowdbService } from '../src/database/lowdb.service';
import { ConfigService } from '@nestjs/config';

// Benchmark database lookup performance with in-memory index
async function benchmarkDb() {
  const configService = new ConfigService();
  const dbService = new LowdbService(configService);
  await dbService.initialize();

  // Populate test data
  const testCount = 1000;
  console.log(`Populating ${testCount} test documents`);
  for (let i = 0; i < testCount; i++) {
    await dbService.upsertDocument(
      `test-${i}`,
      'circulars',
      { title: `Test Document ${i}`, metadata: { year: 2026 } }
    );
  }

  // Benchmark getDocument lookups
  console.log(`Starting lookup benchmark for ${testCount} documents`);
  const start = Date.now();

  for (let i = 0; i < testCount; i++) {
    const doc = dbService.getDocument(`test-${i}`, 'circulars');
    if (!doc) throw new Error(`Document test-${i} not found`);
  }

  const duration = (Date.now() - start) / 1000;
  console.log(`Lookup benchmark complete: ${testCount} lookups in ${duration.toFixed(4)}s`);
  console.log(`Average lookup time: ${((duration / testCount) * 1000).toFixed(6)}ms`);

  await dbService.close();
}

benchmarkDb().catch(console.error);
