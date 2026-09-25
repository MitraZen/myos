# Supabase foundation

This directory contains the cloud schema and setup instructions. The app keeps a local browser copy and uses Supabase Auth, Postgres, and private Storage for signed-in cloud data.

## Apply the initial schema

1. Create a new Supabase project for MYOS.
2. Open **SQL Editor** in the Supabase dashboard.
3. Paste and run `migrations/20260925000100_myos_core.sql`.
4. Confirm the migration created the tables and the private `myos-private` Storage bucket.

Run this on a clean MYOS project. The migration creates owner-only RLS policies and should be reviewed before applying to a project that already contains application tables or Storage policies.

## Data model

- `captures` stores original user-authored content and common metadata.
- `capture_relations` stores many-to-many links, including capture-to-project membership and related knowledge.
- `labels` and `capture_labels` store user-owned topics and tags without folders.
- `capture_attachments` stores file metadata; binary files live in the private Storage bucket.
- `capture_ai_metadata` separates future AI-generated summaries, topics, entities, and suggestions from original content.

Every application table has RLS enabled and owner-scoped policies. Storage object paths are scoped to the authenticated user's ID.

## Connect the app

1. Copy `.env.example` to `.env.local` and fill in the project's **Project URL** and **publishable key** from Supabase project settings.
2. In Supabase **Authentication → Users**, add your MYOS user with your email and a strong password. Confirm the email in the dashboard if prompted. Keep public sign-ups disabled for this private archive.
3. In Supabase **Authentication → Sign In / Providers**, make sure Email/password sign-in is enabled.
4. Run `npm run dev` and sign in with the email and password you set for the Supabase user.
5. On first sign-in, MYOS shows any captures already saved in that browser. Choose **Add to my account** to add missing records and their locally available attachments. Import is additive: existing cloud rows remain unchanged, and this browser's local data is retained.
6. Add the two environment variables to Vercel for Production, Preview, and Development as needed, then redeploy.

The app uses Supabase email/password authentication and only the publishable key in the browser. Never put a Supabase service-role or secret key in `.env.local`, client code, or any `NEXT_PUBLIC_*` variable. Authenticated requests are restricted by the owner-only RLS policies in the migration. Attachment objects remain in the private `myos-private` bucket and are displayed with short-lived signed URLs.

Without these environment variables the app continues in local-only mode. Cloud sync requires the local attachment blob to be present on the device that uploads it; if an attachment is missing locally, MYOS stops that item's cloud save and reports the problem rather than silently dropping the file.
