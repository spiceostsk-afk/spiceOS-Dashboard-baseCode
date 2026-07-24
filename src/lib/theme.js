// Canonical brand tokens stored in restaurant_themes.tokens, mapped to the
// dashboard's CSS variables at runtime. Keep the default in sync with index.css.

export const DEFAULT_TOKENS = {
  primary: '#D62828',
  accent: '#E23744',
};

/** Lighten a hex color toward white by `amount` (0..1) — used for soft accents. */
function tint(hex, amount) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const mix = (c) => Math.round(parseInt(c, 16) + (255 - parseInt(c, 16)) * amount);
  const to2 = (n) => n.toString(16).padStart(2, '0');
  return `#${to2(mix(m[1]))}${to2(mix(m[2]))}${to2(mix(m[3]))}`;
}

/** Apply brand tokens to the dashboard's CSS custom properties. */
export function applyDashboardTheme(tokens) {
  const t = { ...DEFAULT_TOKENS, ...(tokens || {}) };
  const root = document.documentElement;
  root.style.setProperty('--color-primary', t.primary);
  root.style.setProperty('--color-accent', t.accent);
  root.style.setProperty('--color-accent-soft', tint(t.accent, 0.88));
  root.style.setProperty('--color-status-occupied', t.primary);
  root.style.setProperty('--color-sidebar', tint(t.primary, 0.94));
}
