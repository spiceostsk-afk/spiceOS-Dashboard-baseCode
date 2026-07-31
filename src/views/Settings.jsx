import React from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { useSettingsData } from '../hooks/useSettingsData';

function SectionCard({ glyph, title, children }) {
  return (
    <div className="card">
      <div className="card__title" style={{ marginBottom: 16 }}>
        <span style={{ marginRight: 6 }}>{glyph}</span>{title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type, placeholder, span }) {
  return (
    <div className={`field ${span ? 'span-2' : ''}`}>
      <label>{label}</label>
      {type === 'textarea' ? (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          style={{ resize: 'vertical' }}
        />
      ) : type === 'number' ? (
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder={placeholder}
          min={0}
          max={100}
          step={0.5}
        />
      ) : (
        <input
          type={type || 'text'}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div className="set-toggle-row">
      <span>{label}</span>
      <button
        type="button"
        className={`toggle ${value ? 'on' : ''}`}
        onClick={() => onChange(!value)}
        aria-pressed={!!value}
        aria-label={label}
      />
    </div>
  );
}

export default function Settings() {
  const { settings, loading, error, saving, updateSetting, saveSettings, refreshSettings } = useSettingsData();

  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <div className="empty-state">
            <RefreshCw size={20} className="spin" />
            <div className="empty-state__sub">Loading settings…</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__title">Couldn’t load settings</div>
            <div className="empty-state__sub">{error}</div>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={refreshSettings}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  const r = settings.restaurant;
  const t = settings.tax;
  const sc = settings.serviceCharge;
  const rec = settings.receipt;

  return (
    <div className="page set">
      <SectionCard glyph="🏪" title="Restaurant details">
        <div className="field-grid">
          <Field
            label="Restaurant name"
            value={r.name}
            onChange={(v) => updateSetting('restaurant', 'name', v)}
            placeholder="Spice OS"
          />
          <Field
            label="GSTIN"
            value={r.gstin}
            onChange={(v) => updateSetting('restaurant', 'gstin', v)}
            placeholder="22AAAAA0000A1Z5"
          />
          <Field
            label="Address"
            value={r.address}
            onChange={(v) => updateSetting('restaurant', 'address', v)}
            type="textarea"
            placeholder="123, Main Street, City"
            span
          />
          <Field
            label="Phone"
            value={r.phone}
            onChange={(v) => updateSetting('restaurant', 'phone', v)}
            type="tel"
            placeholder="+91 98765 43210"
          />
          <Field
            label="Email"
            value={r.email}
            onChange={(v) => updateSetting('restaurant', 'email', v)}
            type="email"
            placeholder="hello@spiceos.com"
          />
        </div>
      </SectionCard>

      <SectionCard glyph="％" title="Tax & charges">
        <div className="field-grid" style={{ marginBottom: 16 }}>
          <Field
            label="GST rate (%)"
            value={t.gstRate}
            onChange={(v) => updateSetting('tax', 'gstRate', v)}
            type="number"
            placeholder="10"
          />
          <Field
            label="Service charge (%)"
            value={sc.defaultRate}
            onChange={(v) => updateSetting('serviceCharge', 'defaultRate', v)}
            type="number"
            placeholder="10"
          />
        </div>
        <ToggleRow
          label="Apply service charge"
          value={sc.enabled}
          onChange={(v) => updateSetting('serviceCharge', 'enabled', v)}
        />
      </SectionCard>

      <SectionCard glyph="🧾" title="Receipts">
        <div className="field-grid" style={{ marginBottom: 16 }}>
          <Field
            label="Footer text"
            value={rec.footerText}
            onChange={(v) => updateSetting('receipt', 'footerText', v)}
            placeholder="Thank you, visit again!"
            span
          />
        </div>
        <ToggleRow
          label="Show GST breakdown on receipt"
          value={rec.showGst}
          onChange={(v) => updateSetting('receipt', 'showGst', v)}
        />
      </SectionCard>

      <div className="set-save">
        <button className="btn btn--primary" onClick={saveSettings} disabled={saving}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <style>{`
        .set { max-width: 720px; gap: 16px; }

        .set-toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          font-size: 13.5px;
          font-weight: 600;
          color: var(--color-text);
        }
        .set-toggle-row + .set-toggle-row { margin-top: 12px; }

        .set-save { display: flex; justify-content: flex-end; }
      `}</style>
    </div>
  );
}
