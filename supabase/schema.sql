-- Barangay Court Booking: Supabase setup
-- Run this file in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  purpose text not null check (purpose in ('Event','Pickleball','Badminton','Other')),
  other_purpose text not null default '',
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  payment_method text not null check (payment_method in ('GCash','MariBank')),
  payment_proof_url text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  created_at timestamptz not null default now(),
  constraint valid_booking_time check (end_time > start_time)
);

create index if not exists bookings_date_status_idx
  on public.bookings (booking_date, status);

alter table public.bookings enable row level security;

-- Public visitors can read only the schedule fields needed for availability.
-- The frontend currently loads the bookings table for display; do not store sensitive
-- personal details in a publicly readable table for production. For production, replace
-- this policy with a public availability view/RPC and admin-only access to personal data.
create policy "Public can read bookings for schedule"
on public.bookings for select
to anon, authenticated
using (status in ('pending','approved'));

-- All reservation writes should go through the conflict-checking RPC below.
-- The anon role is not granted direct insert/update/delete privileges.
revoke insert, update, delete on public.bookings from anon, authenticated;
grant select on public.bookings to anon, authenticated;

create or replace function public.create_court_booking(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_purpose text,
  p_other_purpose text,
  p_booking_date date,
  p_start_time time,
  p_end_time time,
  p_payment_method text,
  p_payment_proof_url text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if p_booking_date < current_date then
    return jsonb_build_object('error', 'Past dates cannot be booked.');
  end if;
  if p_start_time < time '06:00' or p_end_time > time '22:00' or p_end_time <= p_start_time then
    return jsonb_build_object('error', 'Choose a valid time between 6:00 AM and 10:00 PM.');
  end if;
  if p_first_name is null or trim(p_first_name) = '' or p_last_name is null or trim(p_last_name) = '' then
    return jsonb_build_object('error', 'Name is required.');
  end if;
  if p_purpose not in ('Event','Pickleball','Badminton','Other') then
    return jsonb_build_object('error', 'Invalid booking purpose.');
  end if;
  if p_payment_method not in ('GCash','MariBank') then
    return jsonb_build_object('error', 'Invalid payment method.');
  end if;

  -- Serialize checks for a date so concurrent requests cannot claim overlapping times.
  perform pg_advisory_xact_lock(hashtext(p_booking_date::text));

  if exists (
    select 1 from public.bookings b
    where b.booking_date = p_booking_date
      and b.status in ('pending','approved')
      and b.start_time < p_end_time
      and p_start_time < b.end_time
  ) then
    return jsonb_build_object('error', 'That time overlaps an existing booking. Please choose another time.');
  end if;

  insert into public.bookings (
    first_name, last_name, email, purpose, other_purpose, booking_date,
    start_time, end_time, payment_method, payment_proof_url, status
  ) values (
    trim(p_first_name), trim(p_last_name), lower(trim(p_email)), p_purpose,
    coalesce(p_other_purpose, ''), p_booking_date, p_start_time, p_end_time,
    p_payment_method, p_payment_proof_url, 'pending'
  ) returning id into new_id;

  return jsonb_build_object('id', new_id, 'status', 'pending');
end;
$$;

revoke all on function public.create_court_booking(text,text,text,text,text,date,time,time,text,text) from public;
grant execute on function public.create_court_booking(text,text,text,text,text,date,time,time,text,text) to anon, authenticated;

-- Payment screenshot storage bucket. Public bucket is simplest for this starter app,
-- but payment proof URLs should be private for a real deployment.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy "Visitors can upload payment proof"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'payment-proofs');

create policy "Payment proof images can be viewed"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'payment-proofs');

-- IMPORTANT PRODUCTION SECURITY:
-- This starter admin UI uses a client-side PIN only and is not secure for public production.
-- Before launch, configure Supabase Auth, admin-only RLS policies for status updates and
-- personal details, and private payment-proof storage with signed URLs.
