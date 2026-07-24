import React, { useState, useRef, useEffect } from 'react';
import { Palette, Upload, Check, Loader, Image as ImageIcon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { applyDashboardTheme } from '../lib/theme';

export default function Branding() {
  const { tokens, logoUrl, saveTheme, uploadLogo } = useTheme();
  const [primary, setPrimary] = useState(tokens.primary);
  const [accent, setAccent] = useState(tokens.accent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => { setPrimary(tokens.primary); setAccent(tokens.accent); }, [tokens]);

  // Live preview as the owner drags the color pickers.
  useEffect(() => { applyDashboardTheme({ primary, accent }); }, [primary, accent]);

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      await saveTheme({ primary, accent });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message || 'Could not save theme.');
    } finally {
      setSaving(false);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('Logo must be under 2 MB.'); return; }
    setUploading(true); setError('');
    try {
      await uploadLogo(file);
    } catch (e) {
      setError(e.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="branding-view">
      <div className="branding-head">
        <h2><Palette size={22} /> Branding</h2>
        <p>Make the POS and your customer menu match your restaurant.</p>
      </div>

      {error && <div className="branding-error">{error}</div>}

      <div className="branding-grid">
        <section className="branding-card">
          <h3>Logo</h3>
          <div className="logo-preview">
            {logoUrl ? <img src={logoUrl} alt="Restaurant logo" /> : <div className="logo-empty"><ImageIcon size={28} /><span>No logo yet</span></div>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} hidden />
          <button className="branding-btn ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <><Loader size={16} className="spin" /> Uploading…</> : <><Upload size={16} /> Upload logo</>}
          </button>
          <small>PNG or JPG, up to 2 MB.</small>
        </section>

        <section className="branding-card">
          <h3>Theme colors</h3>
          <label className="color-row">
            <span>Primary</span>
            <div className="color-input">
              <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} />
              <input type="text" value={primary} onChange={(e) => setPrimary(e.target.value)} />
            </div>
          </label>
          <label className="color-row">
            <span>Accent</span>
            <div className="color-input">
              <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
              <input type="text" value={accent} onChange={(e) => setAccent(e.target.value)} />
            </div>
          </label>

          <div className="swatch-preview">
            <div className="swatch" style={{ background: primary }}>Primary</div>
            <div className="swatch" style={{ background: accent }}>Accent</div>
          </div>

          <button className="branding-btn" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader size={16} className="spin" /> Saving…</> : saved ? <><Check size={16} /> Saved</> : 'Save theme'}
          </button>
        </section>
      </div>

      <style>{`
        .branding-view { padding: 1.5rem 2rem; }
        .branding-head h2 { display: flex; align-items: center; gap: 0.5rem; font-size: 1.5rem; font-weight: 800; color: var(--color-primary); margin: 0; }
        .branding-head p { color: var(--color-text-muted); font-weight: 600; font-size: 0.85rem; margin: 0.25rem 0 1.5rem; }
        .branding-error { background: rgba(214,40,40,0.06); color: var(--color-primary); font-weight: 600; font-size: 0.85rem; padding: 0.7rem 1rem; border-radius: 10px; margin-bottom: 1rem; }
        .branding-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem; max-width: 760px; }
        .branding-card { background: white; border: 1px solid var(--color-border); border-radius: 16px; padding: 1.5rem; }
        .branding-card h3 { font-size: 1rem; font-weight: 700; color: var(--color-primary); margin: 0 0 1rem; }
        .logo-preview { display: flex; align-items: center; justify-content: center; height: 120px; border: 1px dashed var(--color-border); border-radius: 12px; margin-bottom: 1rem; overflow: hidden; background: var(--color-bg); }
        .logo-preview img { max-height: 100px; max-width: 90%; object-fit: contain; }
        .logo-empty { display: flex; flex-direction: column; align-items: center; gap: 0.35rem; color: var(--color-text-muted); font-size: 0.8rem; font-weight: 600; }
        .color-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
        .color-row span { font-size: 0.82rem; font-weight: 700; color: var(--color-text-muted); }
        .color-input { display: flex; align-items: center; gap: 0.5rem; }
        .color-input input[type=color] { width: 40px; height: 34px; border: 1px solid var(--color-border); border-radius: 8px; padding: 2px; background: white; cursor: pointer; }
        .color-input input[type=text] { width: 96px; padding: 0.5rem; border: 1px solid var(--color-border); border-radius: 8px; font-size: 0.85rem; font-weight: 600; color: var(--color-primary); text-transform: uppercase; }
        .swatch-preview { display: flex; gap: 0.5rem; margin: 0.5rem 0 1.25rem; }
        .swatch { flex: 1; text-align: center; padding: 1rem 0; border-radius: 10px; color: white; font-size: 0.75rem; font-weight: 700; }
        .branding-btn { display: flex; align-items: center; justify-content: center; gap: 0.4rem; width: 100%; padding: 0.75rem; background: var(--color-primary); color: white; border: none; border-radius: 10px; font-weight: 700; font-size: 0.88rem; cursor: pointer; }
        .branding-btn.ghost { background: white; color: var(--color-primary); border: 1px solid var(--color-border); }
        .branding-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .branding-card small { display: block; text-align: center; color: var(--color-text-muted); font-size: 0.72rem; margin-top: 0.5rem; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
