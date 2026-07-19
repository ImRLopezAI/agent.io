import { AGENT_TRAFFIC_BPS_TOTAL } from '../schemas/agents.ts'

export interface VariantAllocation {
	variantId: string
	allocationOrdinal: number
	weightBps: number
}

export interface VariantSelection {
	variantId: string
	bucket: number
}

/** FNV-1a gives a portable unsigned 32-bit hash across Node and Convex. */
export const hashConversationKey = (conversationKey: string) => {
	let hash = 0x811c9dc5
	for (let index = 0; index < conversationKey.length; index += 1) {
		hash ^= conversationKey.charCodeAt(index)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0) % AGENT_TRAFFIC_BPS_TOTAL
}

export const validateVariantAllocation = (
	allocation: readonly VariantAllocation[],
): string | null => {
	if (allocation.length === 0) return 'allocation must include a Variant'
	const variantIds = new Set<string>()
	const ordinals = new Set<number>()
	let total = 0
	for (const item of allocation) {
		if (variantIds.has(item.variantId)) return 'duplicate Variant in allocation'
		if (ordinals.has(item.allocationOrdinal)) {
			return 'duplicate allocation ordinal'
		}
		if (
			!Number.isInteger(item.allocationOrdinal) ||
			item.allocationOrdinal <= 0
		) {
			return 'allocation ordinal must be a positive integer'
		}
		if (
			!Number.isInteger(item.weightBps) ||
			item.weightBps < 0 ||
			item.weightBps > AGENT_TRAFFIC_BPS_TOTAL
		) {
			return 'Variant weight must be an integer from 0 to 10,000'
		}
		variantIds.add(item.variantId)
		ordinals.add(item.allocationOrdinal)
		total += item.weightBps
	}
	if (total !== AGENT_TRAFFIC_BPS_TOTAL) {
		return 'Variant traffic allocation must total exactly 10,000 basis points'
	}
	return null
}

export const selectVariantForConversation = (
	conversationKey: string,
	allocation: readonly VariantAllocation[],
): VariantSelection => {
	const violation = validateVariantAllocation(allocation)
	if (violation) throw new Error(violation)
	const bucket = hashConversationKey(conversationKey)
	let upperBound = 0
	for (const item of [...allocation].sort(
		(a, b) => a.allocationOrdinal - b.allocationOrdinal,
	)) {
		upperBound += item.weightBps
		if (bucket < upperBound) return { variantId: item.variantId, bucket }
	}
	throw new Error('Variant allocation did not cover the selected bucket')
}
