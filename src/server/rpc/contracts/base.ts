import { oc } from '@orpc/contract'

import { baseErrors } from './errors'

interface Metadata {
	cache?: boolean
}
/**
 * Base contract builder — every procedure contract starts from here so it
 * inherits the shared error map. Pure schema layer: this module (and the whole
 * `src/contract` tree) must never import server code, so it is safe to ship to
 * the browser as the typed client's source of truth.
 */
export const base = oc.$meta<Metadata>({ cache: true }).errors(baseErrors)
