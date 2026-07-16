# Phone Number Inventory and Routing Reference

This document defines Agent.io's target storage and routing contract for voice
phone numbers. It is the platform model, not a transcription of a telephony
provider API.

## Ownership

Phone numbers are first-class tenant resources. Each imported or provisioned
number is one `phoneNumbers` row. Numbers never live in `tenantSettings`, an
Agent Draft, or an Agent Version.

The row's optional agent assignment is the default inbound destination. It does
not grant exclusive outbound ownership. Outbound workflows select an eligible
tenant number through caller-ID conditions and an explicit default fallback, as
defined by ADR 0003.

Provider accounts are normalized into `telephonyConnections`. Hundreds of
numbers may reference one connection without duplicating account identity or
credentials. Raw provider secrets never appear on `phoneNumbers` or in public
inventory responses.

## Target Schema

### `telephonyConnections`

Tenant-scoped provider-account identity and secret references.

| Field                  | Shape                                                             | Meaning                                               |
| ---------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| `_id`                  | Convex id                                                         | Stable connection identity                            |
| `tenant`               | WorkOS organization id                                            | Isolation boundary supplied by `tenantTable`          |
| `provider`             | `twilio \| sip_trunk`                                             | Telephony provider discriminator                      |
| `label`                | string                                                            | Tenant-facing account name                            |
| `providerAccountId`    | string                                                            | Twilio Account SID or equivalent provider identity    |
| `credentialSecretRef`  | string                                                            | Pointer to secret storage, never the credential value |
| `defaultRoutingRegion` | optional string                                                   | Provider routing-region default                       |
| `status`               | `pending_verification \| active \| disabled \| error \| archived` | Whether imports and calls may use the connection      |
| `lastSyncedAt`         | optional timestamp                                                | Last successful explicit provider refresh             |
| `lastError`            | optional string                                                   | Sanitized connection/import failure                   |

### `phoneNumbers`

Tenant-scoped inventory with one row per provider number.

| Field                   | Shape                                                           | Meaning                                                          |
| ----------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `_id`                   | Convex id                                                       | Stable platform number identity                                  |
| `tenant`                | WorkOS organization id                                          | Isolation boundary supplied by `tenantTable`                     |
| `telephonyConnectionId` | id of `telephonyConnections`                                    | Owning provider account                                          |
| `providerNumberId`      | string                                                          | Provider-side stable number identifier                           |
| `number`                | E.164 string                                                    | Canonical dialable number                                        |
| `label`                 | string                                                          | Tenant-facing inventory name                                     |
| `countryCode`           | ISO 3166-1 alpha-2 string                                       | Country filter and routing metadata                              |
| `regionCode`            | optional string                                                 | State, province, or provider region code                         |
| `locality`              | optional string                                                 | City or locality display metadata                                |
| `capabilities`          | object of booleans                                              | Inbound voice, outbound voice, inbound SMS, outbound SMS support |
| `assignedAgentId`       | optional id of `agents`                                         | Default inbound destination                                      |
| `routingRegion`         | optional string                                                 | Per-number override of the connection default                    |
| `inboundSmsEnabled`     | boolean                                                         | Tenant setting bounded by provider capability                    |
| `status`                | `pending \| active \| disabled \| provider_missing \| archived` | Inventory lifecycle; routing eligibility is derived              |
| `lastSyncedAt`          | optional timestamp                                              | Last successful provider metadata refresh                        |
| `lastError`             | optional string                                                 | Sanitized number-specific import/sync failure                    |
| `archivedAt`            | optional timestamp                                              | Tombstone timestamp                                              |

`createdAt` and `updatedAt` follow the standard `tenantTable` contract.

## Index Contract

The Convex schema must support bounded inventory pages and direct routing
lookups without collecting the tenant's complete number set:

- `by_tenant`
- `by_tenant_status`
- `by_tenant_agent`
- `by_tenant_country`
- `by_tenant_region`
- `by_tenant_country_region`
- `by_tenant_provider`
- `by_tenant_connection`
- `by_connection_provider_number`
- `by_connection_number`

Convex indexes are not uniqueness constraints. A transactional import/upsert
enforces one row per `(telephonyConnectionId, providerNumberId)` and rejects a
conflicting active E.164 identity inside the same provider connection, including
under concurrent imports. The same E.164 value in another tenant or provider
connection remains isolated by its verified connection identity.

`by_tenant_country_region` is the bounded path for combined geography pages;
`by_tenant_provider` supports provider inventory pages without collecting the
tenant's full number set. Exact filter shapes use native Convex pagination.
Other multi-filter combinations use a tenant-indexed `convex-helpers`
QueryStream that filters before pagination and is capped at 2,000 rows and 4 MB
per request. Its client uses the helper pagination hook and forwards
`endCursor`, `pageStatus`, and `splitCursor` so sparse result sets continue
without skipped matches.

Routing eligibility is derived rather than stored. A number is eligible only
when its own lifecycle and capabilities permit the requested channel and its
Telephony Connection is active. Inbound eligibility additionally requires an
assigned Agent with a callable published deployment.

## Routing Rules

### Inbound

1. Authenticate the provider request and resolve its `telephonyConnectionId`.
2. Resolve the active number by provider number id or canonical E.164 value.
3. Derive `tenant` from the number row; never accept tenant from webhook input.
4. Reject disabled, archived, inbound-ineligible, or unassigned numbers before
   creating a conversation.
5. Resolve the assigned Agent deployment, then apply Agent Variant allocation
   and the inbound workflow from ADR 0003.
6. Persist `phoneNumberId`, selected Agent Variant, and Agent Version on the
   conversation.

### Outbound

1. Start from the tenant and Agent deployment that owns the outbound call.
2. Evaluate caller-ID conditions against active, outbound-capable numbers with
   healthy provider connections.
3. Filter by country, region, provider, or explicit number conditions.
4. Use the configured default number when no condition matches; fail before
   dialing if the default is unavailable or ineligible.
5. Run selection for each concrete call, then persist the selected
   `phoneNumberId` and selection reason on the conversation or recipient attempt
   so later inventory changes do not rewrite historical attribution.

The conversational model never receives provider credentials and cannot invent
or select arbitrary caller IDs. Number selection is backend business logic. The
exact Agent Variant allocation and machine Conversation API are defined in
[Agent Deployment and Routing](./agent-deployment-routing.md).

## Lifecycle

Import is idempotent by provider identity. An explicit refresh updates mutable
provider metadata and capabilities without changing the platform `_id`. Numbers
missing from a successful provider refresh become `provider_missing` and
ineligible; they are never hard-deleted automatically. Archiving removes a
number from inbound and outbound eligibility but preserves historical
conversation references. Reassignment affects future inbound calls only; an
active conversation keeps its resolved number, Agent Variant, and Agent Version.

Assignment, disable, routing configuration, and archive operations require the
tenant administrator permission. Read-only inventory access follows the ordinary
tenant membership and role policy. Provider purchase, import/refresh
orchestration, port, and release run in the back-office server; Convex only
stores normalized snapshots through trusted internal mutations. Secret
references are provisioned through a trusted administrative path;
secret-management UI is outside this contract.
