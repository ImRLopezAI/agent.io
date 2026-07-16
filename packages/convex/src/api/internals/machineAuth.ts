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

export const hasValidMachineAuthorization = (
	authorization: string | undefined,
	expectedToken: string,
) => {
	if (!authorization?.startsWith('Bearer ')) return false
	const providedToken = authorization.slice('Bearer '.length)
	return (
		Boolean(providedToken) && serviceTokensMatch(providedToken, expectedToken)
	)
}
