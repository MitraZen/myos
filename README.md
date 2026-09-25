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

The current version supports captures, a personal timeline, project and knowledge links, and image/audio attachments. Capture metadata is stored in `localStorage`; attachment files are stored separately in IndexedDB. Data stays in this browser and is not synced or backed up, so clearing this site's browser data removes it. Supabase authentication, cloud storage, and AI are not connected yet.

Images are resized to a maximum dimension of 1920 px and recompressed to WebP or JPEG, with a 2 MB limit per image. Uncompressed WAV audio is converted to mono Opus at approximately 64 kbps when the browser supports it; already-compressed audio is retained as provided. A capture can have up to five attachments and 24 MB total.

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
