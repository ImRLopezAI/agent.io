import { Triggers } from 'convex-helpers/server/triggers'

import type { DataModel } from './_generated/dataModel'

/**
 * Single Triggers instance for the deployment. Registrations live next to the
 * domain api modules (cascade deletes, denormalized counters, reference
 * health) and run at module load; the instance is wired into every mutation
 * builder in utils.ts — including the internal builder that the generated
 * crud tier receives — so no write path bypasses triggers.
 */
export const triggers = new Triggers<DataModel>()
