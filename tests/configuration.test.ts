import { describe, test, expect, beforeAll } from 'bun:test';

describe('configuration', () => {
  test('configuration has required fields', () => {
    // Test that the configuration module exports a function
    const configFn = require('../src/config/configuration').default;
    expect(typeof configFn).toBe('function');
  });

  test('parses port from environment', () => {
    process.env.PORT = '4000';
    const configFn = require('../src/config/configuration').default;
    const cfg = configFn();
    expect(cfg.port).toBe(4000);
  });

  test('uses default port when not set', () => {
    delete process.env.PORT;
    const configFn = require('../src/config/configuration').default;
    const cfg = configFn();
    expect(cfg.port).toBe(3000);
  });

  test('parses SFC_RATE_LIMIT correctly', () => {
    process.env.SFC_RATE_LIMIT = '5';
    const configFn = require('../src/config/configuration').default;
    const cfg = configFn();
    expect(cfg.sfcRateLimit).toBe(5);
  });

  test('has correct categories', () => {
    const configFn = require('../src/config/configuration').default;
    const cfg = configFn();
    expect(cfg.categories).toContain('circulars');
    expect(cfg.categories).toContain('guidelines');
    expect(cfg.categories).toContain('consultations');
    expect(cfg.categories).toContain('news');
    expect(cfg.categories.length).toBe(4);
  });

  test('has workflow states defined', () => {
    const configFn = require('../src/config/configuration').default;
    const cfg = configFn();
    expect(cfg.workflowStates.PENDING).toBe('PENDING');
    expect(cfg.workflowStates.DISCOVERED).toBe('DISCOVERED');
    expect(cfg.workflowStates.DOWNLOADING).toBe('DOWNLOADING');
    expect(cfg.workflowStates.PROCESSING).toBe('PROCESSING');
    expect(cfg.workflowStates.COMPLETED).toBe('COMPLETED');
    expect(cfg.workflowStates.FAILED).toBe('FAILED');
    expect(cfg.workflowStates.RETRYING).toBe('RETRYING');
    expect(cfg.workflowStates.RE_RUNNING).toBe('RE_RUNNING');
    expect(cfg.workflowStates.STALE).toBe('STALE');
  });

  test('has step statuses defined', () => {
    const configFn = require('../src/config/configuration').default;
    const cfg = configFn();
    expect(cfg.stepStatuses.PENDING).toBe('PENDING');
    expect(cfg.stepStatuses.RUNNING).toBe('RUNNING');
    expect(cfg.stepStatuses.COMPLETED).toBe('COMPLETED');
    expect(cfg.stepStatuses.FAILED).toBe('FAILED');
    expect(cfg.stepStatuses.SKIPPED).toBe('SKIPPED');
  });

  test('has default SFC base URL', () => {
    const configFn = require('../src/config/configuration').default;
    const cfg = configFn();
    expect(cfg.sfcBaseUrl).toBe('https://apps.sfc.hk/edistributionWeb');
  });

  test('parses backup retention', () => {
    process.env.BACKUP_RETENTION = '20';
    const configFn = require('../src/config/configuration').default;
    const cfg = configFn();
    expect(cfg.backupRetention).toBe(20);
  });
});
