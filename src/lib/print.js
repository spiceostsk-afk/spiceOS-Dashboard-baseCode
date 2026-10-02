import { supabase } from './supabase';
import * as db from './db';

/**
 * Printing bills and kitchen tickets.
 *
 * Tickets used to go to a pop-up window that printed itself. A pop-up opened
 * after a network round trip (settling, then printing) is no longer "from a
 * click", so the browser blocked it — and the fallback was window.print() on
 * the app itself, which put the sidebar and half the billing screen on the
 * thermal roll instead of the bill.
 *
 * A hidden iframe on this page needs no permission and is never blocked:
 * the ticket's own HTML is printed, and nothing of the app around it.
 */

/** Paper: an 80 mm thermal roll prints about 72 mm wide. */
export const TICKET_CSS = `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    font-family: 'Courier New', Courier, monospace;
    width: 72mm; margin: 0 auto; padding: 3mm 2mm;
    font-size: 12px; line-height: 1.35;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  hr { border: none; border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; }
  td, th { vertical-align: top; }
`;

let frame = null;

/**
 * Prints a complete HTML document. Resolves once the print dialog has been
 * handed the page; true when it was, false if this browser has no frames.
 */
export function printHtml(html) {
  return new Promise((resolve) => {
    try {
      if (frame) frame.remove();
      frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(frame);

      const doc = frame.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();

      const win = frame.contentWindow;
      let printed = false;
      const go = () => {
        if (printed) return;
        printed = true;
        win.focus();
        win.print();
        resolve(true);
      };
      // Wait for a logo to load before printing; never longer than a moment.
      if (doc.readyState === 'complete') setTimeout(go, 50);
      else {
        win.addEventListener('load', go, { once: true });
        setTimeout(go, 1500);
      }
    } catch {
      resolve(false);
    }
  });
}

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

/**
 * What the bill's header and footer say — the restaurant's own details from
 * Settings, not a placeholder. Read from the server when it can be, the copy
 * Settings keeps on this device when it cannot, and kept in memory after that
 * so printing does not wait for the network.
 */
let profile = null;

const toProfile = (s) => ({
  name: s?.restaurant?.name || '',
  address: s?.restaurant?.address || '',
  phone: s?.restaurant?.phone || '',
  gstin: s?.restaurant?.gstin || '',
  footer: s?.receipt?.footerText || 'Thank you, visit again!',
  showGst: s?.receipt?.showGst !== false,
});

export async function loadReceiptProfile({ fresh = false } = {}) {
  if (profile && !fresh) return profile;
  try {
    const { data, error } = await supabase
      .from('restaurant_settings')
      .select('key, value')
      // Explicit, not left to RLS: a platform admin can read every tenant's rows.
      .eq('restaurant_id', db.getDbTenant())
      .in('key', ['restaurant', 'receipt']);
    if (error) throw error;
    const s = {};
    (data || []).forEach((r) => { s[r.key] = r.value; });
    profile = toProfile(s);
  } catch {
    try {
      profile = toProfile(await db.getMeta('settings'));
    } catch {
      profile = profile || toProfile(null);
    }
  }
  return profile;
}

/** Called by Settings after a save, so the next bill carries the change. */
export function forgetReceiptProfile() {
  profile = null;
}
