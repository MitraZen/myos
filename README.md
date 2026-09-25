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

The current version is a static UI prototype. Captures are held in memory and are not persisted after a page refresh. Supabase authentication, database storage, and AI are not connected yet.

Create a production static export with:

```bash
npm run build
```

The deployable site is generated in `out/`.

## Cloudflare Pages

Connect the GitHub repository to Cloudflare Pages and use:

- Build command: `npm run build`
- Build output directory: `out`
- Production branch: `main`

No environment variables are required for this prototype. Do not add secrets to the repository.
