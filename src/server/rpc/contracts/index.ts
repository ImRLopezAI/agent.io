import { healthContract } from './health.contract'
import { workOsContract } from './work-os.contract'

/**
 * The application API contract — the single source of truth for routes,
 * input/output schemas, and errors. The server implements it (`implement`),
 * the OpenAPI handler generates docs from it, and the browser client links
 * against it. Pure (no server imports), so importing it on the client pulls in
 * zero server code.
 */
export const contract = {
	health: healthContract,
	workOs: workOsContract,
}

export type AppContract = typeof contract
