import {
	agents,
	agentVersions,
	batchCallJobs,
	batchCallRecipients,
	composioSessions,
	conversationMessages,
	conversations,
	EMBEDDING,
	kbChunks,
	kbDocuments,
	kbEmbeddings,
	mcpConnections,
	phoneNumbers,
	procedures,
	tenantSettings,
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
	[agents.tableName]: agents.table.index('by_tenant', ['tenant']),
	[agentVersions.tableName]: agentVersions.table
		.index('by_tenant', ['tenant'])
		.index('by_agent', ['agentId']),
	[procedures.tableName]: procedures.table
		.index('by_tenant', ['tenant'])
		.index('by_agent', ['agentId']),
	[mcpConnections.tableName]: mcpConnections.table.index('by_tenant', [
		'tenant',
	]),
	[kbDocuments.tableName]: kbDocuments.table
		.index('by_tenant', ['tenant'])
		.searchIndex('search_name', {
			searchField: 'name',
			filterFields: ['tenant'],
		}),
	[kbChunks.tableName]: kbChunks.table
		.index('by_tenant', ['tenant'])
		.index('by_document', ['documentId', 'order'])
		.index('by_embedding', ['embeddingId'])
		.searchIndex('search_text', {
			searchField: 'text',
			filterFields: ['tenant', 'documentId'],
		}),
	[kbEmbeddings.tableName]: kbEmbeddings.table
		.index('by_tenant', ['tenant'])
		.vectorIndex('by_embedding', {
			vectorField: 'embedding',
			dimensions: EMBEDDING.dimensions,
			filterFields: ['tenant', 'documentId'],
		}),
	[conversations.tableName]: conversations.table
		.index('by_tenant', ['tenant'])
		.index('by_agent', ['agentId'])
		.index('by_status', ['tenant', 'status']),
	[conversationMessages.tableName]: conversationMessages.table
		.index('by_tenant', ['tenant'])
		.index('by_conversation', ['conversationId', 'sequence'])
		.searchIndex('search_text', {
			searchField: 'text',
			filterFields: ['tenant', 'conversationId', 'agentId', 'role'],
		}),
	[phoneNumbers.tableName]: phoneNumbers.table.index('by_tenant', ['tenant']),
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
	agentVersions.tableName,
	procedures.tableName,
	mcpConnections.tableName,
	kbDocuments.tableName,
	kbChunks.tableName,
	kbEmbeddings.tableName,
	conversations.tableName,
	conversationMessages.tableName,
	phoneNumbers.tableName,
	batchCallJobs.tableName,
	batchCallRecipients.tableName,
	tenantSettings.tableName,
	composioSessions.tableName,
] as const

export type TenantTableName = (typeof TENANT_TABLES)[number]
