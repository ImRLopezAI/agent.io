import { triggers } from '../triggers'

/**
 * Trigger registrations — run in the same transaction as the write, via any
 * triggers-wrapped builder (public mutation, tenantMutation,
 * triggeredInternalMutation → the whole crud tier).
 */

// Cascade: deleting an agent removes its Variants and versions.
triggers.register('agents', async (ctx, change) => {
	if (change.operation !== 'delete') return
	const variants = await ctx.db
		.query('agentVariants')
		.withIndex('by_agent', (q) => q.eq('agentId', change.id))
		.collect()
	for (const variant of variants) {
		await ctx.db.delete(variant._id)
	}
	const versions = await ctx.db
		.query('agentVersions')
		.withIndex('by_agent', (q) => q.eq('agentId', change.id))
		.collect()
	for (const version of versions) {
		await ctx.db.delete(version._id)
	}
})

triggers.register('agentVariants', async (ctx, change) => {
	if (change.operation !== 'delete') return
	const procedures = await ctx.db
		.query('procedures')
		.withIndex('by_variant', (q) => q.eq('agentVariantId', change.id))
		.collect()
	for (const procedure of procedures) await ctx.db.delete(procedure._id)
})

// Reference health: deleting a procedure flips referencing procedures'
// procedure-target references to invalid.
triggers.register('procedures', async (ctx, change) => {
	if (change.operation !== 'delete' || !change.oldDoc) return
	const siblings = await ctx.db
		.query('procedures')
		.withIndex('by_variant', (q) =>
			q.eq('agentVariantId', change.oldDoc.agentVariantId),
		)
		.collect()
	for (const sibling of siblings) {
		if (sibling._id === change.id) continue
		const references = sibling.references.map((ref) =>
			ref.targetType === 'procedure' && ref.targetId === change.id
				? { ...ref, health: 'invalid' as const }
				: ref,
		)
		if (JSON.stringify(references) !== JSON.stringify(sibling.references)) {
			await ctx.db.patch(sibling._id, { references })
		}
	}
})

// Batch counters: recipients roll up onto the job.
triggers.register('batchCallRecipients', async (ctx, change) => {
	const FINISHED = new Set(['completed', 'failed', 'cancelled', 'voicemail'])
	if (change.operation === 'insert' && change.newDoc) {
		const job = await ctx.db.get(change.newDoc.batchId)
		if (job) {
			await ctx.db.patch(job._id, { totalScheduled: job.totalScheduled + 1 })
		}
	}
	if (change.operation === 'update' && change.newDoc && change.oldDoc) {
		const was = FINISHED.has(change.oldDoc.status)
		const is = FINISHED.has(change.newDoc.status)
		if (!was && is) {
			const job = await ctx.db.get(change.newDoc.batchId)
			if (job) {
				await ctx.db.patch(job._id, { totalFinished: job.totalFinished + 1 })
			}
		}
	}
})
