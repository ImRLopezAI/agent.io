import { z } from 'zod'

import { now } from '../lib'
import { requirePermission, resolveTenantId, tenantMutation } from '../utils'

/**
 * Tenant-admin surface for batch call jobs. Only the Variant-override
 * lifecycle lives here — full batch CRUD is owned by the v-outbound plan.
 * Overrides bypass weighted allocation (ADR 0003), so authorization is
 * explicit: the override is persisted server-side with the authenticated
 * principal and a reason; machine start requests cannot carry one.
 */
export const setVariantOverride = tenantMutation({
	args: {
		batchId: z.string(),
		agentVariantOverrideId: z.string().nullable(),
		reason: z.string().min(1).max(500).optional(),
	},
	handler: async (ctx, args) => {
		requirePermission(ctx.org, 'prompts:write')
		const batchId = await resolveTenantId(
			ctx,
			'batchCallJobs',
			args.batchId,
			'Batch call job',
		)
		const batch = await ctx.db.get(batchId)
		if (!batch) throw new Error('Batch call job not found')
		if (args.agentVariantOverrideId === null) {
			await ctx.db.patch(batchId, {
				agentVariantOverrideId: undefined,
				overrideAuthorizedBy: undefined,
				overrideReason: undefined,
				updatedAt: now(),
			})
			return { override: null }
		}
		if (!args.reason) throw new Error('override reason required')
		const variantId = await resolveTenantId(
			ctx,
			'agentVariants',
			args.agentVariantOverrideId,
			'Agent Variant',
		)
		const variant = await ctx.db.get(variantId)
		if (
			!variant ||
			variant.agentId !== batch.agentId ||
			variant.archived ||
			!variant.publishedVersionId
		) {
			throw new Error('variant_override_not_allowed')
		}
		await ctx.db.patch(batchId, {
			agentVariantOverrideId: variantId,
			overrideAuthorizedBy: ctx.user.externalId ?? ctx.user.id,
			overrideReason: args.reason,
			updatedAt: now(),
		})
		return { override: variantId }
	},
})
