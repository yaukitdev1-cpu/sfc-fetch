import { describe, test, expect, beforeEach } from 'bun:test';
import {
  parseSfcDate,
  formatDateForStorage,
  extractYearFromDate,
} from '../src/common/utils/date.utils';

describe('date.utils', () => {
  describe('parseSfcDate', () => {
    test('parses "MMM yyyy" format (e.g., "Apr 2013")', () => {
      const result = parseSfcDate('Apr 2013');
      expect(result).not.toBeNull();
      expect(result?.getMonth()).toBe(3); // April = 3 (0-indexed)
      expect(result?.getFullYear()).toBe(2013);
    });

    test('parses "d MMM yyyy" format (e.g., "1 Apr 2013")', () => {
      const result = parseSfcDate('1 Apr 2013');
      expect(result).not.toBeNull();
      expect(result?.getDate()).toBe(1);
      expect(result?.getMonth()).toBe(3);
      expect(result?.getFullYear()).toBe(2013);
    });

    test('parses "dd MMM yyyy" format (e.g., "01 Apr 2013")', () => {
      const result = parseSfcDate('01 Apr 2013');
      expect(result).not.toBeNull();
      expect(result?.getDate()).toBe(1);
      expect(result?.getMonth()).toBe(3);
      expect(result?.getFullYear()).toBe(2013);
    });

    test('parses "MMMM d, yyyy" format (e.g., "April 1, 2022")', () => {
      const result = parseSfcDate('April 1, 2022');
      expect(result).not.toBeNull();
      expect(result?.getMonth()).toBe(3); // April
      expect(result?.getDate()).toBe(1);
      expect(result?.getFullYear()).toBe(2022);
    });

    test('parses "d MMMM yyyy" format (e.g., "1 April 2022")', () => {
      const result = parseSfcDate('1 April 2022');
      expect(result).not.toBeNull();
      expect(result?.getMonth()).toBe(3);
      expect(result?.getDate()).toBe(1);
      expect(result?.getFullYear()).toBe(2022);
    });

    test('parses ISO format "yyyy-MM-dd"', () => {
      const result = parseSfcDate('2022-04-01');
      expect(result).not.toBeNull();
      expect(result?.getFullYear()).toBe(2022);
      expect(result?.getMonth()).toBe(3);
      expect(result?.getDate()).toBe(1);
    });

    test('parses "dd/MM/yyyy" format', () => {
      const result = parseSfcDate('01/04/2022');
      expect(result).not.toBeNull();
      expect(result?.getDate()).toBe(1);
      expect(result?.getMonth()).toBe(3);
      expect(result?.getFullYear()).toBe(2022);
    });

    test('parses "MM/dd/yyyy" format - parses as dd/MM due to format ambiguity', () => {
      // Note: date-fns parses this as dd/MM due to format order
      // This is a known limitation - 04/01/2022 becomes Jan 4
      const result = parseSfcDate('04/01/2022');
      expect(result).not.toBeNull();
      // The format is ambiguous and parses as dd/MM
      expect(result?.getMonth()).toBe(0); // January
      expect(result?.getDate()).toBe(4);
    });

    test('returns null for invalid date string', () => {
      const result = parseSfcDate('not-a-date');
      expect(result).toBeNull();
    });

    test('returns null for empty string', () => {
      const result = parseSfcDate('');
      expect(result).toBeNull();
    });
  });

  describe('formatDateForStorage', () => {
    test('formats date as yyyy-MM-dd', () => {
      const date = new Date(2022, 3, 1); // April 1, 2022
      const result = formatDateForStorage(date);
      expect(result).toBe('2022-04-01');
    });

    test('handles single-digit month and day', () => {
      const date = new Date(2022, 0, 5); // January 5, 2022
      const result = formatDateForStorage(date);
      expect(result).toBe('2022-01-05');
    });
  });

  describe('extractYearFromDate', () => {
    test('extracts year from parsed date', () => {
      const result = extractYearFromDate('Apr 2013');
      expect(result).toBe(2013);
    });

    test('extracts year from ISO format', () => {
      const result = extractYearFromDate('2022-04-01');
      expect(result).toBe(2022);
    });

    test('extracts year from date string directly', () => {
      const result = extractYearFromDate('Circular from 2021');
      expect(result).toBe(2021);
    });

    test('extracts year from various formats', () => {
      expect(extractYearFromDate('April 1, 2020')).toBe(2020);
      expect(extractYearFromDate('01/04/2019')).toBe(2019);
    });

    test('returns null for invalid date without year', () => {
      const result = extractYearFromDate('not-a-date');
      expect(result).toBeNull();
    });

    test('returns null for empty string', () => {
      const result = extractYearFromDate('');
      expect(result).toBeNull();
    });
  });
});
