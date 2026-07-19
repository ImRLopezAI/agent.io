import type { AgentVariantDraftConfig } from '@agent.io/domain/schemas'

import { resolveTenantId } from '../../utils'

type TenantIdContext = Parameters<typeof resolveTenantId>[0]

export const validateAgentAttachments = async (
	ctx: TenantIdContext,
	attachments: Pick<AgentVariantDraftConfig, 'knowledgeBase' | 'mcp'>,
) => {
	for (const attachment of attachments.knowledgeBase ?? []) {
		await resolveTenantId(
			ctx,
			'kbDocuments',
			attachment.documentId,
			'knowledge base document',
		)
	}
	for (const scope of attachments.mcp ?? []) {
		await resolveTenantId(
			ctx,
			'mcpConnections',
			scope.connectionId,
			'MCP connection',
		)
	}
}
