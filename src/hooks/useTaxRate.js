import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import * as db from '../lib/db';
import { TAX_RATE } from '../lib/calculations';

function toRate(pct) {
  if (pct === null || pct === undefined || pct === '') return null;
  const n = Number(pct);
  return Number.isFinite(n) && n >= 0 ? n / 100 : null;
}

/**
 * The GST rate saved in Settings, as a fraction (0.05 = 5%).
 *
 * Every till screen used to multiply by a hard-coded 10%, so changing the rate
 * in Settings did nothing. Reads Supabase first, then the copy Settings keeps
 * in IndexedDB for offline use, and only then falls back to TAX_RATE (the same
 * 10% the Settings page shows when nothing has been saved).
 *
 * Note: a saved 0 is a real rate, not "unset" — hence the explicit null checks.
 */
// The last rate read, so moving between Billing and the menu starts on the
// real rate instead of showing totals at the default until the read returns.
let lastKnownRate = null;

export function useTaxRate() {
  const [rate, setRate] = useState(() => lastKnownRate ?? TAX_RATE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let found = null;
      try {
        const { data, error } = await supabase
          .from('restaurant_settings')
          .select('value')
          .eq('key', 'tax')
          .maybeSingle();
        if (!error) found = toRate(data?.value?.gstRate);
      } catch { /* offline — try the local copy */ }

      if (found === null) {
        try {
          const local = await db.getMeta('settings');
          found = toRate(local?.tax?.gstRate);
        } catch { /* no local copy either */ }
      }

      if (found !== null) lastKnownRate = found;
      if (!cancelled && found !== null) setRate(found);
    })();
    return () => { cancelled = true; };
  }, []);

  return rate;
}
