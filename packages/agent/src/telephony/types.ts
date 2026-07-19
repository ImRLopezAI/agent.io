/**
 * Provider-neutral telephony contract (mirrors the VoiceProvider pattern):
 * apps bind a concrete provider per telephony connection; credentials enter
 * at the binding, never as call args. Convex never imports this — provider
 * SDK calls stay in v-inbound, v-outbound, and the back-office server
 * (deployment-routing reference, Provider Boundary).
 */

export interface TelephonyCredentials {
	accountSid: string
	authToken: string
}

/** Normalized inbound webhook payload, ready for the machine inbound route. */
export interface NormalizedInboundCall {
	/** Provider call id (Twilio CallSid) — becomes `providerSessionId`. */
	providerCallId: string
	providerAccountId: string
	/** E.164 of the platform number that was called. */
	to: string
	/** E.164 of the caller — PII: never log; pass only to the machine API. */
	from: string
	callStatus?: string
	raw: Record<string, string>
}

export interface TelephonyNumberSummary {
	/** Provider-side number id (Twilio IncomingPhoneNumber SID). */
	providerNumberId: string
	number: string
	capabilities: { voice: boolean; sms: boolean }
}

export interface TelephonyPageArgs {
	/** Page size; adapters clamp to the provider's per-page maximum. */
	pageSize?: number
	/** Opaque provider cursor from the previous page, absent for page one. */
	cursor?: string
}

/**
 * One bounded page of provider numbers — inventory listings are always
 * cursor-paginated (mirrors `docs/reference/convex-data-services.md`); a
 * tenant with hundreds of numbers must never be collected into one response.
 */
export interface TelephonyNumberPage {
	numbers: TelephonyNumberSummary[]
	/** Cursor for the next page, or null when this is the last page. */
	cursor: string | null
}

export interface TelephonyDialArgs {
	/** Destination: E.164 number or `sip:` URI (OpenAI SIP leg). */
	to: string
	/** Caller ID: the selected platform number in E.164. */
	from: string
	/** Exactly one of `twiml` or `url` instructs the answered leg. */
	twiml?: string
	url?: string
	statusCallback?: string
	timeoutSecs?: number
}

export interface TelephonyWebhookValidationArgs {
	/** Exact public URL Twilio called (proxies/rewrites break validation). */
	url: string
	/** `X-Twilio-Signature` header value. */
	signature: string
	/** Form-encoded webhook params (the default Twilio webhook shape). */
	params: Record<string, string>
}
