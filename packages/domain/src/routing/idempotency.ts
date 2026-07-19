/**
 * Canonical idempotency fingerprint for conversation starts.
 *
 * Built only from durable caller-supplied identity (direction, owner,
 * provider, channel, destination codes). Volatile fields such as
 * `providerSessionId` and `externalNumber` are stored on the row but never
 * fingerprinted — provider redeliveries may vary them and must not conflict.
 * Keys are sorted and undefined values dropped so field order and optional
 * omission cannot change the fingerprint.
 */
export const conversationFingerprint = (
	fields: Record<string, string | undefined>,
): string =>
	JSON.stringify(
		Object.fromEntries(
			Object.entries(fields)
				.filter((entry): entry is [string, string] => entry[1] !== undefined)
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
		),
	)
