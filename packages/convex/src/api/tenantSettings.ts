import { tenantSettings } from '@agent.io/domain/schemas'

import { now } from '../lib'
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
			await ctx.db.patch(existing._id, { ...patch, updatedAt: now() })
			return existing._id
		}
		return ctx.db.insert('tenantSettings', {
			recordingEnabled: false,
			...patch,
			tenant: ctx.tenant,
			createdAt: now(),
		})
	},
})
