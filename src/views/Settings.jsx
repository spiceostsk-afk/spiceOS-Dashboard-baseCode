import React from 'react';
import { Store, Percent, Receipt, RefreshCw, Save, Building, Phone, Mail, FileText } from 'lucide-react';
import { useSettingsData } from '../hooks/useSettingsData';

function SectionCard({ icon: Icon, title, children }) {
  return (
    <div className="section-card">
      <div className="section-header">
        <Icon size={20} />
        <h3>{title}</h3>
      </div>
      <div className="section-body">{children}</div>
      <style>{`
        .section-card { background: white; border: 1px solid var(--color-border); border-radius: 14px; overflow: hidden; }
        .section-header { display: flex; align-items: center; gap: 0.6rem; padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--color-border); background: var(--color-sidebar); }
        .section-header h3 { font-size: 1rem; font-weight: 700; color: var(--color-primary); margin: 0; }
        .section-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
      `}</style>
    </div>
  );
}

function FormField({ label, value, onChange, type, placeholder }) {
  return (
    <div className="form-field">
      <label>{label}</label>
      {type === 'textarea' ? (
        <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} />
      ) : type === 'number' ? (
        <input type="number" value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} placeholder={placeholder} min={0} max={100} step={0.5} />
      ) : type === 'checkbox' ? (
        <div className="toggle-row">
          <label className="toggle">
            <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
          <span className="toggle-label">{value ? 'Enabled' : 'Disabled'}</span>
        </div>
      ) : (
        <input type={type || 'text'} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
      <style>{`
        .form-field { display: flex; flex-direction: column; gap: 0.3rem; }
        .form-field label { font-size: 0.78rem; font-weight: 700; color: var(--color-text-muted); }
        .form-field input, .form-field textarea { padding: 0.65rem 0.85rem; border: 1px solid var(--color-border); border-radius: 8px; font-size: 0.9rem; color: var(--color-primary); font-weight: 600; background: white; outline: none; }
        .form-field input:focus, .form-field textarea:focus { border-color: var(--color-accent); }
        .toggle-row { display: flex; align-items: center; gap: 0.75rem; }
        .toggle-label { font-size: 0.85rem; font-weight: 600; color: var(--color-text-muted); }
        .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
        .toggle input { opacity: 0; width: 0; height: 0; }
        .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: #ccc; border-radius: 24px; transition: 0.3s; }
        .toggle-slider::before { content: ''; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.3s; }
        .toggle input:checked + .toggle-slider { background: var(--color-accent); }
        .toggle input:checked + .toggle-slider::before { transform: translateX(20px); }
      `}</style>
    </div>
  );
}

function FormGrid({ children }) {
  return (
    <div className="form-grid">
      {children}
      <style>{`.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }`}</style>
    </div>
  );
}

export default function Settings() {
  const { settings, loading, error, saving, updateSetting, saveSettings, refreshSettings } = useSettingsData();

  if (loading) {
    return (
      <div className="loading-state">
        <RefreshCw className="spinner" size={24} /> Loading settings...
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
        <p>Failed to load settings: {error}</p>
        <button className="retry-btn" onClick={refreshSettings}>Retry</button>
        <style>{`
          .error-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; height: 100%; color: var(--color-text-muted); font-weight: 600; }
          .retry-btn { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; }
        `}</style>
      </div>
    );
  }

  const r = settings.restaurant;
  const t = settings.tax;
  const sc = settings.serviceCharge;
  const rec = settings.receipt;

  return (
    <div className="settings-view">
      <div className="page-header">
        <div>
          <h2>Restaurant Settings</h2>
          <p className="page-subtitle">Configure your restaurant details and preferences</p>
        </div>
        <button className="save-btn" onClick={saveSettings} disabled={saving}>
          <Save size={16} /> {saving ? 'Saving...' : 'Save All Settings'}
        </button>
      </div>

      <div className="settings-grid">
        <SectionCard icon={Store} title="Restaurant Details">
          <FormGrid>
            <FormField label="Restaurant Name" value={r.name} onChange={(v) => updateSetting('restaurant', 'name', v)} placeholder="Spice OS" />
            <FormField label="GSTIN" value={r.gstin} onChange={(v) => updateSetting('restaurant', 'gstin', v)} placeholder="22AAAAA0000A1Z5" />
          </FormGrid>
          <FormField label="Address" value={r.address} onChange={(v) => updateSetting('restaurant', 'address', v)} type="textarea" placeholder="123, Main Street, City" />
          <FormGrid>
            <FormField label="Phone" value={r.phone} onChange={(v) => updateSetting('restaurant', 'phone', v)} type="tel" placeholder="+91-9876543210" />
            <FormField label="Email" value={r.email} onChange={(v) => updateSetting('restaurant', 'email', v)} type="email" placeholder="hello@spiceos.com" />
          </FormGrid>
        </SectionCard>

        <SectionCard icon={Percent} title="Tax & Service Charge">
          <FormGrid>
            <FormField label="GST Rate (%)" value={t.gstRate} onChange={(v) => updateSetting('tax', 'gstRate', v)} type="number" placeholder="10" />
            <FormField label="Service Charge (%)" value={sc.defaultRate} onChange={(v) => updateSetting('serviceCharge', 'defaultRate', v)} type="number" placeholder="10" />
          </FormGrid>
          <FormField label="Apply Service Charge" value={sc.enabled} onChange={(v) => updateSetting('serviceCharge', 'enabled', v)} type="checkbox" />
        </SectionCard>

        <SectionCard icon={Receipt} title="Receipt Settings">
          <FormField label="Footer Text" value={rec.footerText} onChange={(v) => updateSetting('receipt', 'footerText', v)} placeholder="Thank you for dining with us!" />
          <FormField label="Show GST Breakdown on Receipt" value={rec.showGst} onChange={(v) => updateSetting('receipt', 'showGst', v)} type="checkbox" />
        </SectionCard>
      </div>

      <style>{`
        .settings-view { padding: 1.5rem 2rem; }
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
        .page-header h2 { font-size: 1.5rem; font-weight: 800; color: var(--color-primary); margin: 0; }
        .page-subtitle { font-size: 0.85rem; color: var(--color-text-muted); margin: 0.15rem 0 0 0; font-weight: 600; }
        .save-btn { display: flex; align-items: center; gap: 0.35rem; padding: 0.6rem 1.2rem; background: var(--color-accent); color: var(--color-primary); border: none; border-radius: 10px; font-weight: 700; font-size: 0.85rem; cursor: pointer; }
        .save-btn:hover { background: var(--color-primary); color: white; }
        .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .settings-grid { display: flex; flex-direction: column; gap: 1.25rem; max-width: 720px; }
      `}</style>
    </div>
  );
}
