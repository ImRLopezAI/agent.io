import { AuthKit } from '@convex-dev/workos-authkit'

import { components, internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
	additionalEventTypes: [
		'organization.created',
		'organization.updated',
		'organization.deleted',
	],
})

/** Run once after enabling webhooks: `bunx convex run auth:backfillUsers` */
export const { backfillUsers } = authKit.utils()

export const { authKitEvent } = authKit.events({
	'organization.created': async (ctx, event) => {
		await ctx.scheduler.runAfter(0, internal.workos.ensureCustomerRoleOnOrg, {
			organizationId: event.data.id,
		})
	},
})
