import React, { useState } from 'react';
import { Users, RefreshCw, Edit3, Trash2, X, Key, Search } from 'lucide-react';
import { useStaffData } from '../hooks/useStaffData';

const ROLE_TONES = {
  manager: { label: 'Manager', tone: 'tone-ink' },
  staff: { label: 'Staff', tone: 'tone-blue' },
};

const EMPTY_FORM = { name: '', phone: '', email: '', role: 'staff', pin: '' };

const initialsOf = (name) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function StaffFormModal({ editingMember, onSave, onClose }) {
  const [form, setForm] = useState(
    editingMember
      ? {
          name: editingMember.name,
          phone: editingMember.phone || '',
          email: editingMember.email || '',
          role: editingMember.role,
          pin: editingMember.pin || '',
        }
      : EMPTY_FORM,
  );
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

  const pinDigits = (form.pin || '').padEnd(4, ' ').slice(0, 4).split('');

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div className="modal__title">{editingMember ? 'Edit staff' : 'Add staff'}</div>
          <button className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <form onSubmit={handleSubmit} className="modal__body">
          <div className="field">
            <label>Full name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="e.g. Priya Nair"
            />
          </div>

          <div className="field-grid">
            <div className="field">
              <label>Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91"
              />
            </div>
            <div className="field">
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="name@example.com"
            />
          </div>

          <div className="field">
            <label>4-digit PIN <span className="pin-hint">leave blank to auto-generate</span></label>
            <div className="pin-row">
              <div className="pin-boxes" aria-hidden="true">
                {pinDigits.map((d, i) => (
                  <span key={i} className={`pin-box ${d.trim() ? 'filled' : ''}`}>
                    {d.trim() ? '•' : ''}
                  </span>
                ))}
              </div>
              <input
                type="text"
                className="pin-input"
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="Auto-generate"
                maxLength={4}
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : editingMember ? 'Update staff' : 'Add staff'}
            </button>
          </div>
        </form>

        <style>{`
          .pin-hint { font-weight: 500; color: var(--color-text-muted); }
          .pin-row { display: flex; align-items: center; gap: 12px; }
          .pin-boxes { display: flex; gap: 8px; }
          .pin-box {
            width: 46px;
            height: 46px;
            border: 1px solid var(--color-border);
            border-radius: var(--radius-sm);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            font-weight: 700;
            color: var(--color-text);
          }
          .pin-box.filled { border-color: var(--color-border-strong); }
          .pin-input { flex: 1; min-width: 0; }
        `}</style>
      </div>
    </div>
  );
}

export default function Staff() {
  const { staff, loading, error, saving, addStaff, updateStaff, deleteStaff, regeneratePin } = useStaffData();
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? staff.filter(
        (m) =>
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          (m.phone || '').includes(search),
      )
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

  if (error) {
    return (
      <div className="page">
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__title">Couldn’t load staff</div>
            <div className="empty-state__sub">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  const activeCount = staff.filter((m) => m.active).length;
  const managers = staff.filter((m) => m.role === 'manager').length;

  const metrics = [
    { label: 'Total staff', value: staff.length, color: 'var(--color-text)', size: '' },
    { label: 'Active', value: activeCount, color: 'var(--color-success)', size: '' },
    {
      label: 'Roles',
      value: `Manager ${managers} · Staff ${staff.length - managers}`,
      color: 'var(--color-text)',
      size: 'metric-card__value--sm',
    },
  ];

  return (
    <div className="page">
      <div className="staff-top">
        <div className="metric-grid metric-grid--3" style={{ flex: 1 }}>
          {metrics.map((m) => (
            <div key={m.label} className="metric-card">
              <div className="metric-card__label">{m.label}</div>
              <div className={`metric-card__value ${m.size}`} style={{ color: m.color }}>
                {loading && staff.length === 0 ? '—' : m.value}
              </div>
            </div>
          ))}
        </div>
        <button
          className="btn btn--primary"
          style={{ marginTop: 4 }}
          onClick={() => { setEditingMember(null); setShowModal(true); }}
          disabled={saving}
        >
          + Add staff
        </button>
      </div>

      <div className="search-input" style={{ width: 300 }}>
        <Search size={15} />
        <input
          type="text"
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="table-card">
        <div className="table-head">
          <div className="st-name">Staff</div>
          <div className="st-role">Role</div>
          <div className="st-phone">Phone</div>
          <div className="st-pin">PIN</div>
          <div className="st-status">Status</div>
          <div className="st-actions" />
        </div>

        {loading && staff.length === 0 && (
          <div className="empty-state">
            <RefreshCw size={20} className="spin" />
            <div className="empty-state__sub">Loading staff…</div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><Users size={22} /></span>
            <div className="empty-state__title">No staff members found</div>
            <div className="empty-state__sub">
              {staff.length === 0 ? 'Add your first staff member to get started.' : 'Try a different search.'}
            </div>
          </div>
        )}

        {filtered.map((m) => {
          const role = ROLE_TONES[m.role] || ROLE_TONES.staff;
          return (
            <div key={m.id} className="table-row">
              <div className="st-name">
                <span className="st-avatar">{initialsOf(m.name)}</span>
                <span className="strong">{m.name}</span>
              </div>
              <div className="st-role"><span className={`pill ${role.tone}`}>{role.label}</span></div>
              <div className="st-phone muted tnum">{m.phone || '—'}</div>
              <div className="st-pin">
                <span className="st-pin-value">{m.pin}</span>
                <button
                  className="st-icon"
                  onClick={() => handleRegeneratePin(m.id, m.name)}
                  title="Regenerate PIN"
                >
                  <Key size={12} />
                </button>
              </div>
              <div className="st-status">
                <span className="st-dot" style={{ background: m.active ? 'var(--color-success)' : 'var(--color-border-strong)' }} />
                <span style={{ color: m.active ? 'var(--color-success)' : 'var(--color-text-muted)', fontWeight: 600, fontSize: 12.5 }}>
                  {m.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="st-actions">
                <button className="st-icon" onClick={() => { setEditingMember(m); setShowModal(true); }} title="Edit">
                  <Edit3 size={13} />
                </button>
                <button className="st-icon is-danger" onClick={() => deleteStaff(m.id)} title="Remove">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <StaffFormModal
          editingMember={editingMember}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      <style>{`
        .staff-top { display: flex; align-items: flex-start; gap: 16px; }

        .st-name { flex: 1.4; min-width: 0; display: flex; align-items: center; gap: 10px; }
        .st-role { width: 90px; }
        .st-phone { width: 140px; }
        .st-pin { width: 110px; display: flex; align-items: center; gap: 8px; }
        .st-status { width: 110px; display: flex; align-items: center; gap: 7px; }
        .st-actions { width: 70px; display: flex; gap: 6px; justify-content: flex-end; }

        .st-avatar {
          width: 30px;
          height: 30px;
          flex-shrink: 0;
          border-radius: 50%;
          background: var(--color-well);
          color: var(--color-text-soft);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
        }

        .st-pin-value {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 13px;
          letter-spacing: 2px;
          color: var(--color-text-muted);
        }

        .st-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

        .st-icon {
          width: 26px;
          height: 26px;
          border: 1px solid var(--color-border);
          border-radius: 7px;
          background: var(--color-surface);
          color: var(--color-text-muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .st-icon:hover { background: var(--color-canvas); color: var(--color-text); }
        .st-icon.is-danger:hover { color: var(--color-danger); border-color: var(--color-danger-border); }
      `}</style>
    </div>
  );
}
