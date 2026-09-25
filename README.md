# MYOS

A private personal operating system for capturing and finding your knowledge, ideas, projects, decisions, and milestones.

## Local development

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Current build

The current version is an early UI prototype. Captures are held in memory and are not persisted after a page refresh. Supabase authentication, database storage, and AI are not connected yet.

Build the app with:

```bash
npm run build
```

## Deploy with Vercel

Import `https://github.com/MitraZen/myos` as a new Vercel project. Vercel should detect Next.js automatically. Keep the default settings:

- Framework preset: Next.js
- Build command: `npm run build`
- Output directory: automatic
- Production branch: `main`

No environment variables are required for this prototype. Do not add secrets to the repository.
