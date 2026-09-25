# Supabase foundation

This directory contains the first cloud-schema migration. The app continues using localStorage and IndexedDB until authentication and a user-confirmed local-data import are implemented.

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

## Important

Do not put a Supabase service-role key in the browser, `.env.local`, or Vercel's `NEXT_PUBLIC_*` variables. The app will use the publishable key with authenticated sessions and RLS. A later integration step will add the client, sign-in, and an explicit migration flow for local captures and IndexedDB attachments.
