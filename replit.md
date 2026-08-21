# Mudae Husbando V2

An actual Discord character-collection game with a verified-only catalog and persistent player collections.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secret: `DISCORD_TOKEN` — Discord bot token
- `DATABASE_URL` is provided by the Replit database
- Optional env: `DISCORD_CLIENT_ID` — application ID; if omitted, the bot resolves it from Discord

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/client.ts` — Discord slash commands and embeds
- `artifacts/api-server/src/bot/database.ts` — persistent Postgres game storage and verified-only queries
- `artifacts/api-server/src/bot/catalog.ts` — manually curated verified seed catalog

## Architecture decisions

- The Discord client and health API share the existing API Server workflow so the bot runs as a normal Replit service.
- Postgres stores all important game state; startup creates additive tables and seeds only verified records.
- The bot never asks AI or user input to establish character identity; rolls and search query `status = 'verified'`.
- Discord tokens are read only from Replit Secrets.

## Product

The first playable slice includes verified character rolls, claiming, collections, profiles, catalog search, wishlists, and favorites.

## User preferences

- Keep the existing file locations; do not move files unless the bot runtime requires it.

## Gotchas

- The API workflow runs both the health endpoint and Discord bot.
- Discord slash commands are registered globally during startup and may take a short time to appear.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
