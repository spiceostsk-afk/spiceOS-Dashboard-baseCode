/**
 * Menu CSV import and export.
 *
 * The round trip is what has to hold: whatever Export writes, Import must read
 * back as the same menu. The parsing is the fragile half — a dish description
 * with a comma in it is completely ordinary, and getting that wrong shifts
 * every column after it without raising anything.
 */
import { describe, it, expect } from 'vitest';
import {
  menuToCsv, parseCsv, csvToMenuRows, planMenuImport, MENU_CSV_COLUMNS,
} from '../lib/menuCsv';

const CATEGORIES = [
  { id: 'c1', category_name: 'Starters' },
  { id: 'c2', category_name: 'Main Course' },
];

const ITEMS = [
  { id: 'i1', item_name: 'Paneer Tikka', price: 260, category_id: 'c1', description: 'Char-grilled, smoky', image_url: '', is_available: true },
  { id: 'i2', item_name: 'Dal Makhani', price: 240, category_id: 'c2', description: '', image_url: '', is_available: false },
];

describe('Menu CSV export', () => {
  it('writes a header row naming every column', () => {
    const csv = menuToCsv(ITEMS, CATEGORIES);
    expect(csv.split('\r\n')[0]).toBe(MENU_CSV_COLUMNS.join(','));
  });

  it('quotes a description containing a comma', () => {
    const csv = menuToCsv(ITEMS, CATEGORIES);
    expect(csv).toContain('"Char-grilled, smoky"');
  });

  it('groups the file by category rather than by insertion order', () => {
    const csv = menuToCsv(ITEMS, CATEGORIES);
    const rows = csv.split('\r\n').slice(1);
    expect(rows[0].startsWith('Main Course')).toBe(true);
    expect(rows[1].startsWith('Starters')).toBe(true);
  });

  it('says plainly whether a dish is available', () => {
    const csv = menuToCsv(ITEMS, CATEGORIES);
    expect(csv).toContain(',Yes');
    expect(csv).toContain(',No');
  });
});

describe('CSV parsing', () => {
  it('keeps a quoted comma inside its own cell', () => {
    const rows = parseCsv('a,b\n"one, two",three');
    expect(rows[1]).toEqual(['one, two', 'three']);
  });

  it('reads a doubled quote as one literal quote', () => {
    const rows = parseCsv('a\n"he said ""hi"""');
    expect(rows[1]).toEqual(['he said "hi"']);
  });

  it('handles Windows line endings and a trailing newline', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n');
    expect(rows).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('drops blank lines rather than importing empty dishes', () => {
    const rows = parseCsv('a,b\n1,2\n\n,\n3,4');
    expect(rows).toHaveLength(3);
  });
});

describe('Reading a menu out of CSV', () => {
  it('round-trips an exported file', () => {
    const { rows, errors } = csvToMenuRows(menuToCsv(ITEMS, CATEGORIES));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    const paneer = rows.find((r) => r.item_name === 'Paneer Tikka');
    expect(paneer.price).toBe(260);
    expect(paneer.category).toBe('Starters');
    expect(paneer.description).toBe('Char-grilled, smoky');
    expect(rows.find((r) => r.item_name === 'Dal Makhani').is_available).toBe(false);
  });

  it('refuses a file with no name or price column', () => {
    const { rows, errors } = csvToMenuRows('Something,Else\n1,2');
    expect(rows).toEqual([]);
    expect(errors.join(' ')).toMatch(/Item Name/);
  });

  it('accepts a rupee sign and thousands separators in the price', () => {
    const { rows } = csvToMenuRows('Category,Item Name,Price\nA,Thali,"₹1,250"');
    expect(rows[0].price).toBe(1250);
  });

  it('skips a bad line but keeps the good ones', () => {
    const { rows, errors } = csvToMenuRows(
      'Category,Item Name,Price\nA,Good,100\nA,Bad,abc\nA,,50',
    );
    expect(rows.map((r) => r.item_name)).toEqual(['Good']);
    expect(errors).toHaveLength(2);
  });

  it('reports a dish listed twice rather than importing it twice', () => {
    const { rows, errors } = csvToMenuRows(
      'Category,Item Name,Price\nA,Tea,20\nA,Tea,30',
    );
    expect(rows).toHaveLength(1);
    expect(errors.join(' ')).toMatch(/twice/);
  });
});

describe('Planning an import', () => {
  it('updates a dish that already exists in that category', () => {
    const { rows } = csvToMenuRows('Category,Item Name,Price\nStarters,Paneer Tikka,299');
    const plan = planMenuImport(rows, ITEMS, CATEGORIES);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].id).toBe('i1');
    expect(plan.updates[0].price).toBe(299);
  });

  it('matches a dish whatever the case of its name', () => {
    const { rows } = csvToMenuRows('Category,Item Name,Price\nstarters,PANEER TIKKA,299');
    const plan = planMenuImport(rows, ITEMS, CATEGORIES);
    expect(plan.updates).toHaveLength(1);
  });

  it('adds an unknown dish and its unknown category exactly once', () => {
    const { rows } = csvToMenuRows(
      'Category,Item Name,Price\nDesserts,Gulab Jamun,120\nDesserts,Kulfi,110',
    );
    const plan = planMenuImport(rows, ITEMS, CATEGORIES);
    expect(plan.newCategories).toEqual(['Desserts']);
    expect(plan.inserts).toHaveLength(2);
    expect(plan.updates).toHaveLength(0);
  });

  it('treats the same name in a different category as a different dish', () => {
    const { rows } = csvToMenuRows('Category,Item Name,Price\nMain Course,Paneer Tikka,320');
    const plan = planMenuImport(rows, ITEMS, CATEGORIES);
    expect(plan.updates).toHaveLength(0);
    expect(plan.inserts).toHaveLength(1);
  });
});
