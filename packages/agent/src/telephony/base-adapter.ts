import type {
	NormalizedInboundCall,
	TelephonyDialArgs,
	TelephonyNumberPage,
	TelephonyNumberSummary,
	TelephonyPageArgs,
	TelephonyWebhookValidationArgs,
} from './types'

export class TelephonyNotImplementedError extends Error {
	constructor(method: string) {
		super(`telephony_not_implemented:${method}`)
		this.name = 'TelephonyNotImplementedError'
	}
}

/**
 * Base telephony adapter. Concrete providers extend it (Liskov: callers hold
 * a `TelephonyAdapter` and never care which provider is behind it), pass the
 * base an empty constructor, and override the methods they support. Anything
 * not overridden fails loud with `telephony_not_implemented:<method>` instead
 * of silently pretending — partial provider support stays visible.
 *
 * Credentials are NOT part of the base contract: each concrete adapter takes
 * its own credentials in its constructor (resolved by the caller from the
 * tenant's `telephonyConnections` row / secret ref — they originate in
 * Convex/back-office, never from platform-wide env).
 */
export class TelephonyAdapter {
	validateWebhook(_args: TelephonyWebhookValidationArgs): boolean {
		throw new TelephonyNotImplementedError('validateWebhook')
	}

	parseInboundCall(_params: Record<string, string>): NormalizedInboundCall {
		throw new TelephonyNotImplementedError('parseInboundCall')
	}

	dial(_args: TelephonyDialArgs): Promise<{ providerCallId: string }> {
		throw new TelephonyNotImplementedError('dial')
	}

	hangup(_providerCallId: string): Promise<void> {
		throw new TelephonyNotImplementedError('hangup')
	}

	listNumbers(_args?: TelephonyPageArgs): Promise<TelephonyNumberPage> {
		throw new TelephonyNotImplementedError('listNumbers')
	}

	purchaseNumber(_args: { number: string }): Promise<TelephonyNumberSummary> {
		throw new TelephonyNotImplementedError('purchaseNumber')
	}

	releaseNumber(_providerNumberId: string): Promise<void> {
		throw new TelephonyNotImplementedError('releaseNumber')
	}
}
