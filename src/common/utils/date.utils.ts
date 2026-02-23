import { parse, isValid, format } from 'date-fns';

export function parseSfcDate(dateString: string): Date | null {
  // Common SFC date formats
  const formats = [
    'MMM yyyy', // "Apr 2013"
    'd MMM yyyy', // "1 Apr 2013"
    'dd MMM yyyy', // "01 Apr 2013"
    'MMMM d, yyyy', // "April 1, 2022"
    'd MMMM yyyy', // "1 April 2022"
    'yyyy-MM-dd', // ISO format
    'dd/MM/yyyy', // "01/04/2022"
    'MM/dd/yyyy', // "04/01/2022"
  ];

  for (const fmt of formats) {
    const parsed = parse(dateString, fmt, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  return null;
}

export function formatDateForStorage(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function extractYearFromDate(dateString: string): number | null {
  const parsed = parseSfcDate(dateString);
  if (parsed) {
    return parsed.getFullYear();
  }

  // Try to extract year directly
  const yearMatch = dateString.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    return parseInt(yearMatch[0], 10);
  }

  return null;
}
