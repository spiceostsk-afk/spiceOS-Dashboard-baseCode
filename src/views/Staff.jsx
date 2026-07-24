import React, { useState } from 'react';
import { Users, RefreshCw, Plus, Edit3, Trash2, X, Key, ShieldCheck, UserCog } from 'lucide-react';
import { useStaffData } from '../hooks/useStaffData';

const ROLE_CONFIG = {
  manager: { label: 'Manager', icon: UserCog, color: '#6A1B9A', bg: '#F3E5F5' },
  staff: { label: 'Staff', icon: ShieldCheck, color: '#1565C0', bg: '#E3F2FD' },
};

const EMPTY_FORM = { name: '', phone: '', email: '', role: 'staff', pin: '' };

function StaffFormModal({ editingMember, onSave, onClose }) {
  const [form, setForm] = useState(editingMember ? { name: editingMember.name, phone: editingMember.phone || '', email: editingMember.email || '', role: editingMember.role, pin: editingMember.pin || '' } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { alert('Name is required.'); return; }
    setSaving(true);
    try {
      await onSave({ ...form }, editingMember?.id);
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
          <h2>{editingMember ? 'Edit Staff' : 'Add Staff Member'}</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Full Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. John Doe" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91-9876543210" />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" />
            </div>
          </div>
          <div className="form-group">
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <div className="form-group">
            <label>PIN (4-digit, leave blank to auto-generate)</label>
            <input type="text" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="Auto-generate" maxLength={4} />
          </div>
          <div className="modal-footer">
            <button type="submit" className="save-btn" disabled={saving}>
              {saving ? 'Saving...' : editingMember ? 'Update Staff' : 'Add Staff'}
            </button>
          </div>
        </form>
        <style>{`
          .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
          .modal-content { background: white; width: 460px; border-radius: 20px; overflow: hidden; box-shadow: var(--shadow-soft); border: 1px solid var(--color-border); }
          .modal-header { padding: 1.25rem 1.5rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); }
          .modal-header h2 { font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin: 0; }
          .close-btn { color: var(--color-text-muted); background: none; border: none; cursor: pointer; }
          .modal-form { padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
          .form-group { display: flex; flex-direction: column; gap: 0.3rem; }
          .form-group label { font-size: 0.78rem; font-weight: 700; color: var(--color-text-muted); }
          .form-group input, .form-group select { padding: 0.65rem 0.85rem; border: 1px solid var(--color-border); border-radius: 8px; font-size: 0.9rem; color: var(--color-primary); font-weight: 600; background: white; outline: none; }
          .form-group input:focus, .form-group select:focus { border-color: var(--color-accent); }
          .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
          .modal-footer { margin-top: 0.5rem; }
          .save-btn { width: 100%; padding: 0.75rem; background: var(--color-primary); color: white; border: none; border-radius: 10px; font-weight: 700; font-size: 0.9rem; cursor: pointer; }
          .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        `}</style>
      </div>
    </div>
  );
}

export default function Staff() {
  const { staff, loading, error, saving, roles, addStaff, updateStaff, deleteStaff, regeneratePin } = useStaffData();
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? staff.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.phone.includes(search))
    : staff;

  const handleSave = async (formData, existingId) => {
    if (existingId) {
      await updateStaff(existingId, formData);
    } else {
      await addStaff(formData);
    }
  };

  const handleRegeneratePin = async (id, name) => {
    const newPin = await regeneratePin(id);
    alert(`New PIN for ${name}: ${newPin}`);
  };

  if (loading) {
    return (
      <div className="loading-state">
        <RefreshCw className="spinner" size={24} /> Loading staff...
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
        <style>{`
          .error-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; height: 100%; color: var(--color-text-muted); font-weight: 600; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="staff-view">
      <div className="page-header">
        <div>
          <h2>Staff Management</h2>
          <p className="page-subtitle">{staff.length} staff members</p>
        </div>
        <div className="header-actions">
          <button className="action-btn primary" onClick={() => { setEditingMember(null); setShowModal(true); }} disabled={saving}>
            <Plus size={16} /> Add Staff
          </button>
        </div>
      </div>

      <div className="search-bar">
        <input type="text" placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Users size={40} strokeWidth={1} />
          <h4>No staff members found</h4>
          <p>{staff.length === 0 ? 'Add your first staff member to get started.' : 'Try a different search.'}</p>
          <style>{`
            .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; color: var(--color-text-muted); gap: 0.5rem; }
            .empty-state h4 { font-weight: 700; color: var(--color-primary); margin: 0; }
            .empty-state p { font-size: 0.85rem; margin: 0; }
          `}</style>
        </div>
      ) : (
        <div className="staff-grid">
          {filtered.map((m) => {
            const roleCfg = ROLE_CONFIG[m.role] || ROLE_CONFIG.staff;
            const RoleIcon = roleCfg.icon;
            return (
              <div key={m.id} className="staff-card">
                <div className="staff-card-top">
                  <div className="staff-avatar">{m.name.charAt(0).toUpperCase()}</div>
                  <div className="staff-actions">
                    <button className="icon-action" onClick={() => { setEditingMember(m); setShowModal(true); }} title="Edit"><Edit3 size={14} /></button>
                    <button className="icon-action danger" onClick={() => deleteStaff(m.id)} title="Remove"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="staff-card-body">
                  <h3>{m.name}</h3>
                  <span className="role-badge" style={{ background: roleCfg.bg, color: roleCfg.color }}>
                    <RoleIcon size={12} /> {roleCfg.label}
                  </span>
                  {m.phone && <p className="staff-detail">{m.phone}</p>}
                  <div className="pin-row">
                    <span className="pin-display">PIN: <strong>{m.pin}</strong></span>
                    <button className="pin-regenerate" onClick={() => handleRegeneratePin(m.id, m.name)} title="Regenerate PIN"><Key size={12} /></button>
                  </div>
                </div>
                <div className={`staff-status ${m.active ? 'active' : 'inactive'}`}>{m.active ? 'Active' : 'Inactive'}</div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <StaffFormModal
          editingMember={editingMember}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      <style>{`
        .staff-view { padding: 1.5rem 2rem; }
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem; }
        .page-header h2 { font-size: 1.5rem; font-weight: 800; color: var(--color-primary); margin: 0; }
        .page-subtitle { font-size: 0.85rem; color: var(--color-text-muted); margin: 0.15rem 0 0 0; font-weight: 600; }
        .header-actions { display: flex; gap: 0.5rem; }
        .action-btn { display: flex; align-items: center; gap: 0.35rem; padding: 0.5rem 0.85rem; border: 1px solid var(--color-border); border-radius: 8px; font-size: 0.8rem; font-weight: 700; color: var(--color-primary); background: white; cursor: pointer; }
        .action-btn.primary { background: var(--color-primary); color: white; border-color: var(--color-primary); }
        .action-btn.primary:hover { background: #3A2E22; }
        .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .search-bar { margin-bottom: 1.25rem; }
        .search-bar input { width: 100%; max-width: 360px; padding: 0.65rem 0.85rem; border: 1px solid var(--color-border); border-radius: 10px; font-size: 0.9rem; color: var(--color-primary); font-weight: 600; background: white; outline: none; }
        .staff-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.25rem; }
        .staff-card { background: white; border: 1px solid var(--color-border); border-radius: 14px; overflow: hidden; position: relative; }
        .staff-card-top { padding: 1.25rem 1.25rem 0; display: flex; justify-content: space-between; align-items: flex-start; }
        .staff-avatar { width: 48px; height: 48px; background: var(--color-primary); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--color-accent); font-size: 1.3rem; font-weight: 800; }
        .staff-actions { display: flex; gap: 0.25rem; }
        .icon-action { width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--color-border); background: white; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--color-text-muted); }
        .icon-action:hover { background: var(--color-sidebar); color: var(--color-primary); }
        .icon-action.danger:hover { color: #d32f2f; border-color: #d32f2f; }
        .staff-card-body { padding: 0.75rem 1.25rem 1.25rem; }
        .staff-card-body h3 { font-size: 1rem; font-weight: 700; color: var(--color-primary); margin: 0 0 0.4rem; }
        .role-badge { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 6px; }
        .staff-detail { font-size: 0.82rem; color: var(--color-text-muted); font-weight: 600; margin: 0.4rem 0 0; }
        .pin-row { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
        .pin-display { font-size: 0.78rem; color: var(--color-text-muted); font-weight: 600; }
        .pin-display strong { color: var(--color-primary); font-family: monospace; letter-spacing: 2px; }
        .pin-regenerate { background: none; border: 1px solid var(--color-border); border-radius: 4px; padding: 0.2rem; cursor: pointer; color: var(--color-text-muted); display: flex; }
        .pin-regenerate:hover { color: var(--color-accent); border-color: var(--color-accent); }
        .staff-status { position: absolute; top: 1rem; right: 3.2rem; font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.4rem; border-radius: 4px; }
        .staff-status.active { background: #E8F5E9; color: #2E7D32; }
        .staff-status.inactive { background: #FFEBEE; color: #C62828; }
      `}</style>
    </div>
  );
}
