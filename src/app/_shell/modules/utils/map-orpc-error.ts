import { ORPCError } from '@orpc/client'
import type { FieldValues, UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'

/**
 * Typed contract error codes (from `src/server/rpc/contracts/errors.ts`) that
 * bind to a specific form field rather than a toast. Extend this map to route
 * additional codes onto fields as new field-bound failure modes appear.
 *
 * `CONFLICT` is currently the only field-bound code: a duplicate
 * invite/membership surfaces on the `email` field of the invite form.
 */
const FIELD_BOUND_CODES: Record<string, string> = {
	CONFLICT: 'email',
}

/**
 * Surface an error thrown by an oRPC procedure.
 *
 * - `ORPCError` whose code is field-bound and a form is supplied →
 *   `form.setError(field, …)` so the message renders inline.
 * - Any other `ORPCError` → `toast.error(message)` (e.g.
 *   `NO_ADMIN_ROLE`, `NO_ACTIVE_ORGANIZATION`, `FORBIDDEN`).
 * - Non-typed / unknown error → generic `toast.error`.
 */
export function mapOrpcError<TFieldValues extends FieldValues = FieldValues>(
	err: unknown,
	form?: UseFormReturn<TFieldValues>,
): void {
	if (err instanceof ORPCError) {
		const field = FIELD_BOUND_CODES[err.code]
		if (field && form) {
			form.setError(field as Parameters<typeof form.setError>[0], {
				type: 'server',
				message: err.message,
			})
			return
		}
		toast.error(err.message)
		return
	}
	toast.error('Something went wrong')
}
