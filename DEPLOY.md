# Deployment Guide

Full env matrix: `docs/reference/environment.md`. Machine API contract:
`docs/reference/agent-deployment-routing.md`.

## Surfaces

| Surface                            | Runtime              | Deploy mechanism                                                             |
| ---------------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| Convex backend (`packages/convex`) | Convex cloud         | `bunx convex deploy` (prod) / `bunx convex dev` (dev)                        |
| back-office                        | Bun (TanStack Start) | host of choice; server env from `docs/reference/environment.md`              |
| v-inbound / v-outbound / messages  | Bun/Hono workers     | host of choice; still skeletons — deploy gates apply once they carry traffic |

## Pre-deploy gates (every deploy)

Run from the repo root; all must pass:

```bash
vp install
vp run @agent.io/convex#codegen
vp test run packages/domain/src packages/convex/src packages/agent/src
vp run typecheck --filter @agent.io/domain --filter @agent.io/convex --filter @agent.io/agent
vp check packages/domain/src packages/convex/src packages/agent/src
```

## Convex deployment

1. **Set env first** — the typed env in `convex.config.ts` fails the deploy if
   any variable is missing. Minimum new-environment setup:

   ```bash
   cd packages/convex
   bunx convex env set CONVEX_SERVICE_TOKENS \
     "v-inbound:$(openssl rand -hex 32),v-outbound:$(openssl rand -hex 32),back-office:$(openssl rand -hex 32),runtime:$(openssl rand -hex 32)"
   # plus AI_GATEWAY_API_KEY, EMAIL_FROM, RESEND_API_KEY,
   # RESEND_WEBHOOK_SECRET, WORKOS_API_KEY, WORKOS_CLIENT_ID,
   # WORKOS_WEBHOOK_SECRET — see docs/reference/environment.md
   ```

2. Distribute each service's own token to that service as its singular
   `CONVEX_SERVICE_TOKEN`. No service ever holds the full roster.

3. Deploy: `bunx convex deploy` (prod) — codegen already validated the schema
   and bindings in the gates.

4. The retention cron (`packages/convex/src/crons.ts`) registers automatically
   on deploy; no manual scheduling.

## Service-token rotation (zero downtime)

1. Add a **second** entry for the service being rotated to
   `CONVEX_SERVICE_TOKENS` (both old and new values listed).
2. Validate the variable's shape before applying: comma-separated
   `service:token`, no token value under two different service names — a
   duplicated value rejects only requests presenting it, but fix it anyway.
3. Roll the service with its new `CONVEX_SERVICE_TOKEN`.
4. Remove the old entry from `CONVEX_SERVICE_TOKENS`.

Revocation = remove that service's entries; other services are unaffected.

## Post-deploy verification

- `curl -s -o /dev/null -w "%{http_code}" -X POST "$CONVEX_SITE_URL/api/machine/conversations/direct"`
  with no auth → expect `401`.
- Repeat with a valid service bearer and an empty body → expect
  `400 {"error":"invalid_request"}` (auth passed, validation rejected).
- Check the Convex dashboard logs for the daily `conversation retention purge`
  cron after its first 04:00 UTC run.

## Deploy-order rules

- **Convex first, workers second** when a change touches the machine API
  contract — workers consume generated types and the HTTP envelope.
- Machine-API contract changes (new required body fields, error codes) are
  breaking for workers: deploy behind worker rollouts only when the change is
  additive; otherwise coordinate a paired rollout.
- Never deploy with red gates; never hand-edit `_generated/`.

## Known operational notes

- `conversationKey` is secret material — ensure worker logging never prints
  machine request bodies.
- PII retention window is currently a literal (90 days) in
  `packages/convex/src/crons.ts`; changing it is a code deploy until it moves to
  config.
- Per-tenant Twilio/WhatsApp credentials are data (tenant tables), not env —
  onboarding a tenant never requires a deploy.
