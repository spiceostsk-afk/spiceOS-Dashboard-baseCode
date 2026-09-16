import { fmtDateTime } from './dates';

/**
 * Kitchen order tickets, shared by the order screen and Billing.
 *
 * A KOT tells the kitchen what to cook. It is not a sale: nothing is earned
 * until the bill is settled, and every revenue figure reads settled bills only.
 */

/**
 * Which lines have already gone to the kitchen, per session.
 *
 * A table is built up in rounds: two starters, then a main twenty minutes
 * later. Reprinting the whole bill as a KOT each round tells the kitchen to
 * cook the starters again, so a round has to know what was already sent.
 *
 * Kept in localStorage rather than on the row because it is a property of this
 * till, not of the order: another terminal printing its own ticket does not
 * mean this one's docket came out. It survives a refresh, which is what a
 * crashed browser mid-service actually needs.
 */
const KOT_SENT_KEY = (sessionId) => `spiceos.kot.sent.${sessionId}`;

export function readKotSent(sessionId) {
  if (!sessionId) return new Set();
  try {
    const raw = window.localStorage.getItem(KOT_SENT_KEY(sessionId));
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    // A private window, or storage turned off. Losing the round history just
    // means the next ticket carries everything — never a broken screen.
    return new Set();
  }
}

export function writeKotSent(sessionId, ids) {
  if (!sessionId) return;
  try {
    window.localStorage.setItem(KOT_SENT_KEY(sessionId), JSON.stringify([...ids]));
  } catch {
    /* nothing to do — the ticket still printed */
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

/**
 * The ticket itself. Carries what to cook, never money.
 *
 * items: [{ qty, name }]
 * subtitle: "Kitchen Order Ticket · Round 2", "REPRINT — full table", …
 */
export function kotTicketHtml({ tableNumber, billId, guests, items, subtitle }) {
  const rows = items
    .map((i) => `<tr><td class="qty">${esc(i.qty)}</td><td>${esc(i.name)}</td></tr>`)
    .join('');

  return `<!DOCTYPE html><html><head><title>KOT - ${esc(billId)}</title>
  <style>
    body { font-family: 'Courier New', monospace; width: 280px; margin: 0 auto; padding: 0.75rem; font-size: 13px; }
    h2 { text-align: center; font-size: 18px; margin: 0 0 2px 0; letter-spacing: 2px; }
    .sub { text-align: center; font-size: 11px; color: #555; margin: 0 0 8px 0; }
    hr { border: none; border-top: 1px dashed #333; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    td { padding: 5px 0; vertical-align: top; }
    .qty { width: 34px; font-weight: bold; font-size: 16px; }
    .meta { font-size: 12px; }
    @media print { body { margin: 0; padding: 0.5rem; } @page { margin: 0; } }
  </style></head><body>
  <h2>KOT</h2>
  <div class="sub">${esc(subtitle)}</div>
  <hr/>
  <div class="meta"><strong>Table:</strong> T-${esc(tableNumber || '—')} &nbsp; <strong>Bill #:</strong> ${esc(billId)}</div>
  <div class="meta"><strong>Guests:</strong> ${esc(guests || '—')}</div>
  <div class="meta"><strong>Time:</strong> ${fmtDateTime(new Date())}</div>
  <hr/>
  <table>${rows}</table>
  <hr/>
  <div class="sub">${items.length} line${items.length === 1 ? '' : 's'}</div>
  <script>window.print();window.close();</script>
  </body></html>`;
}

/** Writes a ticket into a window opened earlier, or reports that it could not. */
export function writeTicket(win, html) {
  if (!win || win.closed) return false;
  win.document.write(html);
  win.document.close();
  return true;
}
