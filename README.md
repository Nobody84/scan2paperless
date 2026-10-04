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

## Docker

### Build image

```bash
docker build -t scan-to-paperless:local .
```

### Run only this app

```bash
docker compose -f docker-compose.app.yml up -d
```

App URL: `http://localhost:3001`

### Run app + Paperless-ngx + scanservjs

```bash
docker compose -f docker-compose.full.yml up -d
```

Service URLs:

- App: `http://localhost:3001`
- Paperless-ngx: `http://localhost:8000`
- scanservjs: `http://localhost:8083`

When the full stack is running, set these in the app Settings page:

- scanserv URL: `http://scanservjs:8080`
- Paperless URL: `http://paperless:8000`

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
