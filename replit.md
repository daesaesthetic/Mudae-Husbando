# Mudae Husbando V2

An actual Discord character-collection game with a verified-only catalog and persistent player collections.

## Run & Operate

- `PORT=8080 pnpm --filter @workspace/api-server run dev` — run the API server
- Replit workflow: `Discord Game API` runs `PORT=8080 pnpm --filter @workspace/api-server run dev`
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secret: `DISCORD_TOKEN` — Discord bot token
- Required secret: `DEVELOPER_USER_IDS` — comma-separated Discord IDs authorized to use `/developer`
- `DATABASE_URL` is provided by the Replit database
- Optional env: `DISCORD_CLIENT_ID` — application ID; if omitted, the bot resolves it from Discord
- Optional env: `ROLL_POOL_SIZE` — normal user roll pool size; defaults to 10
- Optional env: `ROLL_REPLENISHMENT_MS` — replenishment delay after the pool reaches zero; defaults to 1 hour
- Optional env: `CLAIM_POOL_SIZE` — normal user claim pool size; defaults to 1
- Optional env: `CLAIM_REPLENISHMENT_MS` — claim replenishment delay after a successful claim; defaults to 1 hour
- Optional env: `BOT_PREFIX` — message-command prefix; defaults to `$`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/client.ts` — Discord slash and prefix command routing
- `artifacts/api-server/src/bot/presentation.ts` — reusable Discord character cards and game embeds
- `artifacts/api-server/src/bot/prefix.ts` — configurable message-prefix parser
- `artifacts/api-server/src/bot/database.ts` — persistent Postgres game storage and verified-only queries
- `artifacts/api-server/src/bot/catalog.ts` — manually curated verified seed catalog and artwork references
- `artifacts/api-server/src/bot/migrations.ts` — ordered, recorded, non-destructive database migrations
- `artifacts/api-server/src/bot/economy.ts` — transactional currency and ledger service
- `artifacts/api-server/src/bot/cooldown.ts` — persistent, concurrency-aware cooldown service
- `artifacts/api-server/src/bot/rng.ts` — reusable random integer and weighted-outcome helpers

## Architecture decisions

- The Discord client and health API share the existing API Server workflow so the bot runs as a normal Replit service.
- Postgres stores all important game state; startup creates additive tables and seeds only verified records.
- The bot never asks AI or user input to establish character identity; rolls and search query `status = 'verified'`.
- New economy, cooldown, and reward behavior must use the shared services rather than adding raw SQL to commands.
- Schema changes are applied through `mudae_schema_migrations`; existing tables and rows are preserved.
- Character `value` is the displayed kakera-like value; popularity rank and roll weight are curated Mudae-inspired approximations, persisted additively, and must not be presented as live Mudae data.
- `/roll`, `/ha`, and `/wa` select eligible unclaimed characters using their positive roll weights; lower weights make high-value characters rarer while preserving the existing roll pool and claim transaction rules.
- Discord tokens are read only from Replit Secrets.
- Developer Mode is process-local and resets to OFF when the bot restarts. Authorized developers can toggle it with `/developer`; while ON, normal roll cooldown restrictions are bypassed without changing claim or ownership rules.

## Product

The first playable slice includes verified character rolls, persistent expiring roll records, a Discord claim button, transactional claiming, collections, profiles, catalog search, wishlists, and favorites.

## User preferences

- Keep the existing file locations; do not move files unless the bot runtime requires it.

## Gotchas

- The API workflow runs both the health endpoint and Discord bot.
- Discord slash commands are registered globally during startup and may take a short time to appear.
- `ROLL_EXPIRATION_MS` optionally controls claim duration; it defaults to 3 minutes to match the short Mudae-style claim window.
- Phase 1 adds the `mudae_currency_transactions` and `mudae_cooldowns` persistence tables without adding economy commands.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
