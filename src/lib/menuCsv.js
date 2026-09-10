/**
 * CSV in and out for the menu catalog.
 *
 * The point of the file is round-tripping: what Export writes is exactly what
 * Import reads, so a restaurant can pull the whole menu into a spreadsheet,
 * reprice a hundred dishes at once, and push it straight back.
 */

export const MENU_CSV_COLUMNS = [
  'Category',
  'Item Name',
  'Price',
  'Description',
  'Image URL',
  'Available',
];

const escapeCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The whole menu as one CSV string, category by category. */
export function menuToCsv(items, categories) {
  const catName = new Map(categories.map((c) => [c.id, c.category_name]));
  const rows = [MENU_CSV_COLUMNS.join(',')];

  // Grouped by category so the file reads like the menu does, rather than in
  // whatever order the database happened to return.
  const sorted = [...items].sort((a, b) => {
    const ca = catName.get(a.category_id) || '';
    const cb = catName.get(b.category_id) || '';
    if (ca !== cb) return ca.localeCompare(cb);
    return String(a.item_name || '').localeCompare(String(b.item_name || ''));
  });

  sorted.forEach((i) => {
    rows.push([
      catName.get(i.category_id) || '',
      i.item_name || '',
      Number(i.price || 0).toFixed(2),
      i.description || '',
      i.image_url || '',
      i.is_available === false ? 'No' : 'Yes',
    ].map(escapeCell).join(','));
  });

  return rows.join('\r\n');
}

/**
 * Split CSV text into rows of cells.
 *
 * Written out by hand rather than split on commas: a dish description with a
 * comma in it is normal, and quoting is the only thing that keeps those rows
 * from silently shifting a column to the left.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }

  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Turn CSV text into menu rows, reporting what is wrong rather than throwing:
 * one bad line in a two-hundred-row file should not cost the other 199.
 */
export function csvToMenuRows(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return { rows: [], errors: ['The file is empty.'] };

  const header = rows[0].map((h) => norm(h));
  const col = (...names) => {
    for (const n of names) {
      const idx = header.indexOf(norm(n));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const iName = col('Item Name', 'Item', 'Dish', 'Name');
  const iPrice = col('Price', 'Rate', 'Amount');
  const iCat = col('Category', 'Category Name');
  const iDesc = col('Description', 'Desc');
  const iImg = col('Image URL', 'Image');
  const iAvail = col('Available', 'Is Available', 'Availability');

  const errors = [];
  if (iName === -1) errors.push('No "Item Name" column found.');
  if (iPrice === -1) errors.push('No "Price" column found.');
  if (errors.length) return { rows: [], errors };

  const out = [];
  const seen = new Set();

  rows.slice(1).forEach((r, n) => {
    const line = n + 2;
    const name = String(r[iName] ?? '').trim();
    if (!name) { errors.push(`Line ${line}: item name is blank.`); return; }

    const rawPrice = String(r[iPrice] ?? '').replace(/[₹,\s]/g, '');
    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price < 0) {
      errors.push(`Line ${line}: "${name}" has an unreadable price (${r[iPrice]}).`);
      return;
    }

    const category = iCat === -1 ? '' : String(r[iCat] ?? '').trim();
    const key = `${norm(category)}||${norm(name)}`;
    if (seen.has(key)) { errors.push(`Line ${line}: "${name}" appears twice in the file.`); return; }
    seen.add(key);

    const availRaw = iAvail === -1 ? '' : norm(r[iAvail]);
    out.push({
      line,
      item_name: name,
      price,
      category,
      description: iDesc === -1 ? '' : String(r[iDesc] ?? '').trim(),
      image_url: iImg === -1 ? '' : String(r[iImg] ?? '').trim(),
      is_available: !['no', 'n', 'false', '0', 'unavailable', 'off'].includes(availRaw),
    });
  });

  return { rows: out, errors };
}

/**
 * Work out what importing these rows would do, against the menu as it stands.
 * Nothing is written here — the caller shows this to the user first.
 */
export function planMenuImport(parsedRows, items, categories) {
  const catByName = new Map(categories.map((c) => [norm(c.category_name), c]));
  const itemByKey = new Map(
    items.map((i) => [`${i.category_id || 'none'}||${norm(i.item_name)}`, i]),
  );

  const newCategories = [];
  const seenNewCats = new Set();
  const updates = [];
  const inserts = [];

  parsedRows.forEach((r) => {
    const existingCat = r.category ? catByName.get(norm(r.category)) : null;
    if (r.category && !existingCat && !seenNewCats.has(norm(r.category))) {
      seenNewCats.add(norm(r.category));
      newCategories.push(r.category);
    }

    const catId = existingCat ? existingCat.id : null;
    const existing = existingCat
      ? itemByKey.get(`${catId}||${norm(r.item_name)}`)
      : itemByKey.get(`none||${norm(r.item_name)}`);

    if (existing) updates.push({ ...r, id: existing.id, categoryId: catId, before: existing });
    else inserts.push({ ...r, categoryId: catId });
  });

  return { newCategories, updates, inserts };
}

/** Hand the browser a CSV file to save. */
export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
