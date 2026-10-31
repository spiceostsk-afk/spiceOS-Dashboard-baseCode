// A `.in('col', ids)` filter travels in the URL, and a few hundred uuids push
// it past what the server will accept — the request comes back 400 "Bad
// Request" once a report spans more than a week or so. Splitting the list and
// firing the pieces together keeps it to one round trip of wall time.
const CHUNK = 150;

/**
 * Runs `build(slice)` (a Supabase query with `.in(...)` on the slice) for each
 * chunk of `ids` in parallel and merges the rows. Resolves to the same
 * `{ data, error }` shape as a single query; the first error wins.
 */
export async function selectInChunks(ids, build) {
  if (!ids || ids.length === 0) return { data: [], error: null };
  const slices = [];
  for (let i = 0; i < ids.length; i += CHUNK) slices.push(ids.slice(i, i + CHUNK));
  const results = await Promise.all(slices.map((s) => build(s)));
  const failed = results.find((r) => r.error);
  if (failed) return { data: null, error: failed.error };
  return { data: results.flatMap((r) => r.data || []), error: null };
}

// PostgREST hands back at most 1000 rows per request and says nothing about
// the rest — a report over three weeks of a busy restaurant just stops at the
// latest thousand bills. Paging past it costs nothing on a normal day: the
// second request only goes out when the first one came back full.
const PAGE = 1000;

/**
 * Runs `build()` (a Supabase query with a stable `.order(...)`) one page at a
 * time with `.range()` until a short page comes back, and merges the rows.
 * Resolves to the same `{ data, error }` shape as a single query.
 */
export async function selectAllPages(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return { data: rows, error: null };
  }
}
