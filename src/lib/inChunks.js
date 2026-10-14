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
