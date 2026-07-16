import { describe, expect, test } from 'vite-plus/test'

import {
	batchCallRecipients,
	conversationMessages,
	conversations,
	kbDocuments,
	mcpConnections,
	phoneNumberInput,
	phoneNumbers,
	telephonyConnections,
	validateMcpConnection,
	whatsappAccounts,
} from '../index.ts'

describe('mcpConnections', () => {
	const base = {
		tenant: 'org_1',
		name: 'Composio',
		transport: 'sse',
		approvalPolicy: 'require_approval_all',
		toolApprovals: [],
		toolConfigOverrides: [],
		responseTimeoutSecs: 30,
		status: 'active',
	}

	test('composio and byo variants parse; cross-field validator enforces kind', () => {
		expect(
			mcpConnections.insertSchema.safeParse({
				...base,
				kind: 'composio',
				composioAccountId: 'ca_1',
				toolkitSlugs: ['gmail', 'hubspot'],
			}).success,
		).toBe(true)
		expect(
			mcpConnections.insertSchema.safeParse({
				...base,
				kind: 'byo',
				url: 'https://mcp.example.com',
			}).success,
		).toBe(true)
		expect(validateMcpConnection({ kind: 'byo' })).toMatch(/require url/)
		expect(validateMcpConnection({ kind: 'composio' })).toMatch(
			/composioAccountId/,
		)
	})

	test('responseTimeoutSecs bounds: 5/300 pass, 4/301 reject', () => {
		const mk = (secs: number) =>
			mcpConnections.insertSchema.safeParse({
				...base,
				kind: 'byo',
				url: 'https://x',
				responseTimeoutSecs: secs,
			}).success
		expect(mk(5)).toBe(true)
		expect(mk(300)).toBe(true)
		expect(mk(4)).toBe(false)
		expect(mk(301)).toBe(false)
	})

	test('secret headers accept literal or secretRef pointer only', () => {
		const mk = (headers: unknown) =>
			mcpConnections.insertSchema.safeParse({
				...base,
				kind: 'byo',
				url: 'https://x',
				requestHeaders: headers,
			}).success
		expect(mk({ authorization: { secretRef: 'sec_1' } })).toBe(true)
		expect(mk({ authorization: 'Bearer literal' })).toBe(true)
		expect(mk({ authorization: { raw: 'nope' } })).toBe(false)
	})
})

describe('Knowledge Base', () => {
	test('document is a minimal component-entry registry', () => {
		expect(Object.keys(kbDocuments.insertSchema.shape).sort()).toEqual([
			'activeEntryId',
			'archived',
			'archivedAt',
			'lastError',
			'tenant',
		])
		expect(
			kbDocuments.insertSchema.safeParse({
				tenant: 'org_1',
				activeEntryId: 'entry_1',
			}).success,
		).toBe(true)
	})
})

describe('conversations substrate', () => {
	const conversation = {
		tenant: 'org_1',
		conversationKey: 'conversation_1',
		idempotencyFingerprint: 'fingerprint_1',
		agentId: 'agents_1',
		agentVariantId: 'agentVariants_1',
		agentVersionId: 'agentVersions_1',
		allocationMode: 'direct',
		workflow: 'inbound',
		provider: 'openai',
		channel: 'voice_inbound',
		direction: 'inbound',
		status: 'initiated',
		startedAt: '2026-07-05T00:00:00Z',
		hasAudio: false,
		messageCount: 0,
	}

	test('full conversation parses; unknown channel rejects', () => {
		expect(conversations.insertSchema.safeParse(conversation).success).toBe(
			true,
		)
		expect(
			conversations.insertSchema.safeParse({
				...conversation,
				channel: 'carrier_pigeon',
			}).success,
		).toBe(false)
	})

	test('tool-only turn (no text) is valid', () => {
		expect(
			conversationMessages.insertSchema.safeParse({
				tenant: 'org_1',
				conversationId: 'conversations_1',
				agentId: 'agents_1',
				agentVariantId: 'agentVariants_1',
				sequence: 1,
				role: 'agent',
				toolCalls: [{ callId: 'c1', name: 'end_call', argsJson: '{}' }],
				interrupted: false,
			}).success,
		).toBe(true)
	})
})

