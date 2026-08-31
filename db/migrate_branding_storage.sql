-- =============================================================================
-- Spice OS — Branding Storage (logos) + policies
-- =============================================================================
-- Run once in the SQL Editor. Creates a public 'branding' bucket where each
-- restaurant owns a folder named after its restaurant_id. Diners read logos
-- without auth (public); only a restaurant's own members can write its folder.
-- =============================================================================

-- Logo lives on restaurant_themes (owner-writable) rather than restaurants
-- (which only platform admins may update).
alter table public.restaurant_themes add column if not exists logo_url text;

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- Public read (diners load the logo unauthenticated)
drop policy if exists branding_read_public on storage.objects;
create policy branding_read_public on storage.objects
  for select
  using (bucket_id = 'branding');

-- Write only within your own restaurant's folder: branding/<restaurant_id>/...
drop policy if exists branding_write_own on storage.objects;
create policy branding_write_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = (select public.current_restaurant_id())::text
  );

drop policy if exists branding_update_own on storage.objects;
create policy branding_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = (select public.current_restaurant_id())::text
  );

drop policy if exists branding_delete_own on storage.objects;
create policy branding_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = (select public.current_restaurant_id())::text
  );
