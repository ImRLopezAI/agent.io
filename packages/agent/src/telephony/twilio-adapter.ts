import twilio from 'twilio'
import type { Twilio } from 'twilio'

import { TelephonyAdapter } from './base-adapter'
import type {
	NormalizedInboundCall,
	TelephonyCredentials,
	TelephonyDialArgs,
	TelephonyNumberPage,
	TelephonyNumberSummary,
	TelephonyPageArgs,
	TelephonyWebhookValidationArgs,
} from './types'

/**
 * Twilio implementation of the telephony contract, backed by the official
 * `twilio` SDK. The constructor receives the tenant connection's credentials
 * (accountSid + authToken from the `telephonyConnections` secret ref) and
 * builds a private, fully typed Twilio client — no structural casts, no
 * hand-rolled HTTP anywhere.
 */
export class TwilioTelephonyAdapter extends TelephonyAdapter {
	private readonly client: Twilio

	constructor(private readonly credentials: TelephonyCredentials) {
		super()
		this.client = twilio(credentials.accountSid, credentials.authToken)
	}

	override validateWebhook({
		url,
		signature,
		params,
	}: TelephonyWebhookValidationArgs): boolean {
		return twilio.validateRequest(
			this.credentials.authToken,
			signature,
			url,
			params,
		)
	}

	override parseInboundCall(
		params: Record<string, string>,
	): NormalizedInboundCall {
		const providerCallId = params.CallSid
		const to = params.To
		const from = params.From
		if (!providerCallId || !to || !from) {
			throw new Error('twilio_webhook_payload_invalid')
		}
		return {
			providerCallId,
			providerAccountId: params.AccountSid ?? this.credentials.accountSid,
			to,
			from,
			callStatus: params.CallStatus,
			raw: params,
		}
	}

	override async dial(
		args: TelephonyDialArgs,
	): Promise<{ providerCallId: string }> {
		if (!args.twiml && !args.url) {
			throw new Error('twilio_dial_requires_twiml_or_url')
		}
		const call = await this.client.calls.create({
			to: args.to,
			from: args.from,
			...(args.twiml ? { twiml: args.twiml } : {}),
			...(args.url ? { url: args.url } : {}),
			...(args.statusCallback ? { statusCallback: args.statusCallback } : {}),
			...(args.timeoutSecs ? { timeout: args.timeoutSecs } : {}),
		})
		return { providerCallId: call.sid }
	}

	override async hangup(providerCallId: string): Promise<void> {
		await this.client.calls(providerCallId).update({ status: 'completed' })
	}

	override async listNumbers(
		args?: TelephonyPageArgs,
	): Promise<TelephonyNumberPage> {
		const page = await this.client.incomingPhoneNumbers.page({
			// Small pages by default so a tenant with hundreds of numbers is
			// streamed page-by-page, never hauled into one response.
			pageSize: Math.min(args?.pageSize ?? 50, 100),
			...(args?.cursor ? { pageToken: args.cursor } : {}),
		})
		const cursor = page.nextPageUrl
			? new URL(page.nextPageUrl).searchParams.get('PageToken')
			: null
		return {
			numbers: page.instances.map((row) => this.toNumberSummary(row)),
			cursor,
		}
	}

	override async purchaseNumber(args: {
		number: string
	}): Promise<TelephonyNumberSummary> {
		const row = await this.client.incomingPhoneNumbers.create({
			phoneNumber: args.number,
		})
		return this.toNumberSummary(row)
	}

	private toNumberSummary(row: {
		sid: string
		phoneNumber: string
		capabilities?: { voice?: boolean; sms?: boolean }
	}): TelephonyNumberSummary {
		return {
			providerNumberId: row.sid,
			number: row.phoneNumber,
			capabilities: {
				voice: row.capabilities?.voice ?? false,
				sms: row.capabilities?.sms ?? false,
			},
		}
	}

	override async releaseNumber(providerNumberId: string): Promise<void> {
		await this.client.incomingPhoneNumbers(providerNumberId).remove()
	}
}
