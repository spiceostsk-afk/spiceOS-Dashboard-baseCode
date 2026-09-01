import React, { useState } from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';

/**
 * Confirming a delete, and viewing a document.
 *
 * The delete dialog always names what is going and what else goes with it.
 * "Are you sure?" tells someone nothing they did not already know; "this also
 * removes the 12 Kg it added to stock, and cannot be undone" does.
 *
 * Where a record can only be retired rather than truly removed — because
 * something else still points at it — the dialog says so instead of claiming a
 * permanence it cannot deliver.
 */

export function ConfirmDelete({
  title,
  subject,
  consequences = [],
  permanent = true,
  confirmLabel = 'Delete permanently',
  busy,
  error,
  onCancel,
  onConfirm,
}) {
  return (
    <div className="overlay" onClick={busy ? undefined : onCancel}>
      <div className="modal confirm" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div className="modal__title">{title || 'Delete this?'}</div>
          <button type="button" className="modal__close" onClick={onCancel}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="mst-note bad">{error}</div>}

          <div className={`confirm__banner ${permanent ? 'permanent' : ''}`}>
            <AlertTriangle size={17} />
            <div>
              <strong>
                {permanent
                  ? 'This will be permanently deleted.'
                  : 'This will be taken out of use.'}
              </strong>
              <div>
                {permanent
                  ? 'It cannot be undone or recovered from inside the app.'
                  : 'It stays on record because other data still refers to it.'}
              </div>
            </div>
          </div>

          {subject && <div className="confirm__subject">{subject}</div>}

          {consequences.length > 0 && (
            <ul className="confirm__list">
              {consequences.map((c) => <li key={c}>{c}</li>)}
            </ul>
          )}
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn btn--danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : <><Trash2 size={15} /> {confirmLabel}</>}
          </button>
        </div>

        <style>{`
          .confirm { width: 460px; }
          .confirm__banner {
            display: flex; gap: 11px; padding: 13px 14px;
            border-radius: var(--radius-md);
            background: var(--color-danger-soft); color: var(--color-danger);
            font-size: 12.5px; line-height: 1.5;
          }
          .confirm__banner:not(.permanent) {
            background: var(--color-warning-soft); color: var(--color-warning);
          }
          .confirm__banner strong { display: block; font-size: 13px; }
          .confirm__subject {
            font-size: 14px; font-weight: 700; padding: 11px 13px;
            background: var(--color-well); border-radius: var(--radius-md);
          }
          .confirm__list {
            margin: 0; padding-left: 18px; font-size: 12.5px;
            color: var(--color-text-muted); line-height: 1.7;
          }
        `}</style>
      </div>
    </div>
  );
}

/** Read-only look at a document — the eye icon on every list. */
export function DetailDrawer({ title, subtitle, meta = [], lines, columns, footer, onClose }) {
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer drawer--wide">
        <div className="dd__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="card__title">{title}</div>
            {subtitle && <div className="card__subtitle">{subtitle}</div>}
          </div>
          <button className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        {meta.length > 0 && (
          <div className="dd__meta">
            {meta.map((m) => (
              <div key={m.label} className="dd__meta-item">
                <span>{m.label}</span>
                <strong>{m.value}</strong>
              </div>
            ))}
          </div>
        )}

        {lines && lines.length > 0 && (
          <>
            <div className="dd__row dd__row--head">
              {columns.map((c) => (
                <div key={c.key} style={{ flex: c.flex || 1, textAlign: c.align || 'left' }}>
                  {c.label}
                </div>
              ))}
            </div>
            {lines.map((ln, i) => (
              <div className="dd__row" key={ln.id || i}>
                {columns.map((c) => (
                  <div key={c.key} style={{ flex: c.flex || 1, textAlign: c.align || 'left' }}>
                    {c.render ? c.render(ln) : ln[c.key]}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {lines && lines.length === 0 && (
          <div className="empty-state"><div className="empty-state__sub">Nothing on this document.</div></div>
        )}

        {footer && <div className="dd__foot">{footer}</div>}

        <style>{`
          .drawer--wide { width: 520px; }
          .dd__head {
            display: flex; align-items: flex-start; gap: 12px;
            padding-bottom: 16px; border-bottom: 1px solid var(--color-border);
          }
          .dd__meta {
            display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
            padding: 16px 0; border-bottom: 1px solid var(--color-border-soft);
          }
          .dd__meta-item { display: flex; flex-direction: column; gap: 2px; }
          .dd__meta-item span { font-size: 11.5px; color: var(--color-text-muted); font-weight: 600; }
          .dd__meta-item strong { font-size: 13.5px; }
          .dd__row {
            display: flex; gap: 10px; padding: 10px 0; font-size: 13px;
            border-bottom: 1px solid var(--color-border-soft);
          }
          .dd__row--head {
            font-size: 11px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.04em; color: var(--color-text-muted);
          }
          .dd__foot {
            display: flex; justify-content: space-between; align-items: center;
            padding-top: 14px; font-size: 13px; font-weight: 700;
          }
        `}</style>
      </div>
    </>
  );
}

/** Small helper: a create/rename form used by both master lists. */
export function NameModal({ title, label, initial = '', extra, onClose, onSave }) {
  const [value, setValue] = useState(initial);
  const [extras, setExtras] = useState(() =>
    Object.fromEntries((extra || []).map((f) => [f.key, f.initial ?? ''])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await onSave(value, extras);
    setSaving(false);
    if (res.success) onClose();
    else setError(res.error || 'Could not save.');
  };

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal__head">
          <div className="modal__title">{title}</div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="modal__body">
          {error && <div className="mst-note bad">{error}</div>}
          <div className="field">
            <label>{label}</label>
            <input value={value} onChange={(e) => setValue(e.target.value)} required autoFocus />
          </div>
          {(extra || []).map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              <input
                value={extras[f.key]}
                onChange={(e) => setExtras({ ...extras, [f.key]: e.target.value })}
                placeholder={f.placeholder}
              />
            </div>
          ))}
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={saving || !value.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
