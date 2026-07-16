const EXPOSED_MACHINE_ERRORS = new Set([
	'agent_allocation_invalid',
	'agent_not_routable',
	'agent_variant_limit_exceeded',
	'batch_not_found',
	'batch_not_routable',
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

export const toMachineError = (error: unknown) => {
	const code = error instanceof Error ? error.message : ''
	return {
		code: EXPOSED_MACHINE_ERRORS.has(code) ? code : 'machine_request_failed',
		status: EXPOSED_MACHINE_ERRORS.has(code)
			? code === 'idempotency_conflict' ||
				code === 'terminal_state_conflict' ||
				code === 'recipient_already_started'
				? 409
				: 422
			: 500,
	}
}
