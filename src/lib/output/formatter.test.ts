import { describe, it, expect } from 'vitest';
import { formatOutput, formatValue, truncateText } from './formatter.js';
import { summarizeObjectValue, formatUserSummary } from './formatter.js';

describe('Output Formatter', () => {
  describe('formatValue', () => {
    it('should format null/undefined as empty string', () => {
      expect(formatValue(null)).toBe('');
      expect(formatValue(undefined)).toBe('');
    });

    it('should format booleans', () => {
      expect(formatValue(true)).toBe('true');
      expect(formatValue(false)).toBe('false');
    });

    it('should format numbers', () => {
      expect(formatValue(123)).toBe('123');
      expect(formatValue(0)).toBe('0');
    });

    it('should format strings', () => {
      expect(formatValue('test')).toBe('test');
    });

    it('should format arrays', () => {
      expect(formatValue([1, 2, 3])).toBe('1, 2, 3');
    });

    it('should escape pipe characters in markdown format', () => {
      expect(formatValue('value|with|pipes', { format: 'markdown' })).toBe('value\\|with\\|pipes');
    });

    it('should not escape pipes in non-markdown formats', () => {
      expect(formatValue('value|with|pipes', { format: 'table' })).toBe('value|with|pipes');
      expect(formatValue('value|with|pipes', {})).toBe('value|with|pipes');
    });

    it('should escape multiple pipes correctly', () => {
      expect(formatValue('a|b|c|d', { format: 'markdown' })).toBe('a\\|b\\|c\\|d');
    });

    it('should pretty-print objects in table format', () => {
      const obj = { filter: [{ k: 'v' }] };
      expect(formatValue(obj, { format: 'table' })).toBe(JSON.stringify(obj, null, 2));
    });

    it('should pretty-print objects in vertical format', () => {
      const obj = { filter: [{ k: 'v' }] };
      expect(formatValue(obj, { format: 'vertical' })).toBe(JSON.stringify(obj, null, 2));
    });

    it('should compact-print objects in markdown format', () => {
      const obj = { filter: [{ k: 'v' }] };
      expect(formatValue(obj, { format: 'markdown' })).toBe(JSON.stringify(obj));
    });

    it('should compact-print objects in plain format', () => {
      const obj = { filter: [{ k: 'v' }] };
      expect(formatValue(obj, { format: 'plain' })).toBe(JSON.stringify(obj));
    });

    it('should compact-print objects when no format is set', () => {
      const obj = { filter: [{ k: 'v' }] };
      expect(formatValue(obj)).toBe(JSON.stringify(obj));
    });
  });

  describe('formatUserSummary', () => {
    it('returns "First Last" when both names are present', () => {
      expect(formatUserSummary({ first_name: 'Joe', last_name: 'Bloggs' })).toBe('Joe Bloggs');
    });

    it('returns the email when names are missing', () => {
      expect(formatUserSummary({ email: 'joe@example.com' })).toBe('joe@example.com');
    });

    it('prefers full name over email when both are present', () => {
      expect(
        formatUserSummary({ first_name: 'Joe', last_name: 'Bloggs', email: 'joe@example.com' })
      ).toBe('Joe Bloggs');
    });

    it('returns just the first name if last is missing', () => {
      expect(formatUserSummary({ first_name: 'Joe' })).toBe('Joe');
    });

    it('returns null when the value is not user-shaped', () => {
      expect(formatUserSummary({ id: 1, name: 'thing' })).toBe(null);
      expect(formatUserSummary({})).toBe(null);
      expect(formatUserSummary(null)).toBe(null);
    });
  });

  describe('summarizeObjectValue', () => {
    it('summarizes user-shaped objects via formatUserSummary', () => {
      expect(summarizeObjectValue({ first_name: 'Joe', last_name: 'Bloggs', id: 4 })).toBe(
        'Joe Bloggs'
      );
    });

    it('falls back to the name field when no user shape', () => {
      expect(summarizeObjectValue({ id: 7, name: 'Revenue' })).toBe('Revenue');
    });

    it('falls back to the title field when there is no name', () => {
      expect(summarizeObjectValue({ id: 9, title: 'Owner' })).toBe('Owner');
    });

    it('returns null for an empty object', () => {
      expect(summarizeObjectValue({})).toBe(null);
    });

    it('returns null for an object with only opaque fields', () => {
      expect(summarizeObjectValue({ foo: 1, bar: 2 })).toBe(null);
    });
  });

  describe('formatValue (nested object handling)', () => {
    it('summarizes nested user objects instead of JSON.stringify-ing them', () => {
      expect(formatValue({ first_name: 'Joe', last_name: 'Bloggs' })).toBe('Joe Bloggs');
    });

    it('summarizes nested named objects instead of JSON.stringify-ing them', () => {
      expect(formatValue({ id: 1, name: 'Revenue' })).toBe('Revenue');
    });

    it('falls back to JSON for other nested objects', () => {
      const obj = { foo: 1, bar: 2 };
      expect(formatValue(obj)).toBe(JSON.stringify(obj));
      expect(formatValue(obj, { format: 'table' })).toBe(JSON.stringify(obj, null, 2));
    });
  });

  describe('truncateText', () => {
    it('should not truncate short text', () => {
      const text = 'short';
      expect(truncateText(text)).toBe(text);
    });

    it('should truncate long text by default', () => {
      const text = 'a'.repeat(200);
      const result = truncateText(text);
      expect(result.length).toBeLessThan(text.length);
      expect(result).toContain('...');
    });

    it('should respect --full flag', () => {
      const text = 'a'.repeat(200);
      const result = truncateText(text, { full: true });
      expect(result).toBe(text);
    });

    it('should use shorter limit for --terse', () => {
      const text = 'a'.repeat(200);
      const result = truncateText(text, { terse: true });
      expect(result.length).toBeLessThan(60);
    });
  });

  describe('formatOutput', () => {
    const testData = [
      { id: 1, name: 'Test 1', value: 100 },
      { id: 2, name: 'Test 2', value: 200 },
    ];

    it('should format as JSON with syntax highlighting', () => {
      const result = formatOutput(testData, 'json');
      expect(result).toContain('id');
      expect(result).toContain('1');
    });

    it('should format as JSON without highlighting when noColor', () => {
      const result = formatOutput(testData, 'json', { noColor: true });
      expect(JSON.parse(result)).toEqual(testData);
    });

    it('should format as YAML with syntax highlighting', () => {
      const result = formatOutput(testData, 'yaml');
      expect(result).toContain('id');
      expect(result).toContain('Test 1');
    });

    it('should format as YAML without highlighting when noColor', () => {
      const result = formatOutput(testData, 'yaml', { noColor: true });
      expect(result).toContain('id: 1');
      expect(result).toContain('name: Test 1');
    });

    it('should format as table', () => {
      const result = formatOutput(testData, 'table');
      expect(result).toContain('id');
      expect(result).toContain('name');
      expect(result).toContain('value');
    });

    it('should include columns that are missing from the first row in a table', () => {
      const rows = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b', extra: 'only-here' },
      ];
      const result = formatOutput(rows, 'table', { noColor: true });
      expect(result).toContain('extra');
      expect(result).toContain('only-here');
    });

    it('should include columns that are missing from the first row in markdown', () => {
      const rows = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b', extra: 'only-here' },
      ];
      const result = formatOutput(rows, 'markdown', { noColor: true });
      expect(result.split('\n')[0]).toBe('| id | name | extra |');
      expect(result).toContain('| 2 | b | only-here |');
    });

    it('should align plain columns when rows have different keys', () => {
      const rows = [
        { id: 1, extra: 'x' },
        { id: 2, name: 'b' },
      ];
      const lines = formatOutput(rows, 'plain', { noColor: true }).split('\n');
      expect(lines[0]!.split('\t')).toEqual(['1', 'x', '']);
      expect(lines[1]!.split('\t')).toEqual(['2', '', 'b']);
    });

    it('should format as markdown', () => {
      const result = formatOutput(testData, 'markdown');
      expect(result).toContain('|');
      expect(result).toContain('id');
      expect(result).toContain('Test 1');
    });

    it('should handle empty arrays', () => {
      const result = formatOutput([], 'table');
      expect(result).toContain('No results found');
    });

    it('should format single objects', () => {
      const result = formatOutput({ id: 1, name: 'Test' }, 'json');
      expect(result).toContain('"id": 1');
    });
  });
});
