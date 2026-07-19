import twilio from 'twilio'
import { describe, expect, test } from 'vite-plus/test'

import { TelephonyAdapter } from '../base-adapter'
import { TwilioTelephonyAdapter } from '../twilio-adapter'

const credentials = { accountSid: 'AC_test', authToken: 'auth_token_test' }
const webhookUrl = 'https://v-inbound.example.com/twilio/voice'

const inboundParams = {
	CallSid: 'CA_1234567890',
	AccountSid: 'AC_test',
	To: '+15551234567',
	From: '+18095550001',
	CallStatus: 'ringing',
}

describe('TelephonyAdapter (base)', () => {
	test('every unimplemented method fails loud, never silently', () => {
		const base = new TelephonyAdapter()
		expect(() =>
			base.validateWebhook({ url: '', signature: '', params: {} }),
		).toThrow(/telephony_not_implemented:validateWebhook/)
		expect(() => base.parseInboundCall({})).toThrow(
			/telephony_not_implemented:parseInboundCall/,
		)
		expect(() => base.dial({ to: '', from: '' })).toThrow(
			/telephony_not_implemented:dial/,
		)
		expect(() => base.hangup('CA_x')).toThrow(
			/telephony_not_implemented:hangup/,
		)
		expect(() => base.listNumbers()).toThrow(
			/telephony_not_implemented:listNumbers/,
		)
		expect(() => base.purchaseNumber({ number: '+1' })).toThrow(
			/telephony_not_implemented:purchaseNumber/,
		)
		expect(() => base.releaseNumber('PN_x')).toThrow(
			/telephony_not_implemented:releaseNumber/,
		)
	})
})

describe('TwilioTelephonyAdapter', () => {
	test('is substitutable for the base adapter', () => {
		const adapter: TelephonyAdapter = new TwilioTelephonyAdapter(credentials)
		expect(adapter).toBeInstanceOf(TelephonyAdapter)
	})

	test('accepts a genuinely signed webhook and rejects tampering', () => {
		const adapter = new TwilioTelephonyAdapter(credentials)
		const signature = twilio.getExpectedTwilioSignature(
			credentials.authToken,
			webhookUrl,
			inboundParams,
		)
		expect(
			adapter.validateWebhook({
				url: webhookUrl,
				signature,
				params: inboundParams,
			}),
		).toBe(true)
		expect(
			adapter.validateWebhook({
				url: webhookUrl,
				signature,
				params: { ...inboundParams, From: '+10000000000' },
			}),
		).toBe(false)
		expect(
			adapter.validateWebhook({
				url: 'https://attacker.example.com/twilio/voice',
				signature,
				params: inboundParams,
			}),
		).toBe(false)
	})

	test('normalizes an inbound call and rejects incomplete payloads', () => {
		const adapter = new TwilioTelephonyAdapter(credentials)
		const call = adapter.parseInboundCall(inboundParams)
		expect(call).toMatchObject({
			providerCallId: 'CA_1234567890',
			providerAccountId: 'AC_test',
			to: '+15551234567',
			from: '+18095550001',
			callStatus: 'ringing',
		})
		expect(() =>
			adapter.parseInboundCall({ To: '+15551234567', From: '+1809' }),
		).toThrow(/twilio_webhook_payload_invalid/)
	})

	test('dial refuses to place an uninstructed call', async () => {
		const adapter = new TwilioTelephonyAdapter(credentials)
		await expect(
			adapter.dial({ to: '+18095550001', from: '+15551234567' }),
		).rejects.toThrow(/twilio_dial_requires_twiml_or_url/)
	})
})
