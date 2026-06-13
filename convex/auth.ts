import { AuthKit } from '@convex-dev/workos-authkit'
import { components } from './_generated/api'
import type { DataModel } from './_generated/dataModel'

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {})

/** Run once after enabling webhooks: `bunx convex run auth:backfillUsers` */
export const { backfillUsers } = authKit.utils()

export const { authKitEvent } = authKit.events({})
