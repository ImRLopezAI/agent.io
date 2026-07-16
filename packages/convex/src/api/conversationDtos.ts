import type { Doc } from '../_generated/dataModel'

export const maskExternalNumber = (number?: string) => {
	if (!number) return undefined
	const visible = number.slice(-4)
	return `${'*'.repeat(Math.max(0, number.length - visible.length))}${visible}`
}

export const toConversationSummaryDto = (row: Doc<'conversations'>) => ({
	id: row._id,
	agentId: row.agentId,
	agentVariantId: row.agentVariantId,
	agentVersionId: row.agentVersionId,
	allocationMode: row.allocationMode,
	allocationBucket: row.allocationBucket,
	allocationRevision: row.allocationRevision,
	workflow: row.workflow,
	phoneNumberId: row.phoneNumberId,
	phoneNumber: row.phoneNumberSnapshot
		? {
				number: row.phoneNumberSnapshot.number,
				provider: row.phoneNumberSnapshot.provider,
			}
		: undefined,
	callerIdSelectionReason: row.callerIdSelectionReason,
	whatsappAccountId: row.whatsappAccountId,
	batchCallRecipientId: row.batchCallRecipientId,
	provider: row.provider,
	channel: row.channel,
	direction: row.direction,
	status: row.status,
	startedAt: row.startedAt,
	endedAt: row.endedAt,
	durationSecs: row.durationSecs,
	messageCount: row.messageCount,
	successStatus: row.successStatus,
	externalNumber: maskExternalNumber(row.externalNumber),
})

export const toConversationDetailDto = (row: Doc<'conversations'>) => ({
	...toConversationSummaryDto(row),
	acceptedAt: row.acceptedAt,
	usage: row.usage,
	hasAudio: row.hasAudio,
	terminationReason: row.terminationReason,
	summary: row.summary,
})

export const toConversationMessageDto = (row: Doc<'conversationMessages'>) => ({
	sequence: row.sequence,
	role: row.role,
	text: row.text,
	timeInCallSecs: row.timeInCallSecs,
	interrupted: row.interrupted,
	toolCalls: row.toolCalls?.map(({ callId, name }) => ({ callId, name })),
	toolResults: row.toolResults?.map(({ callId, isError, latencyMs }) => ({
		callId,
		isError,
		latencyMs,
		errorState: isError ? ('error' as const) : ('success' as const),
	})),
})
