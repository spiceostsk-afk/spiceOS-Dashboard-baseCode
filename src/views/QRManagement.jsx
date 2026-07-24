import React, { useState, useEffect } from 'react';
import { QrCode, RefreshCw, Printer, Download, Plus, Edit3, Trash2, X } from 'lucide-react';
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

const EMPTY_FORM = { table_number: '', capacity: 2, section_id: '' };

function TableFormModal({ editingTable, sections, onSave, onClose }) {
  const [form, setForm] = useState(editingTable ? { table_number: editingTable.table_number, capacity: editingTable.capacity, section_id: editingTable.section_id || '' } : EMPTY_FORM);
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editingTable ? 'Edit Table' : 'Add New Table'}</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Table Number</label>
            <input type="number" min={1} value={form.table_number} onChange={(e) => setForm({ ...form, table_number: e.target.value })} required placeholder="e.g. 5" />
          </div>
          <div className="form-group">
            <label>Capacity (Seats)</label>
            <input type="number" min={1} max={20} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Section</label>
            <select value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })} required>
              <option value="">Select section...</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.section_name}</option>)}
            </select>
          </div>
          <div className="modal-footer">
            <button type="submit" className="save-btn" disabled={saving}>
              {saving ? 'Saving...' : editingTable ? 'Update Table' : 'Add Table'}
            </button>
          </div>
        </form>
        <style>{`
          .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
          .modal-content { background: white; width: 400px; border-radius: 20px; overflow: hidden; box-shadow: var(--shadow-soft); border: 1px solid var(--color-border); }
          .modal-header { padding: 1.25rem 1.5rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); }
          .modal-header h2 { font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin: 0; }
          .close-btn { color: var(--color-text-muted); background: none; border: none; cursor: pointer; }
          .modal-form { padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
          .form-group { display: flex; flex-direction: column; gap: 0.3rem; }
          .form-group label { font-size: 0.78rem; font-weight: 700; color: var(--color-text-muted); }
          .form-group input, .form-group select { padding: 0.65rem 0.85rem; border: 1px solid var(--color-border); border-radius: 8px; font-size: 0.9rem; color: var(--color-primary); font-weight: 600; background: white; outline: none; }
          .form-group input:focus, .form-group select:focus { border-color: var(--color-accent); }
          .modal-footer { margin-top: 0.5rem; }
          .save-btn { width: 100%; padding: 0.75rem; background: var(--color-primary); color: white; border: none; border-radius: 10px; font-weight: 700; font-size: 0.9rem; cursor: pointer; }
          .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        `}</style>
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
      const { error } = await supabase
        .from('restaurant_tables')
        .update({ table_number: formData.table_number, capacity: formData.capacity, section_id: formData.section_id })
        .eq('id', existingId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('restaurant_tables')
        .insert([{ table_number: formData.table_number, capacity: formData.capacity, section_id: formData.section_id, status: 'available' }]);
      if (error) throw error;
    }
    await fetchData();
  };

  const handleDelete = async (tableId, tableNumber) => {
    if (!confirm(`Delete Table ${tableNumber}? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('restaurant_tables').delete().eq('id', tableId);
      if (error) throw error;
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
      img{width:300px;height:300px;margin-bottom:1rem;}h2{color:#333;}p{color:#666;}</style></head>
      <body>
        <img src="${qrUrl}" alt="QR for Table ${tableNumber}" />
        <h2>Table ${tableNumber}</h2>
        <p>Scan to view menu & place order</p>
        <script>window.onload=function(){window.print();};</script>
      </body></html>
    `);
    printWin.document.close();
  };

  const handlePrintAll = () => {
    const printWin = window.open('', '_blank');
    if (!printWin) { alert('Please allow pop-ups to print QR codes.'); return; }
    const cards = tables.map((t) => `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px dashed #ccc;padding:1.5rem;page-break-inside:avoid;break-inside:avoid;">
        <img src="${getQrUrl(t.public_token)}" style="width:200px;height:200px;" alt="Table ${t.table_number}" />
        <h3 style="margin:0.5rem 0 0.25rem;color:#333;">Table ${t.table_number}</h3>
        <p style="margin:0;color:#666;font-size:0.85rem;">${t.capacity} Seats</p>
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

  if (loading) {
    return (
      <div className="loading-state">
        <RefreshCw className="spinner" size={24} /> Loading tables...
        <style>{`
          .loading-state { display: flex; align-items: center; justify-content: center; gap: 0.75rem; height: 100%; font-weight: 700; color: var(--color-text-muted); }
          .spinner { animation: spin 1s linear infinite; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <p>Failed to load: {error}</p>
        <button className="retry-btn" onClick={fetchData}>Retry</button>
        <style>{`
          .error-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; height: 100%; color: var(--color-text-muted); font-weight: 600; }
          .retry-btn { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="qr-view">
      <div className="page-header">
        <div>
          <h2>QR Code Management</h2>
          <p className="page-subtitle">{tables.length} tables — QR codes link customers to the menu</p>
        </div>
        <div className="header-actions">
          <button className="action-btn" onClick={fetchData}><RefreshCw size={16} /> Refresh</button>
          <button className="action-btn primary" onClick={() => { setEditingTable(null); setShowModal(true); }}><Plus size={16} /> Add Table</button>
          <button className="action-btn primary" onClick={handlePrintAll}><Printer size={16} /> Print All</button>
        </div>
      </div>

      <div className="qr-grid">
        {tables.map((t) => (
          <div key={t.id} className="qr-card">
            <div className="qr-card-actions-top">
              <button className="icon-action" onClick={() => { setEditingTable(t); setShowModal(true); }} title="Edit Table"><Edit3 size={14} /></button>
              <button className="icon-action danger" onClick={() => handleDelete(t.id, t.table_number)} title="Delete Table"><Trash2 size={14} /></button>
            </div>
            <div className="qr-image-wrapper">
              <img src={getQrUrl(t.public_token)} alt={`QR for Table ${t.table_number}`} className="qr-image" />
            </div>
            <div className="qr-card-info">
              <h3>Table {t.table_number}</h3>
              <span className="qr-capacity">{t.capacity} Seats</span>
              <span className={`qr-status status-${t.status}`}>{t.status}</span>
            </div>
            <div className="qr-card-actions">
              <button className="qr-action-btn" onClick={() => handlePrint(t)} title="Print QR"><Printer size={14} /> Print</button>
              <a href={getQrUrl(t.public_token)} download={`table-${t.table_number}-qr.png`} className="qr-action-btn" title="Download QR"><Download size={14} /> Download</a>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <TableFormModal
          editingTable={editingTable}
          sections={sections}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      <style>{`
        .qr-view { padding: 1.5rem 2rem; }
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
        .page-header h2 { font-size: 1.5rem; font-weight: 800; color: var(--color-primary); margin: 0; }
        .page-subtitle { font-size: 0.85rem; color: var(--color-text-muted); margin: 0.15rem 0 0 0; font-weight: 600; }
        .header-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .action-btn { display: flex; align-items: center; gap: 0.35rem; padding: 0.5rem 0.85rem; border: 1px solid var(--color-border); border-radius: 8px; font-size: 0.8rem; font-weight: 700; color: var(--color-primary); background: white; cursor: pointer; }
        .action-btn.primary { background: var(--color-primary); color: white; border-color: var(--color-primary); }
        .action-btn.primary:hover { background: #B71C1C; }
        .qr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1.25rem; }
        .qr-card { background: white; border: 1px solid var(--color-border); border-radius: 14px; overflow: hidden; text-align: center; position: relative; }
        .qr-card-actions-top { position: absolute; top: 0.5rem; right: 0.5rem; display: flex; gap: 0.25rem; }
        .icon-action { width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--color-border); background: white; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--color-text-muted); }
        .icon-action:hover { background: var(--color-sidebar); color: var(--color-primary); }
        .icon-action.danger:hover { color: #d32f2f; border-color: #d32f2f; }
        .qr-image-wrapper { padding: 1.5rem 1.5rem 0; display: flex; justify-content: center; }
        .qr-image { width: ${QR_SIZE}px; height: ${QR_SIZE}px; border-radius: 8px; }
        .qr-card-info { padding: 0.75rem 1rem; }
        .qr-card-info h3 { font-size: 1rem; font-weight: 700; color: var(--color-primary); margin: 0; }
        .qr-capacity { font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; display: block; margin: 0.15rem 0; }
        .qr-status { display: inline-block; font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 700; text-transform: capitalize; background: var(--color-bg); color: var(--color-text-muted); }
        .status-occupied { background: #E8F5E9; color: #2E7D32; }
        .status-available { background: #E3F2FD; color: #1565C0; }
        .status-cleaning { background: #FFF3E0; color: #E65100; }
        .status-billing { background: #F3E5F5; color: #6A1B9A; }
        .qr-card-actions { display: flex; gap: 0.5rem; padding: 0.75rem 1rem 1.25rem; justify-content: center; }
        .qr-action-btn { display: flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.7rem; border: 1px solid var(--color-border); border-radius: 6px; font-size: 0.75rem; font-weight: 700; color: var(--color-primary); background: white; cursor: pointer; text-decoration: none; }
        .qr-action-btn:hover { background: var(--color-sidebar); }
      `}</style>
    </div>
  );
}
