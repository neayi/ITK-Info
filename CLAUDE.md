# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ITK-Info (package name `culture-date-api`) is a tiny Express backend that feeds the TIKA editor with agricultural data it doesn't otherwise have. It has no database and no business logic of its own — it's a thin proxy that shapes prompts, calls OpenAI (and one French government API), and normalizes the JSON that comes back. The entire server lives in one file, `app.mjs`.

## Commands

```bash
npm install         # install dependencies
npm start           # node app.mjs — runs the server directly (no build step, plain ESM)

docker-compose up --build   # build and run in Docker
docker-compose up -d        # detached
docker-compose logs -f
docker-compose down
```

There is no lint script, no test suite, and no build/transpile step — `app.mjs` runs as-is under Node >=18. When changing behavior, verify manually with curl against the running server (examples for both endpoints are in README.md).

Required environment variable: `OPENAI_API_KEY` (server exits at startup if missing — see `app.mjs:15-18`). `PORT` defaults to 80. Copy `.env.example` to `.env` to configure locally.

## Architecture

Two POST routes in `app.mjs`, each following the same pattern:

1. **`POST /api/culture`** — takes `{ culture, region? }`, sends a strict system prompt to OpenAI (`gpt-4o-mini`, temperature 0) demanding JSON-only output, then parses/normalizes the model's response into a fixed schema (sowing date, harvest date, color hex, confidence, explanation).
2. **`POST /api/location`** — takes `{ address }`, first geocodes via `api-adresse.data.gouv.fr` (French government address API) to get lat/lon/postal code, then asks OpenAI for monthly temperature/rainfall climate data seeded with those coordinates. Real geocoded coordinates always override whatever the model returns.

Shared conventions across both routes (keep new endpoints consistent with these):
- Request bodies are validated minimally (required string field present and non-empty) before any external call.
- The system prompt embeds the exact JSON schema and repeats "RETURN ONLY JSON, no markdown, no backticks" — the model is not using function calling / structured outputs, so the code must defensively parse.
- Model responses are parsed with `JSON.parse` first, falling back to a regex extraction of the first `{...}` block if the model wrapped the JSON in prose (see the repeated `jsonMatch` pattern). If parsing still fails, the route returns 200 with a `warning` and the raw text rather than failing — this is intentional so the caller can see what the model actually said.
- Parsed output is always re-normalized into an explicit field list before responding (never pass the parsed object straight through) so the response shape is guaranteed even if the model omits fields.
- Error status convention: `400` for bad input, `502` for upstream API failures (OpenAI or geocoding), `500` for anything else unexpected.

CORS is wide open (`app.use(cors())` with no options) and there's no auth on either route — this is designed to sit behind another trusted service (TIKA editor), not to be exposed as a public API as-is.

CI (`.github/workflows/docker-image.yml`) builds and pushes the Docker image to `ghcr.io/<owner>/itk-info:latest` on every push to `main`. There's no test/lint gate in CI.
