import { describe, it, expect, beforeEach } from 'vitest';
import * as db from '../lib/db';

describe('db.js - IndexedDB wrapper', () => {
  beforeEach(async () => {
    await db.clearStore('tables');
    await db.clearStore('sections');
    await db.clearStore('menu_items');
    await db.clearStore('menu_categories');
    await db.clearStore('sessions');
    await db.clearStore('orders');
    await db.clearStore('order_items');
    await db.clearStore('sync_queue');
    await db.clearStore('meta');
  });

  it('stores and retrieves a record', async () => {
    const testData = { id: 'test-1', name: 'Test Item', value: 42 };
    await db.put('menu_items', testData);
    const retrieved = await db.getById('menu_items', 'test-1');
    expect(retrieved).toEqual(testData);
  });

  it('returns null for missing record', async () => {
    const result = await db.getById('menu_items', 'nonexistent');
    expect(result).toBeNull();
  });

  it('retrieves all records from a store', async () => {
    await db.put('tables', { id: 't1', table_number: 1 });
    await db.put('tables', { id: 't2', table_number: 2 });
    const all = await db.getAll('tables');
    expect(all).toHaveLength(2);
  });

  it('deletes a record', async () => {
    await db.put('sections', { id: 's1', section_name: 'Main' });
    await db.remove('sections', 's1');
    const result = await db.getById('sections', 's1');
    expect(result).toBeNull();
  });

  it('generates unique temp IDs', () => {
    const id1 = db.generateTempId();
    const id2 = db.generateTempId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^temp_/);
    expect(id2).toMatch(/^temp_/);
  });

  it('enqueues sync operations', async () => {
    const entryId = await db.enqueueSync({
      action: 'insert',
      table: 'customer_sessions',
      data: { id: 'temp_123', customer_name: 'Test' },
    });
    expect(entryId).toBeGreaterThanOrEqual(1);
    const items = await db.getPendingSyncItems();
    expect(items).toHaveLength(1);
    expect(items[0].action).toBe('insert');
    expect(items[0].retries).toBe(0);
  });

  it('returns empty array for getAll on fresh store', async () => {
    await db.clearStore('meta');
    const meta = await db.getAll('meta');
    expect(meta).toEqual([]);
  });

  it('stores and retrieves meta values', async () => {
    await db.setMeta('restaurant_name', 'Test Restaurant');
    const name = await db.getMeta('restaurant_name');
    expect(name).toBe('Test Restaurant');
  });

  it('returns null for missing meta key', async () => {
    const val = await db.getMeta('nonexistent_key');
    expect(val).toBeNull();
  });
});
