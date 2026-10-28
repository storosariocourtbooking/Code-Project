# Barangay Court Booking System

A mobile-friendly court reservation web app built with React + Vite. Includes a booking calendar, hourly/custom-duration bookings, overlap checks, GCash/MariBank QR display, payment screenshot upload, availability view, and an admin dashboard.

## Quick start

1. Install Node.js (LTS) from https://nodejs.org/
2. Extract this ZIP and open the folder in a terminal.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open the local URL shown in the terminal.

Without Supabase settings, the app runs in **preview mode**. It stores sample bookings only in the current browser, so it is not a shared live booking system.

## Connect a shared database with Supabase

1. Create a project at https://supabase.com/
2. Open **SQL Editor** in the Supabase dashboard.
3. Run the contents of `supabase/schema.sql`.
4. Copy `.env.example` to a new file named `.env`.
5. Replace `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the values from **Project Settings → API**.
6. Add your official payment QR images:
   - `public/payment/gcash-qr.png`
   - `public/payment/maribank-qr.png`
7. Update `.env` with the court name and operating hours if needed.
8. Restart `npm run dev`.

The included SQL uses 6:00 AM–10:00 PM as the default schedule. If you change operating hours, also update the validation in `supabase/schema.sql`.

## Upload to GitHub

1. Create a new repository on GitHub.
2. Extract the ZIP.
3. Upload the project files/folders to the repository (do not upload `node_modules` or `.env`).
4. Commit and push.
5. For a live website, use Vercel or Netlify and set the same `VITE_...` environment variables in the hosting dashboard.

### Deploy to Vercel
- Import the GitHub repository in Vercel.
- Framework preset: Vite.
- Build command: `npm run build`.
- Output directory: `dist`.
- Add environment variables from `.env.example`.
- Deploy.

## Change the court name, hours, QR images, and admin PIN

Edit `.env` (or set environment variables in your hosting platform):
- `VITE_COURT_NAME=Barangay Covered Court`
- `VITE_BOOKING_START=06:00`
- `VITE_BOOKING_END=22:00`
- `VITE_ADMIN_PIN=1234`
- `VITE_GCASH_QR=/payment/gcash-qr.png`
- `VITE_MARIBANK_QR=/payment/maribank-qr.png`

The default demo PIN is `1234`. This is only a prototype gate and must **not** be used as real security for a public site.

## Important before real public launch

This is a starter project, not a fully security-hardened production system. Before collecting real resident data or payment receipts:
- Replace the demo admin PIN with Supabase Auth and server-enforced admin permissions.
- Restrict booking personal data to authenticated administrators. Public users should access only availability data, not names/emails/payment proof links.
- Make payment screenshots private in Supabase Storage and show them to authorized staff using signed URLs.
- Add a verified admin-only status update function/policy.
- Decide whether pending bookings temporarily block a slot and how long a payment hold lasts.
- Test booking conflicts, daylight/time-zone behavior, and all form validations.
- Publish a privacy notice and retention policy for names, email addresses, and payment proof.

## Features
- Calendar month navigation and disabled past/fully booked dates.
- Hourly slots and custom duration by selecting start/end times.
- Overlap prevention in UI and a database RPC that serializes booking checks per date.
- Payment method selector and receipt image upload.
- Availability page showing each hour as available or booked.
- Admin request list with approve/reject/cancel actions.
- Responsive layout for phones and desktop.
