// Canonical brand tokens stored in restaurant_themes.tokens, mapped to the
// dashboard's CSS variables at runtime. Keep the default in sync with index.css.

export const DEFAULT_TOKENS = {
  primary: '#D62828',
  accent: '#E23744',
};

/** Mix a hex color toward white (amount > 0) or black (amount < 0). */
function mixHex(hex, amount) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const target = amount >= 0 ? 255 : 0;
  const k = Math.abs(amount);
  const mix = (c) => {
    const v = parseInt(c, 16);
    return Math.round(v + (target - v) * k);
  };
  const to2 = (n) => n.toString(16).padStart(2, '0');
  return `#${to2(mix(m[1]))}${to2(mix(m[2]))}${to2(mix(m[3]))}`;
}

const tint = (hex, amount) => mixHex(hex, amount);
const shade = (hex, amount) => mixHex(hex, -amount);

/**
 * Apply brand tokens to the dashboard's CSS custom properties.
 *
 * Only the brand ramp is tenant-controlled. Surfaces stay neutral and the
 * semantic status colours (green/blue/amber/red) are reserved by the system,
 * so a tenant's brand colour can never make "out of stock" look healthy.
 */
export function applyDashboardTheme(tokens) {
  const t = { ...DEFAULT_TOKENS, ...(tokens || {}) };
  const root = document.documentElement;
  root.style.setProperty('--color-primary', t.primary);
  root.style.setProperty('--color-primary-hover', shade(t.primary, 0.14));
  root.style.setProperty('--color-primary-soft', tint(t.primary, 0.9));
  root.style.setProperty('--color-accent', t.accent);
  root.style.setProperty('--color-accent-soft', tint(t.accent, 0.9));
  root.style.setProperty('--color-status-occupied', t.primary);
}
