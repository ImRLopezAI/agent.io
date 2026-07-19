const EXPOSED_MACHINE_ERRORS = new Set([
	'agent_allocation_invalid',
	'agent_not_routable',
	'agent_variant_limit_exceeded',
	'batch_not_found',
	'batch_not_routable',
	'conversation_key_mismatch',
	'dial_failure_invalid',
	'idempotency_conflict',
	'inbound_workflow_disabled',
	'no_eligible_number',
	'outbound_workflow_disabled',
	'phone_number_not_routable',
	'published_version_invalid',
	'recipient_already_started',
	'terminal_state_conflict',
	'variant_not_published',
	'variant_override_not_allowed',
	'whatsapp_account_not_routable',
])

const CONFLICT_MACHINE_ERRORS = new Set([
	'idempotency_conflict',
	'terminal_state_conflict',
	'recipient_already_started',
])

/**
 * Error messages are `<code>` or `<code>:<detail>`. The only detail carried
 * today is the existing conversation id on `idempotency_conflict`, so a
 * conflicted caller can fetch the stored Conversation instead of dead-ending.
 * Anything unrecognized reduces to `machine_request_failed` — stack traces
 * and database details are never returned.
 */
export const toMachineError = (error: unknown) => {
	const message = error instanceof Error ? error.message : ''
	const separator = message.indexOf(':')
	const code = separator === -1 ? message : message.slice(0, separator)
	const detail = separator === -1 ? undefined : message.slice(separator + 1)
	if (!EXPOSED_MACHINE_ERRORS.has(code)) {
		return { code: 'machine_request_failed', status: 500 as const }
	}
	return {
		code,
		status: CONFLICT_MACHINE_ERRORS.has(code)
			? (409 as const)
			: code === 'conversation_key_mismatch'
				? (401 as const)
				: (422 as const),
		...(code === 'idempotency_conflict' && detail
			? { conversationId: detail }
			: {}),
	}
}
