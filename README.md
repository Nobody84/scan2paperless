# Scan to Paperless

Small self-hosted app to scan via scanservjs and upload to Paperless-ngx.

## Stack

- TypeScript
- React + Vite
- Node.js + Express

## Features

- Server-side configuration for scanservjs and Paperless
- Scan options loaded dynamically from scanservjs
- Mobile-first scan view with per-setting tap dialogs, prominent scan action, and toast/error dialogs
- Compact metadata editor with tag picker dialog and in-session last-used tag memory
- Scan execution through scanservjs API
- Preview and metadata editing (title/date/tags)
- Tag retrieval and creation through Paperless API
- Upload to Paperless with metadata
- Temporary scan-file lifecycle cleanup

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start development:

```bash
npm run dev
```

3. Build:

```bash
npm run build
```

4. Run tests:

```bash
npm test
```

## Configuration

Configuration is stored server-side in `data/config.json`.

Set these in the Settings page:

- scanserv URL, username, password
- Paperless URL, token or username/password
- predefined tags

## API assumptions

- scanservjs API served under `/api/v1`
- scanservjs OpenAPI available at `/api-docs`
- Paperless API schema available at `/api/schema/`
- Paperless upload endpoint: `/api/documents/post_document/`
