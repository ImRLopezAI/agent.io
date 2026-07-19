import { v } from 'convex/values'

import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { now } from '../lib'
import { triggeredInternalMutation } from '../utils'

const destination = {
	destinationCountryCode: v.optional(v.string()),
	destinationRegionCode: v.optional(v.string()),
}

export const selectOutboundForRecipient = triggeredInternalMutation({
	args: {
		recipientId: v.id('batchCallRecipients'),
		...destination,
	},
	handler: async (ctx, args) => {
		const selected = await selectOutboundNumber(ctx, args)
		return {
			phoneNumberId: selected.phoneNumberId,
			reason: selected.reason,
		}
	},
})

export const selectOutboundNumber = async (
	ctx: Pick<MutationCtx, 'db'>,
	{
		recipientId,
		destinationCountryCode,
		destinationRegionCode,
	}: {
		recipientId: Id<'batchCallRecipients'>
		destinationCountryCode?: string
		destinationRegionCode?: string
	},
) => {
	const recipient = await ctx.db.get(recipientId)
	if (!recipient) throw new Error('batch recipient not found')
	if (recipient.selectedPhoneNumberId) {
		const selected = await ctx.db.get(recipient.selectedPhoneNumberId)
		const connection = selected
			? await ctx.db.get(selected.telephonyConnectionId)
			: null
		if (
			!selected ||
			selected.tenant !== recipient.tenant ||
			selected.status !== 'active' ||
			!selected.capabilities.outboundVoice ||
			!connection ||
			connection.tenant !== recipient.tenant ||
			connection.status !== 'active'
		) {
			throw new Error('no_eligible_number')
		}
		return {
			phoneNumberId: selected._id,
			number: selected,
			reason: recipient.callerIdSelectionReason ?? 'staged',
		}
	}
	const batch = await ctx.db.get(recipient.batchId)
	if (!batch || batch.tenant !== recipient.tenant) {
		throw new Error('batch job not found')
	}
	const matchedRule = batch.callerIdPolicy.rules.find(
		(rule) =>
			(!rule.destinationCountryCode ||
				rule.destinationCountryCode === destinationCountryCode) &&
			(!rule.destinationRegionCode ||
				rule.destinationRegionCode === destinationRegionCode),
	)
	const requestedId =
		matchedRule?.phoneNumberId ?? batch.callerIdPolicy.defaultPhoneNumberId
	const phoneNumberId = ctx.db.normalizeId('phoneNumbers', requestedId)
	if (!phoneNumberId) throw new Error('no_eligible_number')
	const number = await ctx.db.get(phoneNumberId)
	if (!number || number.tenant !== batch.tenant) {
		throw new Error('no_eligible_number')
	}
	const connection = await ctx.db.get(number.telephonyConnectionId)
	if (
		number.status !== 'active' ||
		!number.capabilities.outboundVoice ||
		!connection ||
		connection.tenant !== number.tenant ||
		connection.status !== 'active'
	) {
		throw new Error('no_eligible_number')
	}
	const reason = matchedRule ? `matched_rule:${matchedRule.id}` : 'default'
	await ctx.db.patch(recipient._id, {
		selectedPhoneNumberId: number._id,
		callerIdSelectionReason: reason,
		updatedAt: now(),
	})
	return { phoneNumberId: number._id, number, reason }
}
