import {
	agents,
	agentVariants,
	agentVersions,
	batchCallJobs,
	batchCallRecipients,
	composioSessions,
	conversationMessages,
	conversations,
	kbDocuments,
	mcpConnections,
	phoneNumbers,
	procedures,
	telephonyConnections,
	tenantSettings,
	whatsappAccounts,
} from '@agent.io/domain/schemas'
import { defineSchema } from 'convex/server'

/**
 * Every table is tenant-scoped via the domain `tenantTable` helper
 * (ADR 0001): `tenant` holds the WorkOS org id and `by_tenant` is always the
 * first index. Indexes are declared HERE — the schema definition site —
 * where Convex derives its types from. No users/organizations/sessions
 * tables, deliberately.
 */
export default defineSchema({
	[agents.tableName]: agents.table
		.index('by_tenant', ['tenant'])
		.index('by_tenant_and_archived', ['tenant', 'archived']),
	[agentVariants.tableName]: agentVariants.table
		.index('by_tenant', ['tenant'])
		.index('by_agent', ['agentId'])
		.index('by_agent_and_isMain', ['agentId', 'isMain'])
		.index('by_agent_and_archived', ['agentId', 'archived'])
		.index('by_agent_and_allocationOrdinal', ['agentId', 'allocationOrdinal']),
	[agentVersions.tableName]: agentVersions.table
		.index('by_tenant', ['tenant'])
		.index('by_agent', ['agentId'])
		.index('by_variant', ['agentVariantId'])
		.index('by_variant_and_version', ['agentVariantId', 'version']),
	[procedures.tableName]: procedures.table
		.index('by_tenant', ['tenant'])
		.index('by_variant', ['agentVariantId'])
		.index('by_agentVariantId_and_status', ['agentVariantId', 'status']),
	[mcpConnections.tableName]: mcpConnections.table
		.index('by_tenant', ['tenant'])
		.index('by_tenant_and_kind', ['tenant', 'kind'])
		.index('by_tenant_and_status', ['tenant', 'status'])
		.index('by_tenant_and_kind_and_status', ['tenant', 'kind', 'status']),
	[kbDocuments.tableName]: kbDocuments.table
		.index('by_tenant', ['tenant'])
		.index('by_tenant_and_archived', ['tenant', 'archived']),
	[conversations.tableName]: conversations.table
		.index('by_tenant', ['tenant'])
		.index('by_tenant_and_conversationKey', ['tenant', 'conversationKey'])
		.index('by_agent', ['agentId'])
		.index('by_agentVariantId', ['agentVariantId'])
		.index('by_status', ['tenant', 'status'])
		.index('by_tenant_agent', ['tenant', 'agentId'])
		.index('by_tenant_channel', ['tenant', 'channel'])
		.index('by_tenant_direction', ['tenant', 'direction']),
	[conversationMessages.tableName]: conversationMessages.table
		.index('by_tenant', ['tenant'])
		.index('by_conversation', ['conversationId', 'sequence'])
		.index('by_conversation_and_messageKey', ['conversationId', 'messageKey'])
		.searchIndex('search_text', {
			searchField: 'text',
			filterFields: ['tenant', 'conversationId', 'agentId', 'role'],
		}),
	[telephonyConnections.tableName]: telephonyConnections.table
		.index('by_tenant', ['tenant'])
		.index('by_tenant_provider', ['tenant', 'provider'])
		.index('by_tenant_status', ['tenant', 'status'])
		.index('by_tenant_provider_status', ['tenant', 'provider', 'status'])
		.index('by_tenant_provider_account', [
			'tenant',
			'provider',
			'providerAccountId',
		]),
	[phoneNumbers.tableName]: phoneNumbers.table
		.index('by_tenant', ['tenant'])
		.index('by_tenant_status', ['tenant', 'status'])
		.index('by_tenant_agent', ['tenant', 'assignedAgentId'])
		.index('by_tenant_country', ['tenant', 'countryCode'])
		.index('by_tenant_region', ['tenant', 'regionCode'])
		.index('by_tenant_country_region', ['tenant', 'countryCode', 'regionCode'])
		.index('by_tenant_provider', ['tenant', 'provider'])
		.index('by_tenant_connection', ['tenant', 'telephonyConnectionId'])
		.index('by_connection_provider_number', [
			'telephonyConnectionId',
			'providerNumberId',
		])
		.index('by_connection_number', ['telephonyConnectionId', 'number']),
	[whatsappAccounts.tableName]: whatsappAccounts.table
		.index('by_tenant', ['tenant'])
		/** Webhook path: Meta phone_number_id → row → tenant (ADR 0001). */
		.index('by_meta_phone_number', ['metaPhoneNumberId']),
	[batchCallJobs.tableName]: batchCallJobs.table.index('by_tenant', ['tenant']),
	batchCallRecipients: batchCallRecipients.table
		.index('by_tenant', ['tenant'])
		.index('by_batch', ['batchId']),
	[tenantSettings.tableName]: tenantSettings.table.index('by_tenant', [
		'tenant',
	]),
	[composioSessions.tableName]: composioSessions.table
		.index('by_tenant', ['tenant'])
		.index('by_connection_hash', ['connectionId', 'configHash']),
})

/** Tenant-scoped table names (all of them — ADR 0001 default). */
export const TENANT_TABLES = [
	agents.tableName,
	agentVariants.tableName,
	agentVersions.tableName,
	procedures.tableName,
	mcpConnections.tableName,
	kbDocuments.tableName,
	conversations.tableName,
	conversationMessages.tableName,
	telephonyConnections.tableName,
	phoneNumbers.tableName,
	whatsappAccounts.tableName,
	batchCallJobs.tableName,
	batchCallRecipients.tableName,
	tenantSettings.tableName,
	composioSessions.tableName,
] as const

export type TenantTableName = (typeof TENANT_TABLES)[number]