describe('Telephony + batch + operational', () => {
	const connection = {
		tenant: 'org_1',
		provider: 'twilio' as const,
		label: 'Primary Twilio',
		providerAccountId: 'AC123',
		credentialSecretRef: 'secret_twilio_1',
		status: 'active' as const,
	}
	const number = {
		tenant: 'org_1',
		telephonyConnectionId: 'telephonyConnections_1',
		providerNumberId: 'PN123',
		number: '+15551234567',
		provider: 'twilio' as const,
		label: 'New York',
		countryCode: 'US',
		regionCode: 'NY',
		locality: 'New York',
		capabilities: {
			inboundVoice: true,
			outboundVoice: true,
			inboundSms: true,
			outboundSms: true,
		},
		inboundSmsEnabled: true,
		status: 'active' as const,
	}

	test('telephony connection stores a secret reference, never raw credentials', () => {
		expect(
			telephonyConnections.insertSchema.safeParse(connection).success,
		).toBe(true)
		expect(
			telephonyConnections.insertSchema.safeParse({
				...connection,
				credentialSecretRef: '',
			}).success,
		).toBe(false)
		expect(Object.keys(telephonyConnections.insertSchema.shape)).not.toContain(
			'authToken',
		)
	})

	test('phone number validates E.164, ISO country, and SMS capability', () => {
		const mk = (over: Record<string, unknown>) =>
			phoneNumberInput.safeParse({ ...number, ...over }).success
		expect(mk({})).toBe(true)
		expect(mk({ number: '5551234567' })).toBe(false)
		expect(mk({ countryCode: 'USA' })).toBe(false)
		expect(mk({ countryCode: 'us' })).toBe(false)
		expect(
			mk({
				capabilities: { ...number.capabilities, inboundSms: false },
				inboundSmsEnabled: true,
			}),
		).toBe(false)
	})

	test('connection and number lifecycle values are explicit', () => {
		for (const status of [
			'pending_verification',
			'active',
			'disabled',
			'error',
			'archived',
		]) {
			expect(
				telephonyConnections.insertSchema.safeParse({ ...connection, status })
					.success,
			).toBe(true)
		}
		for (const status of [
			'pending',
			'active',
			'disabled',
			'provider_missing',
			'archived',
		]) {
			expect(
				phoneNumbers.insertSchema.safeParse({ ...number, status }).success,
			).toBe(true)
		}
	})

	test('whatsappAccounts: multiple rows per tenant; secretRef required, no raw token', () => {
		const base = {
			tenant: 'org_1',
			businessAccountId: 'waba_1',
			phoneNumberName: '',
			label: '',
			enableMessaging: true,
			enableAudioMessageResponse: true,
			accessTokenSecretRef: 'sec_wa_1',
			status: 'active' as const,
		}
		const a = whatsappAccounts.insertSchema.safeParse({
			...base,
			metaPhoneNumberId: 'meta_pn_1',
			phoneNumber: '+15551234567',
			assignedAgentId: 'agents_1',
		})
		const b = whatsappAccounts.insertSchema.safeParse({
			...base,
			metaPhoneNumberId: 'meta_pn_2',
			phoneNumber: '+15557654321',
		})
		expect(a.success).toBe(true)
		expect(b.success).toBe(true)

		expect(
			whatsappAccounts.insertSchema.safeParse({
				...base,
				metaPhoneNumberId: 'meta_pn_3',
				accessTokenSecretRef: '',
			}).success,
		).toBe(false)

		// conversation can pin the owning WhatsApp account (channel ref)
		expect(
			conversations.insertSchema.safeParse({
				tenant: 'org_1',
				conversationKey: 'conversation_2',
				idempotencyFingerprint: 'fingerprint_2',
				agentId: 'agents_1',
				agentVariantId: 'agentVariants_1',
				agentVersionId: 'agentVersions_1',
				allocationMode: 'direct',
				workflow: 'none',
				provider: 'openai',
				channel: 'whatsapp',
				direction: 'inbound',
				status: 'initiated',
				startedAt: '2026-07-05T00:00:00Z',
				hasAudio: false,
				messageCount: 0,
				whatsappAccountId: 'whatsappAccounts_1',
			}).success,
		).toBe(true)
	})

	test('recipient status covers the full lifecycle', () => {
		for (const status of [
			'pending',
			'dispatched',
			'initiated',
			'in_progress',
			'completed',
			'failed',
			'cancelled',
			'voicemail',
		]) {
			expect(
				batchCallRecipients.insertSchema.safeParse({
					tenant: 'org_1',
					batchId: 'batchCallJobs_1',
					phoneNumber: '+15550001111',
					status,
				}).success,
			).toBe(true)
		}
	})
})
