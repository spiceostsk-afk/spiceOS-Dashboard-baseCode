import React, { useState, useEffect } from 'react';
import { QrCode, RefreshCw, Printer, Download, Edit3, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const QR_SIZE = 180;
// Where the customer (diner) menu is hosted — a separate deploy from this
// dashboard. Set VITE_MENU_URL in production; falls back to `${origin}/menu`.
const MENU_BASE_URL = import.meta.env.VITE_MENU_URL || `${window.location.origin}/menu`;

// Encodes the table's opaque public_token — NOT the table number — so a diner
// cannot edit the URL to reach another table. resolve-table maps it server-side.
function getQrUrl(publicToken) {
  const data = `${MENU_BASE_URL}/?t=${publicToken}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=${QR_SIZE}x${QR_SIZE}&data=${encodeURIComponent(data)}`;
}

const STATUS_DOT = {
  available: 'var(--color-success)',
  occupied: 'var(--color-info)',
  billing: 'var(--color-warning)',
  cleaning: 'var(--color-text-faint)',
};

const EMPTY_FORM = { table_number: '', capacity: 2, section_id: '' };

function TableFormModal({ editingTable, sections, onSave, onClose }) {
  const [form, setForm] = useState(
    editingTable
      ? { table_number: editingTable.table_number, capacity: editingTable.capacity, section_id: editingTable.section_id || '' }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.table_number || !form.section_id) {
      alert('Table number and section are required.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...form, table_number: Number(form.table_number), capacity: Number(form.capacity) }, editingTable?.id);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div className="modal__title">{editingTable ? 'Edit table' : 'Add table'}</div>
          <button className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <form onSubmit={handleSubmit} className="modal__body">
          <div className="field-grid">
            <div className="field">
              <label>Table number</label>
              <input
                type="number"
                min={1}
                value={form.table_number}
                onChange={(e) => setForm({ ...form, table_number: e.target.value })}
                required
                placeholder="e.g. 5"
              />
            </div>
            <div className="field">
              <label>Capacity (seats)</label>
              <input
                type="number"
                min={1}
                max={20}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="field">
            <label>Section</label>
            <select
              value={form.section_id}
              onChange={(e) => setForm({ ...form, section_id: e.target.value })}
              required
            >
              <option value="">Select section…</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.section_name}</option>)}
            </select>
          </div>

          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : editingTable ? 'Update table' : 'Add table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function QRManagement() {
  const [tables, setTables] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingTable, setEditingTable] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tablesRes, sectionsRes] = await Promise.all([
        supabase.from('restaurant_tables').select('id, table_number, capacity, section_id, status, public_token').order('table_number'),
        supabase.from('restaurant_sections').select('id, section_name'),
      ]);
      if (tablesRes.error) throw tablesRes.error;
      if (sectionsRes.error) throw sectionsRes.error;
      setTables(tablesRes.data || []);
      setSections(sectionsRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (formData, existingId) => {
    if (existingId) {
      const { error: e } = await supabase
        .from('restaurant_tables')
        .update({ table_number: formData.table_number, capacity: formData.capacity, section_id: formData.section_id })
        .eq('id', existingId);
      if (e) throw e;
    } else {
      const { error: e } = await supabase
        .from('restaurant_tables')
        .insert([{ table_number: formData.table_number, capacity: formData.capacity, section_id: formData.section_id, status: 'available' }]);
      if (e) throw e;
    }
    await fetchData();
  };

  const handleDelete = async (tableId, tableNumber) => {
    if (!confirm(`Delete Table ${tableNumber}? This cannot be undone.`)) return;
    try {
      const { error: e } = await supabase.from('restaurant_tables').delete().eq('id', tableId);
      if (e) throw e;
      await fetchData();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handlePrint = (table) => {
    const tableNumber = table.table_number;
    const qrUrl = getQrUrl(table.public_token);
    const printWin = window.open('', '_blank');
    if (!printWin) { alert('Please allow pop-ups to print QR codes.'); return; }
    printWin.document.write(`
      <html><head><title>Table ${tableNumber} QR</title>
      <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;}
      img{width:300px;height:300px;margin-bottom:1rem;}h2{color:#16181D;}p{color:#71767F;}</style></head>
      <body>
        <img src="${qrUrl}" alt="QR for Table ${tableNumber}" />
        <h2>Table ${tableNumber}</h2>
        <p>Scan to view menu &amp; place order</p>
        <script>window.onload=function(){window.print();};</script>
      </body></html>
    `);
    printWin.document.close();
  };

  const handlePrintAll = () => {
    const printWin = window.open('', '_blank');
    if (!printWin) { alert('Please allow pop-ups to print QR codes.'); return; }
    const cards = tables.map((t) => `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px dashed #C9CDD5;padding:1.5rem;page-break-inside:avoid;break-inside:avoid;">
        <img src="${getQrUrl(t.public_token)}" style="width:200px;height:200px;" alt="Table ${t.table_number}" />
        <h3 style="margin:0.5rem 0 0.25rem;color:#16181D;">Table ${t.table_number}</h3>
        <p style="margin:0;color:#71767F;font-size:0.85rem;">${t.capacity} seats</p>
      </div>
    `).join('');
    printWin.document.write(`
      <html><head><title>All Table QR Codes</title>
      <style>body{font-family:sans-serif;} .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:1rem;padding:1rem;}
      @media print{body{margin:0;padding:0;}.grid{grid-template-columns:repeat(2,1fr);gap:0.5rem;padding:0.5rem;}}</style></head>
      <body><div class="grid">${cards}</div>
      <script>window.onload=function(){window.print();};</script></body></html>
    `);
    printWin.document.close();
  };

  if (error) {
    return (
      <div className="page">
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__title">Couldn’t load tables</div>
            <div className="empty-state__sub">{error}</div>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={fetchData}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  // Group tables by section, with anything unassigned collected at the end.
  const groups = sections
    .map((s) => ({
      id: s.id,
      area: s.section_name,
      cards: tables.filter((t) => t.section_id === s.id),
    }))
    .filter((g) => g.cards.length > 0);

  const orphans = tables.filter((t) => !sections.some((s) => s.id === t.section_id));
  if (orphans.length > 0) groups.push({ id: 'none', area: 'Unassigned', cards: orphans });

  return (
    <div className="page">
      <div className="qr-bar">
        <div className="card__subtitle" style={{ flex: 1 }}>
          {tables.length} table{tables.length === 1 ? '' : 's'} — QR codes link customers to the digital menu.
        </div>
        <button className="btn btn--ghost" onClick={fetchData} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
        <button className="btn btn--ghost" onClick={handlePrintAll}>
          <Printer size={14} /> Print all
        </button>
        <button
          className="btn btn--primary"
          onClick={() => { setEditingTable(null); setShowModal(true); }}
        >
          + Add table
        </button>
      </div>

      {loading && tables.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <RefreshCw size={20} className="spin" />
            <div className="empty-state__sub">Loading tables…</div>
          </div>
        </div>
      )}

      {!loading && tables.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <span className="empty-state__mark"><QrCode size={22} /></span>
            <div className="empty-state__title">No tables yet</div>
            <div className="empty-state__sub">Add your first table to generate its QR code.</div>
          </div>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.id} className="qr-group">
          <div className="qr-group__label">{g.area}</div>
          <div className="qr-grid">
            {g.cards.map((t) => (
              <div key={t.id} className="qr-card">
                <div className="qr-card__tools">
                  <button onClick={() => { setEditingTable(t); setShowModal(true); }} title="Edit table">
                    <Edit3 size={13} />
                  </button>
                  <button
                    className="is-danger"
                    onClick={() => handleDelete(t.id, t.table_number)}
                    title="Delete table"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <img
                  src={getQrUrl(t.public_token)}
                  alt={`QR for Table ${t.table_number}`}
                  className="qr-card__img"
                />

                <div className="qr-card__id">
                  <span
                    className="qr-card__dot"
                    style={{ background: STATUS_DOT[t.status] || STATUS_DOT.cleaning }}
                    title={t.status}
                  />
                  T{t.table_number}
                  <span className="qr-card__seats">· {t.capacity} seats</span>
                </div>

                <div className="qr-card__links">
                  <a href={getQrUrl(t.public_token)} download={`table-${t.table_number}-qr.png`}>
                    <Download size={12} /> Download
                  </a>
                  <button onClick={() => handlePrint(t)}>
                    <Printer size={12} /> Print
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showModal && (
        <TableFormModal
          editingTable={editingTable}
          sections={sections}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      <style>{`
        .qr-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

        .qr-group { display: flex; flex-direction: column; gap: 12px; }

        .qr-group__label {
          font-size: 13px;
          font-weight: 700;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .qr-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 12px;
        }

        .qr-card {
          position: relative;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }

        .qr-card__tools {
          position: absolute;
          top: 8px;
          right: 8px;
          display: flex;
          gap: 4px;
          opacity: 0;
          transition: var(--transition-smooth);
        }
        .qr-card:hover .qr-card__tools { opacity: 1; }

        .qr-card__tools button {
          width: 24px;
          height: 24px;
          border: 1px solid var(--color-border);
          border-radius: 7px;
          background: var(--color-surface);
          color: var(--color-text-muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .qr-card__tools button:hover { color: var(--color-text); background: var(--color-canvas); }
        .qr-card__tools .is-danger:hover { color: var(--color-danger); border-color: var(--color-danger-border); }

        .qr-card__img {
          width: 84px;
          height: 84px;
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 6px;
          box-sizing: border-box;
        }

        .qr-card__id {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          font-weight: 700;
        }

        .qr-card__dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .qr-card__seats { font-size: 12px; font-weight: 500; color: var(--color-text-muted); }

        .qr-card__links { display: flex; gap: 10px; font-size: 12px; font-weight: 600; }
        .qr-card__links a,
        .qr-card__links button {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: var(--color-info);
          background: none;
          border: none;
          text-decoration: none;
          font-size: inherit;
          font-weight: inherit;
        }
        .qr-card__links a:hover,
        .qr-card__links button:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}
