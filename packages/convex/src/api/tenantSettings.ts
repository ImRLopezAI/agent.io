import { tenantSettings } from '@agent.io/domain/schemas'
import { internal } from '@convex/api'

import { stampCreate, stampUpdate } from '../lib'
import { tenantMutation, tenantQuery } from '../utils'

/** One row per tenant; absence = platform defaults. */
export const get = tenantQuery({
	args: {},
	handler: async (ctx) =>
		ctx.db
			.query('tenantSettings')
			.withIndex('by_tenant', (q) => q.eq('tenant', ctx.tenant))
			.unique(),
})

export const patch = tenantMutation({
	args: tenantSettings.update({ tenant: true }).shape,
	handler: async (ctx, patch) => {
		const existing = await ctx.db
			.query('tenantSettings')
			.withIndex('by_tenant', (q) => q.eq('tenant', ctx.tenant))
			.unique()
		if (existing) {
			await ctx.runMutation(internal.api.crud.tenantSettings.update, {
				id: existing._id,
				patch: stampUpdate(patch),
			})
			return existing._id
		}
		const created = await ctx.runMutation(
			internal.api.crud.tenantSettings.create,
			stampCreate(ctx.tenant, { recordingEnabled: false, ...patch }),
		)
		return created._id
	},
})
