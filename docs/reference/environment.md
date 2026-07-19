# Environment Configuration Reference

Two env surfaces exist and are deliberately separate:

1. **Convex deployment env** — declared in
   `packages/convex/src/convex.config.ts` (typed, validated at deploy), consumed
   via the generated `env` export. Set with `bunx convex env set` (dev) or the
   Convex dashboard (prod).
2. **App process env** — validated at boot by the zod schemas in
   `packages/domain/src/config/` (discriminated union on `APP`; each Bun/Hono
   app calls `loadEnv('<app>')`). Set via `.env.local` (dev, gitignored) or the
   host's secret manager (prod).

Keep the two in sync when adding platform keys — the shared fragments in
`packages/domain/src/config/shared.ts` are the single checklist.

## 1. Convex deployment env

| Variable                | Dev      | Prod     | Purpose                                                                                                                                                      |
| ----------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AI_GATEWAY_API_KEY`    | required | required | Vercel AI Gateway (embeddings, chat)                                                                                                                         |
| `CONVEX_SERVICE_TOKENS` | required | required | Machine-API auth roster: comma-separated `<service>:<token>` for `v-inbound`, `v-outbound`, `back-office`, `runtime`. See rotation procedure in `DEPLOY.md`. |
| `EMAIL_FROM`            | required | required | Resend sender address                                                                                                                                        |
| `RESEND_API_KEY`        | required | required | Resend transactional email                                                                                                                                   |
| `RESEND_WEBHOOK_SECRET` | required | required | Resend webhook signature                                                                                                                                     |
| `WORKOS_API_KEY`        | required | required | WorkOS server SDK                                                                                                                                            |
| `WORKOS_CLIENT_ID`      | required | required | WorkOS client id                                                                                                                                             |
| `WORKOS_WEBHOOK_SECRET` | required | required | WorkOS webhook signature                                                                                                                                     |

Dev values may be test-mode keys, but every variable must be present —
`convex.config.ts` env is typed and a deploy without one fails.

Generate service tokens with a CSPRNG, e.g. `openssl rand -hex 32`. Never reuse
a token value across two service names — the middleware rejects requests
presenting a duplicated value.

## 2. App process env (Bun/Hono apps)

Shared fragment vocabulary (see `packages/domain/src/config/shared.ts`):
`processEnv` (`NODE_ENV`), `aiGatewayEnv`, `workOsEnv` (+ cookie password and
redirect URI — back-office only, it hosts the AuthKit callback), `redisEnv`
(Upstash REST), `resendEnv`, `convexUrlEnv` (user-facing Convex client),
`convexMachineEnv` (machine workers), `voiceRuntimeEnv`, `voiceWebhookEnv`,
`twilioEnv`, `metaAppEnv`.

**`CONVEX_SERVICE_TOKEN` (singular, per worker)** is that service's own entry
from the deployment's `CONVEX_SERVICE_TOKENS` roster. Each worker holds only its
own token; only Convex holds the full roster.

### back-office

| Variable                              | Dev                               | Prod         | Notes                                             |
| ------------------------------------- | --------------------------------- | ------------ | ------------------------------------------------- |
| `NODE_ENV`                            | `development` (default)           | `production` |                                                   |
| `BASE_URL`                            | `http://localhost:3000` (default) | required     | Public origin for WorkOS redirects                |
| `WORKOS_CLIENT_ID` / `WORKOS_API_KEY` | required                          | required     |                                                   |
| `WORKOS_COOKIE_PASSWORD`              | required                          | required     | ≥32 chars                                         |
| `WORKOS_REDIRECT_URI`                 | required                          | required     | Must match WorkOS dashboard                       |
| `REDIS_REST_URL` / `REDIS_REST_TOKEN` | required                          | required     | Upstash REST                                      |
| `RESEND_API_KEY` / `EMAIL_FROM`       | required                          | required     |                                                   |
| `AI_GATEWAY_API_KEY`                  | required                          | required     |                                                   |
| `CONVEX_URL`                          | required (dev deployment URL)     | required     | User-facing Convex client                         |
| `GOOGLE_FONTS_API_KEY`                | optional                          | optional     | Theme tooling                                     |
| `VITE_CONVEX_URL`                     | required                          | required     | Client bundle (Vite layer, not the server schema) |

### v-inbound

| Variable                                              | Dev      | Prod                                  | Notes                            |
| ----------------------------------------------------- | -------- | ------------------------------------- | -------------------------------- |
| `NODE_ENV`                                            | default  | `production`                          |                                  |
| `OPENAI_API_KEY` / `XAI_API_KEY` / `COMPOSIO_API_KEY` | required | required                              | Platform realtime + tools keys   |
| `CONVEX_URL`                                          | required | required                              | Machine HTTP base                |
| `CONVEX_SERVICE_TOKEN`                                | required | required                              | The `v-inbound:` entry's token   |
| `OPENAI_WEBHOOK_SECRET` / `XAI_WEBHOOK_SECRET`        | optional | required once webhook routes are live | Provider call-incoming signature |

Twilio webhook validation uses **per-tenant connection credentials** from the
`telephonyConnections` table (secret refs), not env — see
`packages/agent/src/telephony/`.

### v-outbound

Everything in v-inbound, plus:

| Variable                                   | Dev      | Prod                  | Notes                                                            |
| ------------------------------------------ | -------- | --------------------- | ---------------------------------------------------------------- |
| `CONVEX_SERVICE_TOKEN`                     | required | required              | The `v-outbound:` entry's token                                  |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | optional | required at dialer GA | Platform trunk credentials; optional until the dialer plan lands |

### messages

| Variable                                        | Dev                         | Prod         | Notes                                                                                                              |
| ----------------------------------------------- | --------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                                      | default                     | `production` |                                                                                                                    |
| `CONVEX_URL` / `CONVEX_SERVICE_TOKEN`           | required                    | required     | Machine HTTP; its own token entry                                                                                  |
| `META_APP_SECRET` / `META_WEBHOOK_VERIFY_TOKEN` | optional until webhook live | required     | Shared WhatsApp webhook (signature verify + hub challenge); per-tenant numbers live in `whatsappAccounts`, not env |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`      | optional                    | as needed    | SMS leg                                                                                                            |

## Rules

- `.env.local` files are gitignored — never commit values or paste them into
  docs, commits, or issues.
- Per-tenant credentials (Twilio subaccounts, WhatsApp tokens, MCP headers) are
  **not** env — they live in tenant tables behind secret refs.
- Adding a variable: add the zod fragment in `packages/domain/src/config/`,
  extend the app schema, mirror into `convex.config.ts` only if Convex functions
  consume it, and update this file and `DEPLOY.md`.
