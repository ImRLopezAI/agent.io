/** Constant-work comparison for service tokens without exposing either value. */
export const serviceTokensMatch = (provided: string, expected: string) => {
	const length = Math.max(provided.length, expected.length)
	let difference = provided.length ^ expected.length
	for (let index = 0; index < length; index += 1) {
		difference |=
			(provided.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0)
	}
	return difference === 0
}

export type MachineServiceEntry = { service: string; token: string }

/**
 * `CONVEX_SERVICE_TOKENS` holds comma-separated `<service>:<token>` entries
 * (e.g. `v-inbound:...,v-outbound:...`). Rotation lists two entries for the
 * same service; revocation removes that service's entries. Tokens may contain
 * colons — only the first separates the service name. Malformed entries are
 * ignored rather than failing the whole surface.
 */
export const parseServiceTokens = (
	raw: string | undefined,
): MachineServiceEntry[] =>
	(raw ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
		.flatMap((entry) => {
			const separator = entry.indexOf(':')
			if (separator <= 0 || separator === entry.length - 1) return []
			return [
				{
					service: entry.slice(0, separator),
					token: entry.slice(separator + 1),
				},
			]
		})

/**
 * Resolves the calling service from a bearer token, or undefined when the
 * request is unauthorized. Every entry is compared (no early exit). A token
 * value listed under more than one service name is a misconfiguration: only
 * requests presenting that value are rejected — entries with unique values
 * keep authenticating, so a rotation-window paste mistake cannot lock out the
 * whole machine surface.
 */
export const resolveMachineService = (
	authorization: string | undefined,
	rawServiceTokens: string | undefined,
): string | undefined => {
	if (!authorization?.startsWith('Bearer ')) return undefined
	const providedToken = authorization.slice('Bearer '.length)
	if (!providedToken) return undefined
	const matchedServices = new Set<string>()
	for (const entry of parseServiceTokens(rawServiceTokens)) {
		if (serviceTokensMatch(providedToken, entry.token)) {
			matchedServices.add(entry.service)
		}
	}
	if (matchedServices.size !== 1) return undefined
	return [...matchedServices][0]
}
