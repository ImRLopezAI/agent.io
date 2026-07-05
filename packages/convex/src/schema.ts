import {
	Agents,
	AgentVersions,
	BatchCallJobs,
	BatchCallRecipients,
	ComposioSessions,
	ConversationMessages,
	Conversations,
	KbChunks,
	KbDocuments,
	KbEmbeddings,
	McpConnections,
	PhoneNumbers,
	Procedures,
	TenantSettings,
} from '@agent.io/domain/schemas'
import { defineSchema } from 'convex/server'

/**
 * Every table below is tenant-scoped via the domain `tenantTable` helper
 * (ADR 0001): `tenant` holds the WorkOS org id and `by_tenant` is always
 * indexed. There are deliberately NO users/organizations/sessions tables.
 */
export default defineSchema({
	agents: Agents.table(),
	agentVersions: AgentVersions.table(),
	procedures: Procedures.table(),
	mcpConnections: McpConnections.table(),
	kbDocuments: KbDocuments.table(),
	kbChunks: KbChunks.table(),
	kbEmbeddings: KbEmbeddings.table(),
	conversations: Conversations.table(),
	conversationMessages: ConversationMessages.table(),
	phoneNumbers: PhoneNumbers.table(),
	batchCallJobs: BatchCallJobs.table(),
	batchCallRecipients: BatchCallRecipients.table(),
	tenantSettings: TenantSettings.table(),
	composioSessions: ComposioSessions.table(),
})

/** Tenant-scoped table names (all of them — ADR 0001 default). */
export const TENANT_TABLES = [
	'agents',
	'agentVersions',
	'procedures',
	'mcpConnections',
	'kbDocuments',
	'kbChunks',
	'kbEmbeddings',
	'conversations',
	'conversationMessages',
	'phoneNumbers',
	'batchCallJobs',
	'batchCallRecipients',
	'tenantSettings',
	'composioSessions',
] as const

export type TenantTableName = (typeof TENANT_TABLES)[number]
