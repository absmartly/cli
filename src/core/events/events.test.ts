import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseUnits,
  columnarToRows,
  listEvents,
  listEventsHistory,
  getEventUnitData,
  deleteEventUnitData,
} from './events.js';

describe('events', () => {
  const mockClient = {
    listEvents: vi.fn(),
    listEventsHistory: vi.fn(),
    getEventUnitData: vi.fn(),
    deleteEventUnitData: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseUnits', () => {
    it('should parse valid unit strings', () => {
      const result = parseUnits(['1:abc', '2:def']);
      expect(result).toEqual([
        { unit_type_id: 1, uid: 'abc' },
        { unit_type_id: 2, uid: 'def' },
      ]);
    });

    it('should handle uid with colons', () => {
      const result = parseUnits(['1:a:b:c']);
      expect(result).toEqual([{ unit_type_id: 1, uid: 'a:b:c' }]);
    });

    it('should throw on missing colon', () => {
      expect(() => parseUnits(['invalid'])).toThrow('Invalid unit format: "invalid"');
    });

    it('should throw on non-numeric unit_type_id', () => {
      expect(() => parseUnits(['abc:uid'])).toThrow('Invalid unit_type_id in "abc:uid"');
    });
  });

  describe('columnarToRows', () => {
    it('should convert columnar format to row objects', () => {
      const input = {
        columnNames: ['a', 'b'],
        rows: [
          [1, 2],
          [3, 4],
        ],
      };
      const result = columnarToRows(input);
      expect(result).toEqual([
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ]);
    });

    it('should pass through array input', () => {
      const input = [{ x: 1 }, { x: 2 }];
      const result = columnarToRows(input);
      expect(result).toEqual([{ x: 1 }, { x: 2 }]);
    });

    it('should wrap plain object as single-element array', () => {
      const input = { foo: 'bar' };
      const result = columnarToRows(input);
      expect(result).toEqual([{ foo: 'bar' }]);
    });

    it('should return empty array for null', () => {
      expect(columnarToRows(null)).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(columnarToRows(undefined)).toEqual([]);
    });
  });

  describe('listEvents', () => {
    it('should call client with filters', async () => {
      mockClient.listEvents.mockResolvedValue({ events: [] });
      const result = await listEvents(mockClient as any, {
        from: 100,
        to: 200,
        applications: [1, 2],
        eventTypes: ['exposure'],
        take: 10,
        skip: 5,
      });
      expect(mockClient.listEvents).toHaveBeenCalledWith({
        filters: {
          from: 100,
          to: 200,
          applications: [1, 2],
          event_types: ['exposure'],
        },
        take: 10,
        skip: 5,
      });
      expect(result.data).toEqual({ events: [] });
    });

    it('should omit empty filters', async () => {
      mockClient.listEvents.mockResolvedValue([]);
      await listEvents(mockClient as any, {});
      expect(mockClient.listEvents).toHaveBeenCalledWith({ take: 100 });
    });

    it('should send effective_exposures=true when validExposures is true', async () => {
      mockClient.listEvents.mockResolvedValue([]);
      await listEvents(mockClient as any, { validExposures: true });
      expect(mockClient.listEvents).toHaveBeenCalledWith({
        filters: { effective_exposures: true },
        take: 100,
      });
    });

    it('should send effective_exposures=false when validExposures is false', async () => {
      mockClient.listEvents.mockResolvedValue([]);
      await listEvents(mockClient as any, { validExposures: false });
      expect(mockClient.listEvents).toHaveBeenCalledWith({
        filters: { effective_exposures: false },
        take: 100,
      });
    });

    it('should omit effective_exposures when validExposures is undefined', async () => {
      mockClient.listEvents.mockResolvedValue([]);
      await listEvents(mockClient as any, { from: 1 });
      expect(mockClient.listEvents).toHaveBeenCalledWith({ filters: { from: 1 }, take: 100 });
    });
  });

  describe('listEvents default take', () => {
    it('should apply a default take when not specified', async () => {
      mockClient.listEvents.mockResolvedValue({ columnNames: [], rows: [] });
      await listEvents(mockClient as any, {});
      expect(mockClient.listEvents).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
    });

    it('should respect an explicit take', async () => {
      mockClient.listEvents.mockResolvedValue({ columnNames: [], rows: [] });
      await listEvents(mockClient as any, { take: 500 });
      expect(mockClient.listEvents).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
    });
  });

  describe('listEventsHistory', () => {
    it('should call client with filters and period', async () => {
      mockClient.listEventsHistory.mockResolvedValue({ history: [] });
      const result = await listEventsHistory(mockClient as any, {
        from: 100,
        to: 200,
        period: 'day',
        tzOffset: -300,
      });
      expect(mockClient.listEventsHistory).toHaveBeenCalledWith({
        filters: { from: 100, to: 200 },
        period: 'day',
        tz_offset: -300,
      });
      expect(result.data).toEqual({ history: [] });
    });
  });

  describe('getEventUnitData', () => {
    it('should parse units and call client', async () => {
      mockClient.getEventUnitData.mockResolvedValue({ data: 'ok' });
      const result = await getEventUnitData(mockClient as any, { units: ['1:user1'] });
      expect(mockClient.getEventUnitData).toHaveBeenCalledWith({
        units: [{ unit_type_id: 1, uid: 'user1' }],
      });
      expect(result.data).toEqual({ data: 'ok' });
    });
  });

  describe('deleteEventUnitData', () => {
    it('should parse units and call client', async () => {
      mockClient.deleteEventUnitData.mockResolvedValue({ deleted: true });
      const result = await deleteEventUnitData(mockClient as any, { units: ['2:user2'] });
      expect(mockClient.deleteEventUnitData).toHaveBeenCalledWith({
        units: [{ unit_type_id: 2, uid: 'user2' }],
      });
      expect(result.data).toEqual({ deleted: true });
    });
  });
});
