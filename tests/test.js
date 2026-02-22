// Test script for sfc-fetch microservice
const path = require('path');
const database = require(path.join(__dirname, '../src/database'));
const { createCircularDocument } = require(path.join(__dirname, '../src/models/circular'));
const backupService = require(path.join(__dirname, '../src/services/backup'));
const workflowService = require(path.join(__dirname, '../src/services/workflow'));
const contentService = require(path.join(__dirname, '../src/services/content'));
const config = require(path.join(__dirname, '../src/config'));

async function runTests() {
  console.log('=== SFC Fetch Microservice Tests ===\n');

  // Initialize
  console.log('1. Initializing database...');
  database.initialize();
  console.log('   Database initialized\n');

  // Test 1: Save a sample document
  console.log('2. Testing document creation...');
  const circular = createCircularDocument('26EC6', {
    title: 'Circular to Licensed Corporations',
    issueDate: '2026-02-11',
    year: 2026,
    language: 'EN',
    documentType: '110',
    departmentCode: 'IS',
    hasAppendices: true,
    appendixCount: 2,
    isModernFormat: true,
    source: {
      discoveryMethod: 'api_search',
      searchEndpoint: 'POST /api/circular/search',
      contentEndpoint: 'GET /api/circular/content?refNo=26EC6&lang=EN',
      downloadEndpoint: 'GET /api/circular/openFile?refNo=26EC6&lang=EN',
      discoveredAt: new Date().toISOString(),
      sourceVersion: '2026-02-11'
    }
  });

  // Simulate workflow
  circular.startWorkflow('initial_download');
  circular.startStep('search_api');
  circular.completeStep('search_api', { results: 1 });
  circular.startStep('fetch_content_api');
  circular.completeStep('fetch_content_api');
  circular.startStep('download_main_pdf');
  circular.completeStep('download_main_pdf');
  circular.startStep('convert_to_markdown');
  circular.completeStep('convert_to_markdown');

  // Save content
  const sampleMarkdown = `# Circular to Licensed Corporations

**Date:** 2026-02-11

1. This circular sets out the requirements for licensed corporations regarding...
`;

  const contentPath = await contentService.saveMarkdown('circulars', '26EC6', sampleMarkdown, { year: 2026 });
  circular.setContentWithAppendices(contentPath.markdownPath, contentPath.markdownSize, contentPath.wordCount, [
    { caption: 'Appendix A', markdownPath: 'circulars/markdown/2026/26EC6_appendix_0.md' }
  ]);

  circular.completeWorkflow();

  // Save to database
  database.upsertDocument('26EC6', 'circulars', circular.toJSON());
  console.log('   Created circular document: 26EC6\n');

  // Test 2: Retrieve document
  console.log('3. Testing document retrieval...');
  const retrieved = database.getDocument('26EC6', 'circulars');
  if (retrieved && retrieved._id === '26EC6') {
    console.log('   Document retrieved successfully');
    console.log(`   Status: ${retrieved.workflow.status}\n`);
  } else {
    console.error('   FAILED: Document retrieval failed');
    process.exit(1);
  }

  // Test 3: Workflow state transitions
  console.log('4. Testing workflow state transitions...');
  const canRetry = workflowService.canRetry('26EC6', 'circulars');
  console.log(`   Can retry: ${canRetry.canRetry}`);

  const canReRun = workflowService.canReRun('26EC6', 'circulars');
  console.log(`   Can re-run: ${canReRun.canReRun}\n`);

  // Test 4: Create a failed document to test retry
  console.log('5. Testing retry functionality...');
  const failedDoc = createCircularDocument('26EC50', {
    title: 'Test Failed Circular',
    year: 2026,
    source: { discoveryMethod: 'api_search' }
  });
  failedDoc.startWorkflow('initial_download');
  failedDoc.startStep('download_main_pdf');
  failedDoc.failStep('download_main_pdf', { type: 'HTTP_503', message: 'Service unavailable' });
  database.upsertDocument('26EC50', 'circulars', failedDoc.toJSON());

  const retryResult = workflowService.retryDocument('26EC50', 'circulars', {
    reason: 'network_timeout_recovery',
    fromStep: 'download_main_pdf'
  });
  console.log(`   Retry result: ${JSON.stringify(retryResult)}\n`);

  // Test 5: Get workflow status
  console.log('6. Testing workflow status endpoint...');
  const status = workflowService.getWorkflowStatus('26EC6', 'circulars');
  console.log(`   Status: ${status.workflow.status}`);
  console.log(`   Is retryable: ${status.isRetryable}`);
  console.log(`   Is re-runnable: ${status.isReRunnable}\n`);

  // Test 6: Test dehydration (backup)
  console.log('7. Testing dehydration (backup)...');
  backupService.ensureDirectories();
  const dehydrateResult = await backupService.dehydrate();
  console.log(`   Backup ID: ${dehydrateResult.backupId}`);
  console.log(`   Files archived: ${dehydrateResult.filesArchived}`);
  console.log(`   Size: ${dehydrateResult.sizeBytes} bytes\n`);

  // Test 7: Get backup status
  console.log('8. Testing backup status...');
  const backupStatus = backupService.getStatus();
  console.log(`   Last backup: ${backupStatus.lastBackup}`);
  console.log(`   Total documents: ${backupStatus.totalDocuments}`);
  console.log(`   Total size: ${backupStatus.totalSizeFormatted}\n`);

  // Test 8: Test health check
  console.log('9. Testing health check...');
  const counts = database.getCountsByCategory();
  console.log(`   Documents by category:`);
  for (const [category, count] of Object.entries(counts)) {
    console.log(`     ${category}: ${count}`);
  }

  const contentStats = contentService.getStats();
  console.log(`   Content files: ${contentStats.files}`);
  console.log(`   Content size: ${contentService.formatBytes(contentStats.size)}\n`);

  console.log('=== All tests completed successfully ===');

  // Clean up
  database.close();
}

runTests().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
