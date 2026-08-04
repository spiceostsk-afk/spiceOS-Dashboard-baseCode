import React, { useState, useRef, useEffect } from 'react';
import { Upload, Check, Loader, Image as ImageIcon } from 'lucide-react';
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

  // Live preview as the owner drags the colour pickers.
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
    } catch (e2) {
      setError(e2.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="page brand">
      <div className="card__subtitle">
        Make the POS and your customer menu match your restaurant.
      </div>

      {error && <div className="brand-error">{error}</div>}

      <div className="brand-grid">
        {/* ---- Logo ---- */}
        <div className="card">
          <div className="card__title" style={{ marginBottom: 14 }}>Logo</div>

          <div className="brand-drop" onClick={() => fileRef.current?.click()}>
            {logoUrl ? (
              <img src={logoUrl} alt="Restaurant logo" />
            ) : (
              <>
                <span className="brand-drop__mark"><ImageIcon size={18} /></span>
                <span>Drop a logo here or <span className="brand-browse">browse files</span></span>
              </>
            )}
          </div>

          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} hidden />

          <div className="brand-row">
            <button className="btn btn--ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading
                ? <><Loader size={14} className="spin" /> Uploading…</>
                : <><Upload size={14} /> {logoUrl ? 'Replace logo' : 'Upload logo'}</>}
            </button>
            <span className="brand-note">PNG or JPG, up to 2 MB.</span>
          </div>
        </div>

        {/* ---- Theme ---- */}
        <div className="card">
          <div className="card__title" style={{ marginBottom: 14 }}>Theme</div>

          <div className="brand-color">
            <div className="brand-color__label">Primary colour</div>
            <input
              type="color"
              className="brand-swatch"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              aria-label="Primary colour"
            />
            <input
              type="text"
              className="brand-hex tnum"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
            />
          </div>

          <div className="brand-color">
            <div className="brand-color__label">Accent colour</div>
            <input
              type="color"
              className="brand-swatch"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              aria-label="Accent colour"
            />
            <input
              type="text"
              className="brand-hex tnum"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
            />
          </div>

          <div className="brand-preview">
            <div className="brand-preview__card">
              <div className="brand-preview__id">D3</div>
              <div className="brand-preview__meta">₹2,160 · 68 min</div>
            </div>
            <span className="brand-preview__btn" style={{ background: primary }}>New order</span>
            <span className="brand-preview__btn" style={{ background: accent }}>Accent</span>
            <span className="brand-note">Live preview</span>
          </div>

          <div className="brand-note" style={{ marginTop: 12 }}>
            Status colours (green / blue / amber / red) are reserved by the system and cannot be overridden.
          </div>

          <button className="btn btn--primary" style={{ marginTop: 16 }} onClick={handleSave} disabled={saving}>
            {saving
              ? <><Loader size={14} className="spin" /> Saving…</>
              : saved
                ? <><Check size={14} /> Saved</>
                : 'Save theme'}
          </button>
        </div>
      </div>

      {/* ---- Customer menu preview ---- */}
      <div className="card brand-phone-card">
        <div className="brand-phone">
          <div className="brand-phone__head">
            <span className="brand-phone__mark" style={{ background: primary }}>
              {logoUrl ? <img src={logoUrl} alt="" /> : 'S'}
            </span>
            <span className="brand-phone__name">Spice OS</span>
          </div>
          <div className="brand-phone__body">
            <div className="brand-phone__row"><span>Butter Chicken</span><b>₹360</b></div>
            <div className="brand-phone__row"><span>Garlic Naan</span><b>₹60</b></div>
            <div className="brand-phone__row"><span>Masala Chai</span><b>₹40</b></div>
            <div className="brand-phone__cta" style={{ background: primary }}>Add to order</div>
          </div>
        </div>

        <div>
          <div className="card__title">Customer menu preview</div>
          <div className="card__subtitle" style={{ marginTop: 6, maxWidth: 420 }}>
            This is what customers see when they scan a table QR code — your logo and primary
            colour are applied to the digital menu automatically.
          </div>
        </div>
      </div>

      <style>{`
        .brand { max-width: 1080px; }

        .brand-error {
          background: var(--color-danger-soft);
          color: var(--color-danger);
          font-weight: 600;
          font-size: 13px;
          padding: 12px 16px;
          border-radius: var(--radius-md);
        }

        .brand-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }

        /* logo */
        .brand-drop {
          border: 1.5px dashed var(--color-border-strong);
          border-radius: var(--radius-md);
          height: 150px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: var(--color-text-muted);
          font-size: 13px;
          cursor: pointer;
          overflow: hidden;
        }
        .brand-drop:hover { border-color: var(--color-text-faint); }
        .brand-drop img { max-height: 120px; max-width: 90%; object-fit: contain; }

        .brand-drop__mark {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-sm);
          background: var(--color-well);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .brand-browse { color: var(--color-info); font-weight: 600; }

        .brand-row { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
        .brand-note { font-size: 12px; color: var(--color-text-faint); }

        /* theme */
        .brand-color { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .brand-color__label { font-size: 13px; font-weight: 600; width: 110px; flex-shrink: 0; }

        .brand-swatch {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          border: 1px solid var(--color-border);
          padding: 2px;
          background: var(--color-surface);
          cursor: pointer;
        }

        .brand-hex {
          height: 36px;
          width: 110px;
          border: 1px solid var(--color-border);
          border-radius: 9px;
          padding: 0 12px;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text);
          text-transform: uppercase;
          outline: none;
        }

        .brand-preview {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--color-canvas);
          flex-wrap: wrap;
        }

        .brand-preview__card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          padding: 10px 14px;
        }
        .brand-preview__id { font-size: 13px; font-weight: 800; }
        .brand-preview__meta { font-size: 11px; color: var(--color-text-muted); }

        .brand-preview__btn {
          height: 34px;
          padding: 0 14px;
          border-radius: 9px;
          border: none;
          color: #fff;
          font-family: inherit;
          font-size: 12px;
          font-weight: 700;
        }

        /* customer preview */
        .brand-phone-card { display: flex; gap: 28px; align-items: center; flex-wrap: wrap; }

        .brand-phone {
          width: 190px;
          flex-shrink: 0;
          border: 1px solid var(--color-border);
          border-radius: 24px;
          padding: 14px 12px;
          background: var(--color-surface);
          box-shadow: 0 8px 24px rgba(22, 24, 29, 0.08);
        }

        .brand-phone__head {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--color-border-soft);
        }

        .brand-phone__mark {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 800;
          overflow: hidden;
        }
        .brand-phone__mark img { width: 100%; height: 100%; object-fit: cover; }

        .brand-phone__name { font-size: 12px; font-weight: 800; }
        .brand-phone__body { padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
        .brand-phone__row { display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; }
        .brand-phone__row b { font-weight: 700; }

        .brand-phone__cta {
          height: 26px;
          border-radius: 8px;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
        }

        @media (max-width: 900px) {
          .brand-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
