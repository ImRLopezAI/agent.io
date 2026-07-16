import { z } from 'zod'

import { tenantTable } from './helper.ts'

/**
 * WhatsApp accounts (ERD §0 WHATSAPP_ACCOUNT, §3).
 *
 * Multiple numbers per tenant — **not** process env and **not** a field on
 * `tenantSettings` (that table is product defaults: recording, retention,
 * caps). Each row is a machine-path tenant-resolution anchor for the
 * messages worker: webhook → `metaPhoneNumberId` → this row → `tenant`
 * (ADR 0001). Secrets are pointers only (`accessTokenSecretRef`); raw tokens
 * wait on the deferred `tenantSecrets` store (same pattern as BYO MCP).
 */

export const WHATSAPP_ACCOUNT_STATUSES = [
	'active',
	'disabled',
	'token_expired',
] as const
export type WhatsappAccountStatus = (typeof WHATSAPP_ACCOUNT_STATUSES)[number]

export const whatsappAccounts = tenantTable('whatsappAccounts', (id) => ({
	/**
	 * Meta Cloud API `phone_number_id` — the stable webhook lookup key.
	 * Unique per connected number; the messages worker resolves tenant from it.
	 */
	metaPhoneNumberId: z.string().min(1),
	/** Meta WhatsApp Business Account id (WABA). */
	businessAccountId: z.string().min(1),
	businessAccountName: z.string().max(200).optional(),
	/** E.164 when known (display + outbound routing). */
	phoneNumber: z
		.string()
		.regex(/^\+[1-9]\d{6,14}$/)
		.optional(),
	/** Meta-verified display name for the number. */
	phoneNumberName: z.string().max(120).default(''),
	/** Dashboard label. */
	label: z.string().max(120).default(''),
	assignedAgentId: id('agents').optional(),
	enableMessaging: z.boolean().default(true),
	enableAudioMessageResponse: z.boolean().default(true),
	/**
	 * Pointer into the (future) tenant secret store — never the raw
	 * long-lived access token.
	 */
	accessTokenSecretRef: z.string().min(1),
	status: z.enum(WHATSAPP_ACCOUNT_STATUSES).default('active'),
}))
